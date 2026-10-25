#!/usr/bin/env python3
"""The season atlas files the site serves, into public/season-atlas/ (run before the Vite build).

From backend/generated/season_atlas.json (build_season_atlas.py) and the season grids it was
built from: index.json (the places and their species), <place>.json (outline, image extent,
each species' 12-month curve) and per species one 12-frame image, the same in both themes. The
browser gets coloured maps and curves only, never the grid itself.

    python scripts/build_season_atlas_site.py                # grids from R2 (CI: read-only key)
    python scripts/build_season_atlas_site.py --grids DIR    # local copies of the npz files
    python scripts/build_season_atlas_site.py --pages dist   # after the Vite build: the atlas URLs
"""
import argparse
import hashlib
import io
import json
import shutil
import sys
import warnings
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "backend" / "tools"))
import r2  # noqa: E402
from build_season_atlas import slug  # noqa: E402

OUT = ROOT / "public" / "season-atlas"
# Nothing to the local peak: one hue from the dark map's mint (#8fd6bb), dark teal lit up to
# near-white, the same in both themes. Not the scores' cream-to-burgundy ramp.
TEAL = ["#082a24", "#0e4037", "#165c4d", "#237a65", "#3a9a7f", "#5fb99c", "#8fd6bb", "#bfe8da", "#e3f4ee"]
CONTINENTS = {"EU": ("europe", "Europe"), "US": ("united-states", "United States")}
# URL slugs where the display name is not what people search ("Morchella", "Black Trumpet (Horn
# of Plenty)"); a slug is a URL, so changing one later breaks links.
SLUG_OVERRIDES = {"morel": "morel", "black_chant": "black-trumpet"}
# Grid cells per map pixel and colour steps. The grid is smooth by construction (a ~50 km
# kernel), so 2x2 cells in 24 steps look the same once the browser smooths them (10 steps
# banded on dark ground), and the images are ~6x smaller. It is for speed: the values still
# decode to within a few percent.
CELLS = 2
LEVELS = 24


def hex_rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def lut():
    stops = np.array([hex_rgb(h) for h in TEAL], float)
    t = np.arange(255) / 254 * (len(stops) - 1)
    k = np.minimum(t.astype(int), len(stops) - 2)
    f = (t - k)[:, None]
    return np.rint(stops[k] * (1 - f) + stops[k + 1] * f).astype(np.uint8)


def sprite(ratio):
    """(12, h, w) uint8 season ratio (255 = no curve) -> (12h, w, 4) RGBA, January on top."""
    frames = ratio.reshape(-1, ratio.shape[2])
    rgba = np.zeros((*frames.shape, 4), np.uint8)
    rgba[..., :3] = lut()[np.minimum(frames, 254)]
    rgba[..., 3] = np.where(frames == 255, 0, 255)
    return rgba


def coarsen(ratio):
    """(12, h, w) season ratio (255 = no curve) -> CELLS x CELLS block means in LEVELS steps,
    255 where a block has no curve. Odd edges repeat their last row or column."""
    values = np.where(ratio == 255, np.nan, ratio.astype(float))
    values = np.pad(values, ((0, 0), (0, -values.shape[1] % CELLS), (0, -values.shape[2] % CELLS)), mode="edge")
    blocks = values.reshape(12, values.shape[1] // CELLS, CELLS, values.shape[2] // CELLS, CELLS)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)  # a block with no curve at all
        mean = np.nanmean(blocks, axis=(2, 4))
    steps = np.rint(np.rint(mean / 254 * (LEVELS - 1)) / (LEVELS - 1) * 254)
    return np.where(np.isnan(mean), 255, steps).astype(np.uint8)


def crop(lat, lon, bbox):
    """The grid rows and columns whose centres lie within one cell of `bbox` (w, s, e, n), and
    the cropped image's edges [lon min, lat min, lon max, lat max]. `lat` runs north to south."""
    d_lat, d_lon = abs(lat[0] - lat[1]), abs(lon[1] - lon[0])
    w, s, e, n = bbox
    r = np.flatnonzero((lat >= s - d_lat) & (lat <= n + d_lat))
    c = np.flatnonzero((lon >= w - d_lon) & (lon <= e + d_lon))
    extent = [lon[c[0]] - d_lon / 2, lat[r[-1]] - d_lat / 2, lon[c[-1]] + d_lon / 2, lat[r[0]] + d_lat / 2]
    return slice(int(r[0]), int(r[-1]) + 1), slice(int(c[0]), int(c[-1]) + 1), [round(float(v), 3) for v in extent]


def species_slugs(registry):
    return {key: SLUG_OVERRIDES.get(key) or slug(s["name"]) for key, s in registry["species"].items()}


def write_place(out, place, grid, rows, cols, extent, land, species):
    names = grid["species"]
    for key in species:
        ratio = coarsen(grid["ratio"][names.index(key)][:, rows, cols])
        (out / place["id"]).mkdir(parents=True, exist_ok=True)
        Image.fromarray(sprite(ratio), "RGBA").save(out / place["id"] / f"{key}.webp", "WEBP", lossless=True)
    # The padded edge makes the image a cell wider or taller than the crop: east and south grow.
    fine_h, fine_w = len(grid["lat"][rows]), len(grid["lon"][cols])
    h, w = -(-fine_h // CELLS), -(-fine_w // CELLS)
    d_lon, d_lat = (extent[2] - extent[0]) / fine_w, (extent[3] - extent[1]) / fine_h
    extent = [extent[0], round(extent[3] - h * CELLS * d_lat, 3), round(extent[0] + w * CELLS * d_lon, 3), extent[3]]
    payload = {**place, "extent": extent, "frame": [w, h], "land": land, "species": species}
    (out / f"{place['id']}.json").write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")


def write_site(atlas, grids, out, slugs):
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    index = []
    for code, (cid, name) in CONTINENTS.items():
        if code not in grids:
            continue
        g = grids[code]
        species = atlas["continents"][code]
        rows, cols, extent = crop(g["lat"], g["lon"], [g["lon"][0], g["lat"][-1], g["lon"][-1], g["lat"][0]])
        land = [ring for r in atlas["regions"] if r["continent"] == code for ring in r["rings"]]
        place = {"id": cid, "kind": "continent", "name": name, "iso": None, "continent": code}
        write_place(out, place, g, rows, cols, extent, land, species)
        index.append({**place, "species": list(species)})
    regions = sorted((r for r in atlas["regions"] if r["place"] and r["continent"] in grids), key=lambda r: r["name"])
    for r in regions:
        g = grids[r["continent"]]
        rows, cols, extent = crop(g["lat"], g["lon"], r["bbox"])
        place = {k: r[k] for k in ("id", "kind", "name", "iso", "continent")}
        write_place(out, place, g, rows, cols, extent, r["rings"], r["species"])
        index.append({**place, "species": list(r["species"])})
    (out / "index.json").write_text(json.dumps({"places": index, "slugs": slugs}, separators=(",", ":")),
                                    encoding="utf-8")
    return index


def load_grids(atlas, grid_dir):
    """The grids the atlas was built from, checked against the sha256 it recorded."""
    current = json.loads((ROOT / "backend" / "generated" / "local_season.json").read_text(encoding="utf-8"))
    grids = {}
    for code, entry in atlas["grids"].items():
        if current["continents"].get(code, {}).get("sha256") != entry["sha256"]:
            print(f"[warn] the {code} season grid changed since the atlas was built; "
                  "run backend/tools/build_season_atlas.py", flush=True)
        data = (Path(grid_dir) / Path(entry["file"]).name).read_bytes() if grid_dir else r2.fetch(entry["file"])
        if hashlib.sha256(data).hexdigest() != entry["sha256"]:
            raise ValueError(f"{entry['file']}: not the copy the atlas was built from")
        with np.load(io.BytesIO(data)) as z:
            grids[code] = {"lat": z["lat"], "lon": z["lon"], "species": [str(s) for s in z["species"]],
                           "ratio": z["ratio"]}
    return grids


def write_pages(dist):
    """The app's index.html at /data/seasons/ and every /data/seasons/<place>/<species>/, so GitHub
    Pages serves them with a 200: its 404.html sends any other path to the site root, which broke
    links to the atlas and reloads on it. The number of pages; none without the atlas files."""
    index_file = dist / "season-atlas" / "index.json"
    if not index_file.exists():
        return 0
    index = json.loads(index_file.read_text(encoding="utf-8"))
    html = (dist / "index.html").read_text(encoding="utf-8")
    urls = ["data/seasons"] + [f"data/seasons/{p['id']}/{index['slugs'].get(k, k)}"
                               for p in index["places"] for k in p["species"]]
    for url in urls:
        (dist / url).mkdir(parents=True, exist_ok=True)
        (dist / url / "index.html").write_text(html, encoding="utf-8")
    return len(urls)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--grids", type=Path, help="local copies of the local_season_*.npz files")
    ap.add_argument("--pages", type=Path, metavar="DIST", help="only write the atlas URLs into the built site")
    args = ap.parse_args()
    if args.pages:
        print(f"season atlas: {write_pages(args.pages)} pages in {args.pages}")
        return
    atlas = json.loads(r2.generated(r2.GENERATED / "season_atlas.json").read_text(encoding="utf-8"))
    registry = json.loads((r2.GENERATED / "species_registry.json").read_text(encoding="utf-8"))
    index = write_site(atlas, load_grids(atlas, args.grids), OUT, species_slugs(registry))
    files = list(OUT.rglob("*"))
    print(f"season atlas: {len(index)} places, {sum(len(p['species']) for p in index)} maps, "
          f"{sum(f.stat().st_size for f in files if f.is_file()) / 1e6:.1f} MB in {OUT}")


if __name__ == "__main__":
    main()
