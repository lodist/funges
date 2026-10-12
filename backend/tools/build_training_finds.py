#!/usr/bin/env python3
"""Every usable GBIF find since 2016, matched to a scoring point, for the training set.

Step 2 of #291. The same finds and matching as scripts/qa_weather_skill.py, over more
years: human observations with coordinates good to 5 km, the species the model scores
plus the perennial-bracket placebo, each on the nearest base point within 10 km
(across both of a continent's regions), one row per species, point and day.

One GBIF query per taxon, continent and year keeps each under GBIF's 100k paging limit.
Each is saved under <out>/finds_cache/ as soon as it is in, so a rerun resumes. The
placebo is sampled: brackets are logged ~25,000 times a year in Europe alone, and the
outing model needs far fewer. Like the ERA5 download, it starts nothing 00:30-06:00.

    python backend/tools/build_training_finds.py --out ../era5_training
"""
from __future__ import annotations

import argparse
import sys
import time
from datetime import datetime
from pathlib import Path

import pandas as pd
import requests

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "scripts"))
import forecast_pipeline as fp  # noqa: E402
from download_era5_points import log, seconds_until_allowed  # noqa: E402
from qa_weather_skill import (  # noqa: E402
    CONTINENTS, PLACEBO, PLACEBO_KEYS, fetch_finds, load_locations, match_finds,
)
from species_registry import get_empirical_taxon_map  # noqa: E402

PLACEBO_MAX_PER_YEAR = 6000  # records per continent and year


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("--first-year", type=int, default=2016)
    parser.add_argument("--last-year", type=int, default=datetime.now().year)
    args = parser.parse_args()
    fp.load_dotenv(ROOT / ".env")
    fp.load_dotenv(ROOT / ".env.secret")

    out = Path(args.out)
    cache = out / "finds_cache"
    cache.mkdir(parents=True, exist_ok=True)
    session = requests.Session()
    session.headers["User-Agent"] = "fung.es training set"
    taxa = {**get_empirical_taxon_map(), PLACEBO: PLACEBO_KEYS}
    for continent, (regions, box) in CONTINENTS.items():
        locations = None
        for species, keys in taxa.items():
            for year in range(args.first_year, args.last_year + 1):
                path = cache / f"{continent}_{species}_{year}.parquet"
                if path.exists():
                    continue
                pause = seconds_until_allowed(datetime.now())
                if pause:
                    log(f"quiet hours: waiting {pause / 3600:.1f} h")
                    time.sleep(pause)
                if locations is None:
                    locations = pd.concat([load_locations(r) for r in regions], ignore_index=True)
                raw = fetch_finds(session, keys, f"{year}-01-01", f"{year}-12-31", box,
                                  max_records=PLACEBO_MAX_PER_YEAR if species == PLACEBO else None)
                found = (match_finds(raw.assign(species=species), locations) if len(raw)
                         else pd.DataFrame(columns=["species", "Location_Id", "region", "Date"]))
                found.assign(year=year).to_parquet(path, index=False)
                log(f"{continent} {species:22s} {year}: {len(raw):6,} records -> "
                    f"{len(found):6,} point-days")

    parts = [pd.read_parquet(p) for p in sorted(cache.glob("*.parquet"))]
    finds = pd.concat([p for p in parts if len(p)], ignore_index=True)
    path = out / f"finds_{args.first_year}_{args.last_year}.parquet"
    finds.to_parquet(path, index=False)
    log(f"wrote {len(finds):,} point-days to {path}")
    log(finds.groupby("species").size().sort_values(ascending=False).to_string())


if __name__ == "__main__":
    main()
