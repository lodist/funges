"""What surrounds each place: the share of its ~7 km cell that is town, suburb (houses with
gardens), green urban land and allotments, small mixed plots, arable land, vineyards,
orchards and olive groves, and pasture. For the garden and crop forecasts: which places they
serve and what they advise there.

Places are the regions' base points (the 0.06 x 0.075 degree lattice named after the nearest
town). Europe reads CORINE Land Cover 2018 (100 m, 25 ha minimum unit) from the EEA's map
service, class by class, rasterised to 300 m; the US reads the Annual NLCD 2024 (30 m,
app_operation/NLCD), counted per 300 m cell. A place's share is over the WINDOW x WINDOW
cells around it, sea and missing data included in Europe, missing data excluded in the US.

  python backend/tools/build_place_landcover.py [NE SE USE USW]

Writes app_operation/places_landcover/<REGION>_place_landcover.parquet; CORINE pages are
cached in app_operation/places_landcover/cache.
"""
from __future__ import annotations

import io
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[3]          # app_operation
BACKEND = Path(__file__).resolve().parents[1]
OUT = ROOT / "places_landcover"
NLCD = ROOT / "NLCD" / "Annual_NLCD_LndCov_2024_CU_C1V1.tif"
CLC_QUERY = "https://image.discomap.eea.europa.eu/arcgis/rest/services/Corine/CLC2018_LAEA/MapServer/0/query"
CLC_PAGE = 1000
CELL = 300.0          # metres
WINDOW = 23           # cells: a 6.9 km square, about one lattice cell

# Our column -> CORINE codes / NLCD classes.
EU_GROUPS = {"town": [111], "suburb": [112], "green_urban": [141, 142], "small_plots": [242],
             "mixed_farm": [241, 243, 244], "arable": [211, 212, 213], "vineyard": [221],
             "orchard": [222, 223], "pasture": [231]}
US_GROUPS = {"town": [23, 24], "suburb": [21, 22], "arable": [82], "pasture": [81]}
NLCD_NODATA = 250


def places(region):
    """The region's base points: Location_Id, Latitude, Longitude."""
    sys.path.insert(0, str(BACKEND))
    import r2
    # A worktree has no .env.secret: the main checkout's then.
    for env in (BACKEND.parent / ".env", BACKEND.parent / ".env.secret", ROOT / "funges" / ".env.secret"):
        if not env.exists():
            continue
        for line in env.read_text(encoding="utf-8").splitlines():
            key, sep, value = line.partition("=")
            if sep and not key.lstrip().startswith("#"):
                os.environ.setdefault(key.strip(), value.strip().strip("\"'"))
    base = pd.read_csv(io.BytesIO(r2.fetch(os.environ[f"{region}_BASE_DATA"])))
    return base[["Location_Id", "Latitude", "Longitude"]]


def window_shares(index_grid, rows, cols, n_classes):
    """Per place, the share of each class index (0 = none of ours) in its WINDOW square."""
    h = WINDOW // 2
    out = np.zeros((len(rows), n_classes), np.float32)
    for k, (r, c) in enumerate(zip(rows, cols)):
        win = index_grid[max(r - h, 0):r + h + 1, max(c - h, 0):c + h + 1]
        if win.size:
            out[k] = np.bincount(win.ravel(), minlength=n_classes)[:n_classes] / win.size
    return out


# --- Europe: CORINE -------------------------------------------------------------------------

def _clc_page(code, offset):
    path = OUT / "cache" / f"clc2018_{code}_{offset}.json"
    if path.exists():
        return path
    url = CLC_QUERY + "?" + urllib.parse.urlencode(dict(
        where=f"Code_18='{code}'", outFields="Code_18", returnGeometry="true", maxAllowableOffset=100,
        geometryPrecision=0, orderByFields="OBJECTID", resultOffset=offset, resultRecordCount=CLC_PAGE, f="json"))
    for attempt in range(6):
        try:
            with urllib.request.urlopen(url, timeout=300) as response:
                body = response.read()
            if "features" not in json.loads(body):   # an error page is never cached
                raise ValueError(body[:200])
            break
        except Exception as error:  # noqa: BLE001
            print(f"  retry CORINE {code} @{offset}: {error!r}", flush=True)
            time.sleep(15 * (attempt + 1))
    else:
        raise RuntimeError(f"CORINE {code} @{offset} failed")
    path.parent.mkdir(parents=True, exist_ok=True)
    part = path.with_suffix(".part")
    part.write_bytes(body)
    part.replace(path)
    return path


def clc_pages(code):
    """Every page of a CORINE class, fetched four at a time and cached."""
    url = CLC_QUERY + "?" + urllib.parse.urlencode(dict(where=f"Code_18='{code}'", returnCountOnly="true", f="json"))
    with urllib.request.urlopen(url, timeout=120) as response:
        count = json.loads(response.read())["count"]
    with ThreadPoolExecutor(4) as pool:
        return list(pool.map(lambda offset: _clc_page(code, offset), range(0, count, CLC_PAGE)))


def corine_grid(xmin, ymin, xmax, ymax):
    """Our classes rasterised on a CELL grid in EPSG:3035: (index grid, transform)."""
    import geopandas as gpd
    from rasterio.features import rasterize
    from rasterio.transform import from_origin

    width, height = int(np.ceil((xmax - xmin) / CELL)), int(np.ceil((ymax - ymin) / CELL))
    transform = from_origin(xmin, ymax, CELL, CELL)
    grid = np.zeros((height, width), np.uint8)
    for index, (name, codes) in enumerate(EU_GROUPS.items(), start=1):
        for code in codes:
            pages = clc_pages(code)
            for start in range(0, len(pages), 50):
                frame = pd.concat([gpd.read_file(p) for p in pages[start:start + 50]], ignore_index=True)
                rasterize(((g, index) for g in frame.geometry if g is not None and not g.is_empty),
                          out=grid, transform=transform)
            print(f"  CORINE {code} ({name}): {len(pages)} pages", flush=True)
    return grid, transform


def europe(regions):
    from pyproj import Transformer
    to_laea = Transformer.from_crs(4326, 3035, always_xy=True)
    frames = {r: places(r) for r in regions}
    xy = {r: to_laea.transform(f["Longitude"].to_numpy(), f["Latitude"].to_numpy()) for r, f in frames.items()}
    allx, ally = np.concatenate([v[0] for v in xy.values()]), np.concatenate([v[1] for v in xy.values()])
    pad = WINDOW * CELL
    grid, transform = corine_grid(allx.min() - pad, ally.min() - pad, allx.max() + pad, ally.max() + pad)
    for region, frame in frames.items():
        x, y = xy[region]
        cols = ((x - transform.c) / CELL).astype(int)
        rows = ((transform.f - y) / CELL).astype(int)
        shares = window_shares(grid, rows, cols, len(EU_GROUPS) + 1)
        write(region, frame, shares[:, 1:], list(EU_GROUPS))


# --- US: NLCD ---------------------------------------------------------------------------------

def us(regions):
    import rasterio
    from pyproj import Transformer
    from rasterio.windows import Window

    factor = int(CELL / 30)
    with rasterio.open(NLCD) as src:
        height, width = src.height // factor, src.width // factor
        counts = {name: np.zeros((height, width), np.uint8) for name in [*US_GROUPS, "_valid"]}
        for row in range(0, height, 100):
            rows = min(100, height - row)
            block = src.read(1, window=Window(0, row * factor, width * factor, rows * factor))
            block = block.reshape(rows, factor, width, factor)
            counts["_valid"][row:row + rows] = (block != NLCD_NODATA).sum(axis=(1, 3))
            for name, classes in US_GROUPS.items():
                counts[name][row:row + rows] = np.isin(block, classes).sum(axis=(1, 3))
            if row % 2000 == 0:
                print(f"  NLCD rows {row}/{height}", flush=True)
        to_albers = Transformer.from_crs(4326, src.crs, always_xy=True)
        origin_x, origin_y = src.transform.c, src.transform.f
    h = WINDOW // 2
    for region in regions:
        frame = places(region)
        x, y = to_albers.transform(frame["Longitude"].to_numpy(), frame["Latitude"].to_numpy())
        cols, rows = ((x - origin_x) / CELL).astype(int), ((origin_y - y) / CELL).astype(int)
        shares = np.full((len(frame), len(US_GROUPS)), np.nan, np.float32)
        for k, (r, c) in enumerate(zip(rows, cols)):
            sl = (slice(max(r - h, 0), r + h + 1), slice(max(c - h, 0), c + h + 1))
            valid = counts["_valid"][sl].sum(dtype=np.int64)
            if valid:
                shares[k] = [counts[n][sl].sum(dtype=np.int64) / valid for n in US_GROUPS]
        write(region, frame, shares, list(US_GROUPS))


def write(region, frame, shares, names):
    out = frame.copy()
    for k, name in enumerate(names):
        out[name] = np.round(shares[:, k], 4)
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"{region}_place_landcover.parquet"
    out.to_parquet(path, index=False)
    lived = out[[c for c in ("town", "suburb", "green_urban", "small_plots") if c in out]].sum(axis=1)
    print(f"{region}: {len(out):,} places -> {path.name}; median share of town+suburb(+plots) "
          f"{lived.median():.1%}; places with >=5%: {(lived >= 0.05).mean():.1%}", flush=True)


if __name__ == "__main__":
    wanted = sys.argv[1:] or ["NE", "SE", "USE", "USW"]
    if eu := [r for r in wanted if r in ("NE", "SE")]:
        europe(eu)
    if usr := [r for r in wanted if r in ("USE", "USW")]:
        us(usr)
