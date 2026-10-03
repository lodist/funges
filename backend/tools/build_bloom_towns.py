#!/usr/bin/env python3
"""Fetch the built-up areas the cherry blossom layer is drawn on.

Japanese cherries are planted in towns and cities, so backend/bloom.py clips its
cells to Natural Earth's 1:10m urban areas (public domain, MODIS-derived
footprints): the layer shows where the trees are, not the whole land. Their
angular outlines are rounded off and cut to Natural Earth's land, so no town
spills over a bay. Writes one GeoJSON per macro into backend/generated/.

    python backend/tools/build_bloom_towns.py
"""
import sys
import tempfile
import urllib.request
from pathlib import Path

import geopandas as gpd
import numpy as np
import shapely
from shapely.geometry import box

NE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/{}.geojson"
# The same boxes as build_range_priors.py's macros.
MACROS = {"EU": (-25.0, 34.0, 42.5, 71.5), "US": (-125.5, 24.0, -67.0, 49.5)}
ROUND = 0.01  # degrees, ~1 km: grown by this and shrunk back, corners come out round
SIMPLIFY = 0.002  # degrees, ~200 m
DECIMALS = 4  # ~10 m
OUT = Path(__file__).resolve().parents[1] / "generated"


def fetch(name, tmp):
    path = Path(tmp) / f"{name}.geojson"
    urllib.request.urlretrieve(NE.format(name), path)
    return gpd.read_file(path)[["geometry"]]


def main():
    with tempfile.TemporaryDirectory() as tmp:
        towns = fetch("ne_10m_urban_areas", tmp)
        land = fetch("ne_10m_land", tmp)
    for macro, (w, s, e, n) in MACROS.items():
        shore = shapely.intersection(shapely.union_all(land.cx[w:e, s:n].geometry.values), box(w, s, e, n))
        part = towns.cx[w:e, s:n].geometry.values
        part = shapely.buffer(shapely.buffer(part, ROUND * 1.2, quad_segs=4), -ROUND, quad_segs=4)
        part = shapely.intersection(part, shore)
        part = shapely.simplify(part, SIMPLIFY, preserve_topology=True)
        # np.round, not shapely.set_precision: grid-snapped floats print as
        # 37.389000000000003, decimal-rounded ones as 37.389.
        part = shapely.transform(part, lambda xy: np.round(xy, DECIMALS))
        frame = gpd.GeoDataFrame(geometry=part[~shapely.is_empty(part)], crs="EPSG:4326")
        out = OUT / f"bloom_towns_{macro}.geojson"
        out.write_text(frame.to_json(drop_id=True), encoding="utf-8")
        print(f"wrote {out} ({len(frame)} areas, {out.stat().st_size // 1024} KB)", file=sys.stderr)


if __name__ == "__main__":
    main()
