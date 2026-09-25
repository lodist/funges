#!/usr/bin/env python3
"""Build host-tree cover grids (EU tree genus map, US forest type groups) and upload to R2.

A mycorrhizal mushroom fruits only near its host trees. For every host class in
content/species/_host_classes.json these grids hold the share of the ground
around each 0.05° cell that the class covers. Manifests name each species' hosts
(`scoring.hosts`) and the pipeline sums them at scoring time, so a host list can
change without a rebuild. The sources are static maps: rebuild only when one
publishes a new version.
"""
import argparse
import io
import json
import urllib.request
import zipfile
from pathlib import Path

import numpy as np
import rasterio
from pyproj import Transformer
from rasterio.windows import Window

import build_range_priors as brp
from range_prior import COVER_SCALE

_ROOT = Path(__file__).resolve().parents[2]
CLASSES = json.loads((_ROOT / "content" / "species" / "_host_classes.json").read_text(encoding="utf-8"))

STEP = 0.05  # ~5 km: host stands vary on the scale of a forage walk, not a region
SMOOTH_KM = 5.0
EU_RECORD = "https://zenodo.org/api/records/13341104"
EU_OVERVIEW = 8  # read the 10 m COGs at their 80 m overview: ~3,000 pixels per cell
US_ZIP = "https://data.fs.usda.gov/geodata/rastergateway/forest_type/conus_forestgroup.zip"
US_MEMBER = "conus_forestgroup.img"
MACROS = {
    "EU": dict(brp.MACROS["EU"], env="EU_HOST_COVER"),
    "US": dict(brp.MACROS["US"], env="US_HOST_COVER"),
}


def grid_shape(macro):
    return (round((macro["lat"][1] - macro["lat"][0]) / STEP),
            round((macro["lon"][1] - macro["lon"][0]) / STEP))


def download(url, dest, size=None):
    if dest.exists() and (size is None or dest.stat().st_size == size):
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    with urllib.request.urlopen(url, timeout=300) as r, open(tmp, "wb") as fh:
        while chunk := r.read(1 << 20):
            fh.write(chunk)
    tmp.replace(dest)
    return dest


def bin_pixels(counts, total, macro, to_lonlat, transform, arr, nodata, codes):
    """Add one raster block's pixels to the per-class and total counts of the 0.05° grid."""
    rows, cols = arr.shape
    xs = transform.c + (np.arange(cols) + 0.5) * transform.a
    ys = transform.f + (np.arange(rows) + 0.5) * transform.e
    lon, lat = to_lonlat.transform(*(g.ravel() for g in np.meshgrid(xs, ys)))
    shape = grid_shape(macro)
    i = np.floor((lat - macro["lat"][0]) / STEP).astype(np.int64)
    j = np.floor((lon - macro["lon"][0]) / STEP).astype(np.int64)
    values = arr.ravel()
    keep = (i >= 0) & (i < shape[0]) & (j >= 0) & (j < shape[1])
    if nodata is not None:
        keep &= values != nodata
    cell, values = (i * shape[1] + j)[keep], values[keep]
    n = shape[0] * shape[1]
    total += np.bincount(cell, minlength=n).reshape(shape)
    for name, code in codes.items():
        counts[name] += np.bincount(cell[values == code], minlength=n).reshape(shape)


def eu_counts(cache):
    macro, codes = MACROS["EU"], CLASSES["EU"]["classes"]
    counts = {name: np.zeros(grid_shape(macro)) for name in codes}
    total = np.zeros(grid_shape(macro))
    files = json.load(urllib.request.urlopen(EU_RECORD, timeout=60))["files"]
    for f in sorted(files, key=lambda f: f["key"]):
        if not f["key"].endswith(".zip"):
            continue
        path = download(f["links"]["self"], cache / "EU" / f["key"], f["size"])
        members = [m for m in zipfile.ZipFile(path).namelist() if m.endswith(".tif")]
        for member in members:
            with rasterio.open(f"zip://{path.as_posix()}!{member}") as r:
                out = (r.height // EU_OVERVIEW, r.width // EU_OVERVIEW)
                arr = r.read(1, out_shape=out)
                transform = r.transform * r.transform.scale(r.width / out[1], r.height / out[0])
                to_lonlat = Transformer.from_crs(r.crs, "EPSG:4326", always_xy=True)
                bin_pixels(counts, total, macro, to_lonlat, transform, arr, r.nodata, codes)
        print(f"  {f['key']}: {len(members)} tiles", flush=True)
    return counts, total


def us_counts(cache, block_rows=512):
    macro, codes = MACROS["US"], CLASSES["US"]["classes"]
    counts = {name: np.zeros(grid_shape(macro)) for name in codes}
    total = np.zeros(grid_shape(macro))
    path = download(US_ZIP, cache / "US" / "conus_forestgroup.zip")
    # 0 is non-forest, including water and the ground outside the conterminous US;
    # it counts towards the ground a cell covers, so coasts read as partly unforested.
    with rasterio.open(f"zip://{path.as_posix()}!{US_MEMBER}") as r:
        to_lonlat = Transformer.from_crs(r.crs, "EPSG:4326", always_xy=True)
        for row in range(0, r.height, block_rows):
            window = Window(0, row, r.width, min(block_rows, r.height - row))
            bin_pixels(counts, total, macro, to_lonlat, r.window_transform(window), r.read(1, window=window), None, codes)
    return counts, total


def cover_grids(macro, counts, total):
    """{class: share of the surrounding ground}, smoothed over SMOOTH_KM."""
    lats = macro["lat"][0] + (np.arange(grid_shape(macro)[0]) + 0.5) * STEP
    ground = brp.smooth_counts(total, lats, SMOOTH_KM, STEP)
    with np.errstate(invalid="ignore", divide="ignore"):
        return {name: np.nan_to_num(brp.smooth_counts(c, lats, SMOOTH_KM, STEP) / ground)
                for name, c in counts.items()}


def to_npz(macro, cover, total):
    buf = io.BytesIO()
    names = list(cover)
    np.savez_compressed(
        buf, lat0=macro["lat"][0], lon0=macro["lon"][0], step=STEP, classes=np.array(names),
        # Cells the source map does not reach (the EU map stops short of Turkey) are
        # unknown, not treeless.
        mapped=total > 0,
        cover=np.stack([np.rint(np.clip(cover[n], 0, 1) * COVER_SCALE).astype(np.uint16) for n in names]),
    )
    return buf.getvalue()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cache-dir", required=True, help="where the source maps are downloaded (~7 GB)")
    ap.add_argument("--local-only", action="store_true", help="write to --out-dir instead of R2")
    ap.add_argument("--out-dir", default=".")
    ap.add_argument("--macro", choices=list(MACROS), action="append", help="default: both")
    args = ap.parse_args()
    curves = brp._curves()
    curves.load_dotenv(_ROOT / ".env")
    curves.load_dotenv(_ROOT / ".env.secret")
    for code in args.macro or list(MACROS):
        macro = MACROS[code]
        print(f"[{code}] binning host classes...", flush=True)
        counts, total = (eu_counts if code == "EU" else us_counts)(Path(args.cache_dir))
        payload = to_npz(macro, cover_grids(macro, counts, total), total)
        dest = (str(Path(args.out_dir) / f"{code}_host_cover.npz") if args.local_only
                else curves.get_required_env(macro["env"]))
        brp.save(payload, dest)


if __name__ == "__main__":
    main()
