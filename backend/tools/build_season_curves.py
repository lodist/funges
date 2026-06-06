#!/usr/bin/env python3
"""Generate empirical seasonal multiplier curves from GBIF target-group sighting ratios.

For each region and target species this queries GBIF for monthly sighting counts of the
target taxon and of all Fungi (the "target group"), over a multi-year window, within the
region bounding box. The target-group ratio (target / all-fungi, per month) cancels
observer-effort bias, so even sparsely-observed regions yield a correct seasonal *shape*
(e.g. Turkey recovers a September Boletus peak from a handful of records). The normalized
ratio is mapped to a bounded multiplier and written as `season_curve` (12 monthly values)
per species. The *_Scoring.py scripts load these curves (from the same <REGION>_SEASON_CURVES
path) and apply a smooth, data-driven seasonal multiplier in place of the flat season_months
ramp; species without a curve fall back to season_months.

Each region's curves are published to its <REGION>_SEASON_CURVES destination — an R2 URL is
uploaded via boto3 (same R2_* credentials / .env as the scoring scripts); a local path is
written to disk. No GBIF account or API key is required (public occurrence-search facets).

Usage:
    python build_season_curves.py                      # all regions -> their *_SEASON_CURVES dest
    python build_season_curves.py --regions NE,SE --years 2019,2025 --low 0.8 --high 1.2
    python build_season_curves.py --out-dir ./curves --local-only   # skip R2, write local only

Caveats:
  * This is a *seasonality* (when) signal, robust to observer effort via the ratio.
    It is NOT a "good year vs bad year" signal — year-to-year ratios reintroduce effort
    bias and need separate, more careful treatment.
  * Genus keys match the taxon and all descendants, so e.g. Boletus captures edulis,
    aestivalis, pinophilus, reticulatus. Extend TAXON_MAP with verified keys only
    (resolve via https://api.gbif.org/v1/species/match and check the result).
"""
import argparse
import json
import os
import time
import urllib.parse
import urllib.request
from io import BytesIO
from pathlib import Path
from urllib.parse import urlparse

import boto3

GBIF = "https://api.gbif.org/v1/occurrence/search"
FUNGI_KEY = 5  # Kingdom Fungi — the target-group / observer-effort denominator

# app-species -> verified GBIF taxonKey(s). taxonKey matches the taxon and all descendants.
TAXON_MAP = {
    "mushroom":    [8287374],  # Boletus (genus): edulis, aestivalis, pinophilus, reticulatus, ...
    "morel":       [2594601],  # Morchella (genus): all morels
    "black_chant": [2554662],  # Craterellus cornucopioides (horn of plenty / black chanterelle)
    "parasol":     [8914748],  # Macrolepiota procera
    "st_george":   [8936224],  # Calocybe gambosa
    "truffle_b":   [8282501],  # Tuber (genus)
}

# region -> (bounding box matching each *_Scoring.py grid extent, env var for the destination)
REGIONS = {
    "NE":  {"lat": (49.0, 71.5), "lon": (-25.0, 32.0),    "env": "NE_SEASON_CURVES"},
    "SE":  {"lat": (34.0, 55.5), "lon": (12.0, 42.5),     "env": "SE_SEASON_CURVES"},
    "USE": {"lat": (24.0, 37.5), "lon": (-106.5, -75.0),  "env": "USE_SEASON_CURVES"},
    "USW": {"lat": (33.0, 49.5), "lon": (-125.5, -81.5),  "env": "USW_SEASON_CURVES"},
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


def save_curves(data, dest):
    """Write curves JSON to dest: upload to R2 when dest is a URL, else write to a local path."""
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
    """Return ({month: count} for 1..12, total_count) for the given taxa in the region/window."""
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
    """Map the target-group ratio to a bounded [low, high] monthly multiplier.

    Returns (curve|None, total). None when there are too few sightings to trust —
    the scoring then falls back to season_months for that species.
    """
    total = sum(target_counts.values())
    ratio = {m: (target_counts[m] / fungi_counts[m] if fungi_counts[m] else 0.0) for m in range(1, 13)}
    mx = max(ratio.values())
    if total < min_total or mx <= 0:
        return None, total
    curve = {m: round(low + (high - low) * (ratio[m] / mx), 3) for m in range(1, 13)}
    return curve, total


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--years", default="2019,2025", help="GBIF year range, e.g. 2019,2025")
    ap.add_argument("--low", type=float, default=0.8, help="multiplier floor (off-peak)")
    ap.add_argument("--high", type=float, default=1.2, help="multiplier ceiling (peak)")
    ap.add_argument("--min-total", type=int, default=200,
                    help="min target sightings in a region to trust its curve")
    ap.add_argument("--regions", default=",".join(REGIONS), help="comma-separated region codes")
    ap.add_argument("--local-only", action="store_true",
                    help="ignore <REGION>_SEASON_CURVES and write to --out-dir instead")
    ap.add_argument("--out-dir", default=".", help="local output dir (for --local-only)")
    args = ap.parse_args()

    load_dotenv(_ROOT / ".env")
    load_dotenv(_ROOT / ".env.secret")

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
