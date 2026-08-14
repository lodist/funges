#!/usr/bin/env python3
"""Build empirical seasonality curves from GBIF target-group ratios and upload to R2
"""
import argparse
import json
import os
import time
import urllib.error
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
    # Must stay the SPECIES, not genus Tuber (8282501). The genus is dominated by
    # summer-fruiting relatives, so it produced a July-peaking curve for a winter
    # truffle -- and because a curve overrides season_months, that curve replaced the
    # correct hand-written winter window. With the species key the record count falls
    # below --min-total, no curve is published, and season_months correctly applies.
    "truffle_b":   [5258468],  # Tuber melanosporum (black Perigord truffle)
}

REGIONS = {
    "NE":  {"lat": (49.0, 71.5), "lon": (-25.0, 32.0),    "env": "NE_SEASON_CURVES"},
    "SE":  {"lat": (34.0, 55.5), "lon": (12.0, 42.5),     "env": "SE_SEASON_CURVES"},
    "USE": {"lat": (24.0, 37.5), "lon": (-106.5, -75.0),  "env": "USE_SEASON_CURVES"},
    "USW": {"lat": (33.0, 49.5), "lon": (-125.5, -81.5),  "env": "USW_SEASON_CURVES"},
}

# Macro-regions for zone curves (EU = NE∪SE, US = USE∪USW); both EU scripts share the EU file.
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


def r2_last_modified(url):
    """R2 object's LastModified datetime, or None if it does not exist."""
    key = urlparse(url).path.lstrip('/')
    client = boto3.client(
        's3',
        endpoint_url=get_required_env("R2_ENDPOINT_URL"),
        aws_access_key_id=get_required_env("R2_ACCESS_KEY_ID"),
        aws_secret_access_key=get_required_env("R2_SECRET_ACCESS_KEY")
    )
    try:
        return client.head_object(Bucket=get_required_env("R2_BUCKET_NAME"), Key=key)["LastModified"]
    except Exception:
        return None


def _quarter_index(d):
    """Absolute quarter number so consecutive quarters compare with '<' across year boundaries."""
    return d.year * 4 + (d.month - 1) // 3


def needs_rebuild():
    """Rebuild only when a zone-curve file is missing from R2 or was last built in an earlier
    quarter than today -> refreshes once per quarter, on the first run after the boundary."""
    today_q = _quarter_index(date.today())
    for macro in MACROS.values():
        lm = r2_last_modified(get_required_env(macro["out_env"]))
        if lm is None:
            print(f"[gate] {macro['out_env']} missing in R2 -> building")
            return True
        if _quarter_index(lm.date()) < today_q:
            print(f"[gate] {macro['out_env']} last built {lm.date()} (earlier quarter) -> building")
            return True
    print("[gate] zone curves present and built this quarter -> skipping (use --force to rebuild)")
    return False


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


def _facet_month(taxon_keys, region, years, retries=6):
    params = [
        ("year", years), ("facet", "month"), ("facetLimit", "12"), ("limit", "0"),
        ("hasCoordinate", "true"),
        # Human observations only. Preserved specimens carry collection-date and
        # herbarium-campaign bias, and they are not the population the app serves.
        ("basisOfRecord", "HUMAN_OBSERVATION"),
        ("occurrenceStatus", "PRESENT"),
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
        except urllib.error.HTTPError as e:
            if attempt == retries - 1:
                raise
            if e.code == 429:
                retry_after = e.headers.get("Retry-After")
                wait = float(retry_after) if (retry_after and retry_after.isdigit()) else 2.0 * (attempt + 1)
                time.sleep(wait)
            else:
                time.sleep(1.5 * (attempt + 1))
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
    """Return {"multiplier": {...}, "ratio": {...}} for one species, or (None, total).

    `multiplier` is the smooth scoring factor, compressed into [low, high]. `ratio` is
    the same effort-normalised monthly signal *uncompressed* (peak = 1.0), which is what
    a season gate needs: compressing into [0.6, 1.0] threw away the only information
    that could distinguish a dead month from a peak one.
    """
    total = sum(target_counts.values())
    ratio = {m: (target_counts[m] / fungi_counts[m] if fungi_counts[m] else 0.0) for m in range(1, 13)}
    mx = max(ratio.values())
    if total < min_total or mx <= 0:
        return None, total
    return {
        "multiplier": {m: round(low + (high - low) * (ratio[m] / mx), 3) for m in range(1, 13)},
        "ratio": {m: round(ratio[m] / mx, 4) for m in range(1, 13)},
    }, total


from collections import defaultdict


def generate_cells(lat_range, lon_range, cell_size):
    """Tile a bbox into (lat_lo, lat_hi, lon_lo, lon_hi) cells, clamping the last row/col."""
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
    """Most common climate_zone among coords in the cell, or None if empty (ocean/unlabeled)."""
    lat_lo, lat_hi, lon_lo, lon_hi = cell
    mask = (lats >= lat_lo) & (lats < lat_hi) & (lons >= lon_lo) & (lons < lon_hi)
    if not mask.any():
        return None
    vals, counts = np.unique(zones[mask], return_counts=True)
    return str(vals[counts.argmax()])


def build_zone_curves(cell_results, low, high, min_total):
    """Sum per-cell (zone, species, fungi) counts into {zone: {species: curve}}; drop data-poor pairs."""
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
    df = df[df["climate_zone"].notna()]  # else unlabeled coords tile as a spurious 'nan' zone
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
    """Tile a macro-region, fetch GBIF facets per land cell in parallel, aggregate to zone curves."""
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
    # Stays at 0.6 deliberately. Dropping it to 0.2 was measured on the Apr-Aug 2026 grid
    # (scripts/qa_season_simulate.py): season AUC 0.931 -> 0.950 and dead-month
    # false positives 4.6% -> 0%, but in-season cell-days above the recommendation
    # threshold fell 56% -> 40%, median onset error rose 15 -> 41 days, and four
    # region-species never reached the threshold at all. The gate in backend/seasonality.py
    # buys the same separation without suppressing the real season, so it does the cutting
    # and this floor only keeps the shoulder season smooth.
    ap.add_argument("--low", type=float, default=0.6, help="multiplier floor (dead-season)")
    ap.add_argument("--high", type=float, default=1.0, help="multiplier ceiling (peak)")
    ap.add_argument("--min-total", type=int, default=200,
                    help="min target sightings to trust a curve")
    ap.add_argument("--cell-size", type=float, default=2.0, help="zone-curve grid cell size (degrees)")
    ap.add_argument("--workers", type=int, default=3, help="parallel GBIF fetch workers for zone curves")
    ap.add_argument("--local-only", action="store_true",
                    help="skip R2 upload and write curves to --out-dir instead")
    ap.add_argument("--out-dir", default=".", help="local output dir (for --local-only)")
    ap.add_argument("--force", action="store_true", help="rebuild even if curves are current this quarter")
    ap.add_argument("--regions-only", action="store_true",
                    help="skip the zone-curve crawl (hundreds of GBIF cell fetches); useful "
                         "for checking a region curve change without a full rebuild")
    args = ap.parse_args()

    load_dotenv(_ROOT / ".env")
    load_dotenv(_ROOT / ".env.secret")

    # Self-gate: skip the (expensive) build unless curves are missing or a new quarter has
    # started. --local-only and --force always build. Safe to schedule this daily — it no-ops
    # except ~once per quarter.
    if not args.local_only and not args.force and not needs_rebuild():
        return

    # 1) Region curves (fallback layer): one curve set per NE/SE/USE/USW.
    for region, reg in REGIONS.items():
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
        dest = (str(Path(args.out_dir) / f"{region}_season_curves.json")
                if args.local_only else get_required_env(reg["env"]))
        print(f"[{region}] {len(curves)} curve(s):")
        save_curves(curves, dest)
        print()

    # 2) Zone curves (primary signal): per-climate-zone, one file per macro-region (EU, US).
    if args.regions_only:
        print("[skip] --regions-only: zone curves not rebuilt")
        return
    for macro_code, macro in MACROS.items():
        print(f"[{macro_code}] building zone curves...")
        curves = build_zone_curves_for_macro(
            macro, args.years, args.low, args.high, args.min_total,
            args.cell_size, args.workers)
        n_curves = sum(len(v) for v in curves.values())
        print(f"[{macro_code}] {n_curves} curve(s) across {len(curves)} zone(s)")
        dest = (str(Path(args.out_dir) / f"{macro_code}_zone_season_curves.json")
                if args.local_only else get_required_env(macro["out_env"]))
        save_curves(curves, dest)
        print()


if __name__ == "__main__":
    main()
