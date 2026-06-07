#!/usr/bin/env python3
"""Build empirical seasonality curves from GBIF target-group ratios and upload to R2
"""
import argparse
import json
import os
import time
import urllib.parse
import urllib.request
from datetime import date
from io import BytesIO
from pathlib import Path
from urllib.parse import urlparse

import boto3
import numpy as np
import pandas as pd
from concurrent.futures import ThreadPoolExecutor, as_completed

_THIS_YEAR = date.today().year

GBIF = "https://api.gbif.org/v1/occurrence/search"
FUNGI_KEY = 5  # Kingdom Fungi

# Fungi only — plants excluded (sighting date ≠ forageable date for perennials).
TAXON_MAP = {
    "mushroom":    [8287374],  # Boletus (genus): edulis, aestivalis, pinophilus, reticulatus, ...
    "morel":       [2594601],  # Morchella (genus): all morels
    "black_chant": [2554662],  # Craterellus cornucopioides (horn of plenty / black chanterelle)
    "chant":       [9623860],  # Cantharellus (genus, Fungi): chanterelle
    "parasol":     [8914748],  # Macrolepiota procera
    "st_george":   [8936224],  # Calocybe gambosa
    "truffle_b":   [8282501],  # Tuber (genus)
}

REGIONS = {
    "NE":  {"lat": (49.0, 71.5), "lon": (-25.0, 32.0),    "env": "NE_SEASON_CURVES"},
    "SE":  {"lat": (34.0, 55.5), "lon": (12.0, 42.5),     "env": "SE_SEASON_CURVES"},
    "USE": {"lat": (24.0, 37.5), "lon": (-106.5, -75.0),  "env": "USE_SEASON_CURVES"},
    "USW": {"lat": (33.0, 49.5), "lon": (-125.5, -81.5),  "env": "USW_SEASON_CURVES"},
}

# Macro-regions for zone curves. EU = NE ∪ SE bbox, US = USE ∪ USW bbox. Disjoint in
# longitude, so EU-continental and US-continental stay distinct files. Both EU sub-region
# scoring scripts read the EU file (dissolving the NE/SE overlap); both US scripts read US.
MACROS = {
    "EU": {"lat": (34.0, 71.5), "lon": (-25.0, 42.5),
           "static_env": "EU_STATIC_INFO", "out_env": "EU_ZONE_SEASON_CURVES"},
    "US": {"lat": (24.0, 49.5), "lon": (-125.5, -75.0),
           "static_env": "US_STATIC_INFO", "out_env": "US_ZONE_SEASON_CURVES"},
}

_ROOT = Path(__file__).resolve().parents[2]


def load_dotenv(dotenv_path):
    if not dotenv_path.exists():
        return
    for raw_line in dotenv_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def get_required_env(*names):
    for name in names:
        value = os.getenv(name)
        if value is not None and str(value).strip() != "":
            return value
    raise RuntimeError(f"Missing required environment variable. Checked: {', '.join(names)}")


def is_remote_path(path):
    return str(path).startswith(("http://", "https://"))


def r2_fetch(url):
    """Fetch a file from R2 via authenticated boto3."""
    key = urlparse(url).path.lstrip('/')
    client = boto3.client(
        's3',
        endpoint_url=get_required_env("R2_ENDPOINT_URL"),
        aws_access_key_id=get_required_env("R2_ACCESS_KEY_ID"),
        aws_secret_access_key=get_required_env("R2_SECRET_ACCESS_KEY")
    )
    return client.get_object(Bucket=get_required_env("R2_BUCKET_NAME"), Key=key)["Body"].read()


def save_curves(data, dest):
    payload = json.dumps(data, indent=2).encode("utf-8")
    if is_remote_path(dest):
        key = urlparse(dest).path.lstrip("/")
        client = boto3.client(
            "s3",
            endpoint_url=get_required_env("R2_ENDPOINT_URL"),
            aws_access_key_id=get_required_env("R2_ACCESS_KEY_ID"),
            aws_secret_access_key=get_required_env("R2_SECRET_ACCESS_KEY"),
        )
        client.put_object(
            Bucket=get_required_env("R2_BUCKET_NAME"), Key=key,
            Body=BytesIO(payload).getvalue(), ContentType="application/json",
        )
        print(f"  uploaded to R2: {dest}")
    else:
        Path(dest).parent.mkdir(parents=True, exist_ok=True)
        Path(dest).write_bytes(payload)
        print(f"  wrote local: {dest}")


def _facet_month(taxon_keys, region, years, retries=4):
    params = [
        ("year", years), ("facet", "month"), ("facetLimit", "12"), ("limit", "0"),
        ("hasCoordinate", "true"),
        ("decimalLatitude", f"{region['lat'][0]},{region['lat'][1]}"),
        ("decimalLongitude", f"{region['lon'][0]},{region['lon'][1]}"),
    ]
    for k in taxon_keys:
        params.append(("taxonKey", str(k)))
    url = GBIF + "?" + urllib.parse.urlencode(params)
    for attempt in range(retries):
        try:
            d = json.load(urllib.request.urlopen(url, timeout=90))
            break
        except Exception:
            if attempt == retries - 1:
                raise
            time.sleep(1.5 * (attempt + 1))
    out = {m: 0 for m in range(1, 13)}
    if d.get("facets"):
        for c in d["facets"][0]["counts"]:
            out[int(c["name"])] = c["count"]
    return out, d["count"]


def build_curve(target_counts, fungi_counts, low, high, min_total):
    total = sum(target_counts.values())
    ratio = {m: (target_counts[m] / fungi_counts[m] if fungi_counts[m] else 0.0) for m in range(1, 13)}
    mx = max(ratio.values())
    if total < min_total or mx <= 0:
        return None, total
    curve = {m: round(low + (high - low) * (ratio[m] / mx), 3) for m in range(1, 13)}
    return curve, total


from collections import defaultdict


def generate_cells(lat_range, lon_range, cell_size):
    """Tile a bbox into (lat_lo, lat_hi, lon_lo, lon_hi) cells, clamping the last
    row/column to the bbox edges."""
    cells = []
    lat = lat_range[0]
    while lat < lat_range[1]:
        lat_hi = min(lat + cell_size, lat_range[1])
        lon = lon_range[0]
        while lon < lon_range[1]:
            lon_hi = min(lon + cell_size, lon_range[1])
            cells.append((lat, lat_hi, lon, lon_hi))
            lon = lon_hi
        lat = lat_hi
    return cells


def majority_zone_in_cell(cell, lats, lons, zones):
    """Most common climate_zone among labeled coords inside the cell, or None if the
    cell contains no labeled coords (ocean / unlabeled -> skipped, no GBIF call)."""
    lat_lo, lat_hi, lon_lo, lon_hi = cell
    mask = (lats >= lat_lo) & (lats < lat_hi) & (lons >= lon_lo) & (lons < lon_hi)
    if not mask.any():
        return None
    vals, counts = np.unique(zones[mask], return_counts=True)
    return str(vals[counts.argmax()])


def build_zone_curves(cell_results, low, high, min_total):
    """Aggregate per-cell facet counts into per-zone curves.

    cell_results: iterable of (zone, {species: {month: count}}, {month: count}) where
    the third element is the all-fungi denominator for that cell.
    Returns {zone: {species: curve}} with data-poor (zone, species) pairs omitted.
    """
    zero = lambda: {m: 0 for m in range(1, 13)}
    zone_species = defaultdict(lambda: defaultdict(zero))
    zone_fungi = defaultdict(zero)
    for zone, sp_counts, fungi_counts in cell_results:
        for m in range(1, 13):
            zone_fungi[zone][m] += fungi_counts.get(m, 0)
        for sp, counts in sp_counts.items():
            for m in range(1, 13):
                zone_species[zone][sp][m] += counts.get(m, 0)

    out = {}
    for zone, sp_map in zone_species.items():
        curves = {}
        for sp, counts in sp_map.items():
            curve, _total = build_curve(counts, zone_fungi[zone], low, high, min_total)
            if curve:
                curves[sp] = curve
        if curves:
            out[zone] = curves
    return out


def load_static_coords(env_name):
    """Load labeled (lat, lon, climate_zone) from a static-info CSV (local or remote)."""
    src = get_required_env(env_name)
    if is_remote_path(src):
        df = pd.read_csv(BytesIO(r2_fetch(src)))
    else:
        df = pd.read_csv(src)
    return (
        df["Latitude"].astype(float).to_numpy(),
        df["Longitude"].astype(float).to_numpy(),
        df["climate_zone"].astype(str).to_numpy(),
    )


def fetch_cell_counts(cell, taxon_map, years):
    """GBIF month-facets for one cell: returns (fungi_counts, {species: counts})."""
    region = {"lat": (cell[0], cell[1]), "lon": (cell[2], cell[3])}
    fungi_counts, _ = _facet_month([FUNGI_KEY], region, years)
    sp_counts = {}
    for sp, keys in taxon_map.items():
        counts, _ = _facet_month(keys, region, years)
        sp_counts[sp] = counts
    return fungi_counts, sp_counts


def build_zone_curves_for_macro(macro, years, low, high, min_total, cell_size, workers):
    """Tile a macro-region into cells, filter to land, fetch GBIF facets in parallel,
    and aggregate into per-climate-zone season curves.

    macro: a MACROS entry dict (keys: lat, lon, static_env, out_env).
    Returns the dict produced by build_zone_curves (may be empty if data is sparse).
    """
    lats, lons, zones = load_static_coords(macro["static_env"])
    cells = generate_cells(macro["lat"], macro["lon"], cell_size)
    land = [(c, z) for c in cells for z in [majority_zone_in_cell(c, lats, lons, zones)] if z]
    print(f"  {len(land)} land cells of {len(cells)} total; fetching with {workers} workers")

    cell_results = []
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = {ex.submit(fetch_cell_counts, cell, TAXON_MAP, years): zone for cell, zone in land}
        done = 0
        for fut in as_completed(futs):
            zone = futs[fut]
            try:
                fungi_counts, sp_counts = fut.result()
                cell_results.append((zone, sp_counts, fungi_counts))
            except Exception as e:
                print(f"  [warn] cell in zone {zone} failed: {e}; skipping")
            done += 1
            if done % 25 == 0:
                print(f"  {done}/{len(land)} cells fetched...")
    return build_zone_curves(cell_results, low, high, min_total)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--years", default=f"{_THIS_YEAR - 6},{_THIS_YEAR}",
                    help="GBIF year range")
    ap.add_argument("--low", type=float, default=0.8, help="multiplier floor (off-peak)")
    ap.add_argument("--high", type=float, default=1.2, help="multiplier ceiling (peak)")
    ap.add_argument("--min-total", type=int, default=200,
                    help="min target sightings in a region to trust its curve")
    ap.add_argument("--regions", default=",".join(REGIONS), help="comma-separated region codes")
    ap.add_argument("--local-only", action="store_true",
                    help="skip R2 upload and write curves to --out-dir instead")
    ap.add_argument("--out-dir", default=".", help="local output dir (for --local-only)")
    ap.add_argument("--mode", choices=["region", "zone"], default="region",
                    help="region: legacy per-region curves; zone: per-climate-zone curves")
    ap.add_argument("--macros", default=",".join(MACROS), help="comma-separated macro codes (zone mode)")
    ap.add_argument("--cell-size", type=float, default=2.0, help="grid cell size in degrees (zone mode)")
    ap.add_argument("--workers", type=int, default=6, help="parallel GBIF fetch workers (zone mode)")
    args = ap.parse_args()

    load_dotenv(_ROOT / ".env")
    load_dotenv(_ROOT / ".env.secret")

    if args.mode == "zone":
        for macro_code in args.macros.split(","):
            macro_code = macro_code.strip()
            if macro_code not in MACROS:
                print(f"[{macro_code}] unknown macro, skipping")
                continue
            macro = MACROS[macro_code]
            print(f"[{macro_code}] building zone curves...")
            curves = build_zone_curves_for_macro(
                macro, args.years, args.low, args.high, args.min_total,
                args.cell_size, args.workers)
            n_curves = sum(len(v) for v in curves.values())
            print(f"[{macro_code}] {n_curves} curve(s) across {len(curves)} zone(s)")
            if args.local_only:
                dest = str(Path(args.out_dir) / f"{macro_code}_zone_season_curves.json")
            else:
                dest = get_required_env(macro["out_env"])
            save_curves(curves, dest)
        return

    for region in args.regions.split(","):
        region = region.strip()
        if region not in REGIONS:
            print(f"[{region}] unknown region, skipping")
            continue
        reg = REGIONS[region]
        fungi, fungi_total = _facet_month([FUNGI_KEY], reg, args.years)
        time.sleep(0.2)
        curves = {}
        for sp, keys in TAXON_MAP.items():
            tgt, _ = _facet_month(keys, reg, args.years)
            time.sleep(0.2)
            curve, total = build_curve(tgt, fungi, args.low, args.high, args.min_total)
            status = "ok" if curve else f"SKIP (only {total} sightings < {args.min_total})"
            print(f"[{region}] {sp:12s} target={total:6d} fungi={fungi_total:8d}  {status}")
            if curve:
                curves[sp] = curve

        if args.local_only:
            dest = str(Path(args.out_dir) / f"{region}_season_curves.json")
        else:
            dest = get_required_env(reg["env"])
        print(f"[{region}] {len(curves)} curve(s):")
        save_curves(curves, dest)
        print()


if __name__ == "__main__":
    main()
