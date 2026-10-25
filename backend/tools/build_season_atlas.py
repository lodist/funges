#!/usr/bin/env python3
"""The season atlas: how each mushroom's season plays out in a country, a US state or a continent.

Each place gets its 12-month curve: the shipped local season grid (build_local_season.py)
averaged over the place's area, so the curve and its sentences say what the place's map shows.
(Weighting by GBIF records said "porcini peak in Italy in August" because Italy's records sit
in the Alps, while most of the country's map is at its peak in September.) A species shows in a
place only with at least MIN_RECORDS records there in 2010-2026, the season grid's own shipping
bar; with fewer, the curve comes mostly from similar climates elsewhere. Outlines come from
Natural Earth.

Run it after every season grid export; it ships generated/season_atlas.json to R2 (commit
on_r2.json). The deploy renders the site's maps from it (scripts/build_season_atlas_site.py).

    python backend/tools/build_season_atlas.py                 # grids from R2
    python backend/tools/build_season_atlas.py --grids DIR     # local copies of the npz files
"""
import argparse
import hashlib
import io
import json
import re
import sys
import unicodedata
import urllib.request
from pathlib import Path

import numpy as np
import shapely
from shapely.geometry import box, shape

_TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(_TOOLS.parent))
import r2  # noqa: E402

APP = _TOOLS.parents[2]
GENERATED = _TOOLS.parent / "generated"
PERIODS = ("2010-2019", "2020-2026")  # build_local_season's cache files, summed
MIN_RECORDS = 150
INSIDE_SHARE = 0.5  # a region at least this much inside the grid is a place (drops Russia)
SIMPLIFY = 0.01  # degrees
NATURAL_EARTH = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/{}.geojson"
LOWER_48_OUT = {"US-AK", "US-HI"}


def slug(name):
    text = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", re.sub(r"['’]", "", text.lower())).strip("-")


def natural_earth(name, cache):
    path = cache / f"{name}.geojson"
    if not path.exists():
        cache.mkdir(parents=True, exist_ok=True)
        path.write_bytes(urllib.request.urlopen(NATURAL_EARTH.format(name), timeout=120).read())
    return json.loads(path.read_text(encoding="utf-8"))["features"]


def load_regions(cache):
    """Every country (EU grid) and lower-48 state (US grid), with a URL id and its ISO code."""
    regions = []
    for f in natural_earth("ne_50m_admin_0_countries", cache):
        p = f["properties"]
        regions.append({"name": p["NAME_EN"], "kind": "country", "iso": p["ISO_A2_EH"], "continent": "EU",
                        "geom": shape(f["geometry"])})
    for f in natural_earth("ne_50m_admin_1_states_provinces", cache):
        p = f["properties"]
        if p["adm0_a3"] == "USA" and p["iso_3166_2"] not in LOWER_48_OUT:
            regions.append({"name": p["name"], "kind": "state", "iso": p["iso_3166_2"], "continent": "US",
                            "geom": shape(f["geometry"])})
    taken = set()
    for r in regions:
        r["id"] = slug(r["name"]) + ("-us" if r["kind"] == "state" and slug(r["name"]) in taken else "")
        taken.add(r["id"])
    return regions


def cell_regions(lat, lon, regions):
    """(rows, cols): the index of the region holding each cell centre, -1 for none."""
    lon2, lat2 = np.meshgrid(lon, lat)
    owner = np.full(lon2.shape, -1, int)
    for k, r in enumerate(regions):
        owner[(owner < 0) & shapely.contains_xy(r["geom"], lon2, lat2)] = k
    return owner


def block_counts(counts, shape_out):
    """The cache's 0.1° month counts (rows south to north) as records per 0.2° grid cell (rows
    north to south): the export samples every second cell, so each 2x2 block goes to its cell."""
    h, w = shape_out
    total = counts.sum(axis=0)[::-1][:2 * h, :2 * w]
    return total.reshape(h, 2, w, 2).sum(axis=(1, 3))


def place_curve(ratio, weights, mask):
    """The weighted mean of the cells' season ratio by month, scaled to peak at 1."""
    valid = (ratio != 255) & mask[None]
    w = np.where(valid, weights[None], 0.0)
    curve = (np.where(valid, ratio, 0) * w).sum(axis=(1, 2)) / np.maximum(w.sum(axis=(1, 2)), 1e-9)
    return [round(float(v), 3) for v in curve / max(curve.max(), 1e-9)]


def rings(geom):
    """Outer rings only: an enclave (the Vatican in Italy) would show as a hole in the map."""
    return [[[round(x, 2), round(y, 2)] for x, y in poly.exterior.coords]
            for poly in getattr(geom, "geoms", [geom]) if poly.geom_type == "Polygon" and not poly.is_empty]


def grid_bounds(g):
    d_lat, d_lon = abs(g["lat"][0] - g["lat"][1]), abs(g["lon"][1] - g["lon"][0])
    return (float(g["lon"][0] - d_lon / 2), float(g["lat"][-1] - d_lat / 2),
            float(g["lon"][-1] + d_lon / 2), float(g["lat"][0] + d_lat / 2))


def build(grids, counts, regions, bounds=None, min_records=MIN_RECORDS):
    """grids: {code: {lat, lon, species, ratio, file, sha256}}; counts: {code: {species: cache
    counts}}; regions: load_regions(). -> the season_atlas.json payload."""
    out = {"min_records": min_records, "grids": {}, "regions": [], "continents": {}}
    for code, g in grids.items():
        out["grids"][code] = {"file": g["file"], "sha256": g["sha256"]}
        frame = box(*(bounds or {}).get(code, grid_bounds(g)))
        mine = [r for r in regions if r["continent"] == code and r["geom"].intersects(frame)]
        owner = cell_regions(g["lat"], g["lon"], mine)
        records = {sp: block_counts(counts[code][sp], owner.shape) for sp in g["species"]}
        area = np.repeat(np.cos(np.radians(g["lat"]))[:, None], len(g["lon"]), axis=1)  # a cell's true area
        land = owner >= 0  # the grid also has values over the sea
        out["continents"][code] = {sp: {"records": int(records[sp].sum()),
                                        "curve": place_curve(g["ratio"][k], area, land)}
                                   for k, sp in enumerate(g["species"])}
        for idx, r in enumerate(mine):
            mask = owner == idx
            species = {}
            for k, sp in enumerate(g["species"]):
                n = int(records[sp][mask].sum())
                if n >= min_records:
                    species[sp] = {"records": n, "curve": place_curve(g["ratio"][k], area, mask)}
            inside = r["geom"].intersection(frame).area / max(r["geom"].area, 1e-12)
            clipped = r["geom"].intersection(frame).simplify(SIMPLIFY, preserve_topology=True)
            out["regions"].append({
                "id": r["id"], "name": r["name"], "kind": r["kind"], "iso": r["iso"], "continent": code,
                "place": bool(species) and inside >= INSIDE_SHARE and r["iso"] != "-99",
                "bbox": [round(v, 2) for v in clipped.bounds], "rings": rings(clipped), "species": species})
    return out


def load_grids(grid_dir):
    """The shipped local season grids, named by local_season.json, from R2 or `grid_dir`."""
    spec = json.loads((GENERATED / "local_season.json").read_text(encoding="utf-8"))
    grids = {}
    for code, entry in spec["continents"].items():
        data = (Path(grid_dir) / Path(entry["file"]).name).read_bytes() if grid_dir else r2.fetch(entry["file"])
        if hashlib.sha256(data).hexdigest() != entry["sha256"]:
            raise ValueError(f"{entry['file']}: not the copy local_season.json names")
        with np.load(io.BytesIO(data)) as z:
            grids[code] = {"lat": z["lat"], "lon": z["lon"], "species": [str(s) for s in z["species"]],
                           "ratio": z["ratio"], "file": entry["file"], "sha256": entry["sha256"]}
    return grids


def load_counts(cache, grids):
    return {code: {sp: sum(np.load(cache / code / f"{sp}_{years}.npz")["counts"] for years in PERIODS)
                   for sp in g["species"]} for code, g in grids.items()}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--grids", type=Path, help="local copies of the local_season_*.npz files")
    ap.add_argument("--cache", type=Path, default=APP / "season_local_cache", help="build_local_season's cache")
    ap.add_argument("--ne-cache", type=Path, default=APP / "data_tools" / "natural_earth")
    args = ap.parse_args()
    grids = load_grids(args.grids)
    atlas = build(grids, load_counts(args.cache, grids), load_regions(args.ne_cache))
    path = GENERATED / "season_atlas.json"
    path.write_text(json.dumps(atlas, separators=(",", ":")) + "\n", encoding="utf-8", newline="\n")
    for code in grids:
        places = [r for r in atlas["regions"] if r["continent"] == code and r["place"]]
        print(f"{code}: {len(places)} places, {sum(len(r['species']) for r in places)} place-species pages")
    print(f"wrote {path} ({path.stat().st_size / 1e6:.2f} MB)")
    r2.ship(path)


if __name__ == "__main__":
    main()
