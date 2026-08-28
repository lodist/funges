"""Does weather carry spatial signal over and above static habitat -- and is it weather or climate?

The case-crossover test in qa_weather_skill.py holds location fixed, so it can only speak
about picking the right *day* at one spot. It cannot speak about Finland versus Spain. This
script asks the other question.

Two things get measured, both within-day and across-location (so the calendar is identical
for every cell being compared, and cannot contribute):

1. Does `weather_part` rank find-cells above background cells better than `static_part`
   does? A uniform grid background does not control observer effort, so the absolute
   numbers are inflated -- but effort inflates static and weather alike, so the *increment*
   from weather over static is still meaningful.

2. Is that weather signal actual weather, or climate wearing a weather-shaped formula?
   Finland is reliably cooler and wetter than Spain every year, so a location's
   *season-mean* weather is effectively a static property. Comparing the day-specific
   weather score against each location's own season mean separates the two:

       season-mean ranks as well as day-specific  ->  the spatial signal is climate
       day-specific ranks better                  ->  genuine weather information
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

import fsspec
import numpy as np
import pandas as pd
import pyarrow.parquet as pq
import requests

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "scripts"))

from qa_gbif_scores import REGIONS
from qa_season_analysis import (
    CLIMATOLOGY_YEARS, MIN_CLIMATOLOGY_RECORDS, auc_from_ranks, monthly_rate, month_labels,
)
from qa_season_branch_replay import BRANCH_LAG_COLUMNS, BRANCH_LAG_DAYS, RAW_COLUMNS, add_lags, load_specs
from qa_season_scan import FUNGI
from qa_weather_skill import FIRST_SCORED, decompose

BACKGROUND_LOCATIONS = 1500


def pick_background(coordinates: pd.DataFrame) -> set[str]:
    modulus = max(1, round(len(coordinates) / BACKGROUND_LOCATIONS))
    digest = coordinates.Location_Id.astype(str).map(
        lambda value: int(hashlib.blake2b(value.encode(), digest_size=8).hexdigest(), 16))
    return set(coordinates[(digest % modulus == 0).to_numpy()].Location_Id)


def read_history(region: str, locations: set[str]) -> tuple[pd.DataFrame, pd.DataFrame]:
    url = REGIONS[region][0]
    fs = fsspec.filesystem("https")
    rows, coordinate_pieces = [], []
    with fs.open(url, "rb", block_size=16 * 1024 * 1024) as handle:
        parquet = pq.ParquetFile(handle)
        for batch in parquet.iter_batches(columns=["Location_Id", "Latitude", "Longitude"]):
            coordinate_pieces.append(batch.to_pandas().drop_duplicates("Location_Id"))
        coordinates = (pd.concat(coordinate_pieces, ignore_index=True)
                       .drop_duplicates("Location_Id").reset_index(drop=True))
        background = pick_background(coordinates)
        wanted = locations | background
        print(f"  {len(coordinates):,} grid points; reading {len(wanted):,} "
              f"({len(background):,} background)", flush=True)
        for number, batch in enumerate(parquet.iter_batches(columns=RAW_COLUMNS), start=1):
            frame = batch.to_pandas()
            frame["Date"] = pd.to_datetime(frame["Date"]).dt.normalize()
            hit = frame[frame.Location_Id.isin(wanted)]
            if not hit.empty:
                rows.append(hit)
            if number % 40 == 0:
                print(f"    {region}: {number} batches", flush=True)
    history = (pd.concat(rows, ignore_index=True)
               .drop_duplicates(["Location_Id", "Date"], keep="last")
               .sort_values(["Location_Id", "Date"]).reset_index(drop=True))
    return history, pd.Series(sorted(background), name="Location_Id").to_frame()


def within_day_auc(scored: pd.DataFrame, cases: set[tuple], column: str) -> tuple[float | None, int]:
    """Pool per-day AUCs so every comparison shares one calendar date."""
    aucs, weights = [], []
    for date, group in scored.groupby("Date"):
        key = date.strftime("%Y-%m-%d")
        positive = np.array([(location, key) in cases for location in group.Location_Id])
        if not positive.any() or positive.all():
            continue
        values = group[column].to_numpy(float)
        finite = np.isfinite(values)
        if finite.sum() < 10 or not positive[finite].any() or positive[finite].all():
            continue
        value = auc_from_ranks(values[finite], positive[finite])
        if value is None:
            continue
        aucs.append(value)
        weights.append(int(positive[finite].sum()))
    if not aucs:
        return None, 0
    return float(np.average(aucs, weights=weights)), int(sum(weights))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--truth",
        default="docs/qa/model-evaluation-2026/seasonal-ground-truth/gbif-season-truth.json",
    )
    parser.add_argument("--scan", default="docs/qa/model-evaluation-2026/seasonal-timing")
    parser.add_argument("--regions", default="NE,USE")
    parser.add_argument(
        "--output",
        default="docs/qa/model-evaluation-2026/seasonal-timing/weather-spatial.json",
    )
    args = parser.parse_args()
    truth = json.loads(Path(args.truth).read_text(encoding="utf-8"))
    session = requests.Session()
    session.headers["User-Agent"] = "fung.es weather spatial QA"
    first = pd.Timestamp(FIRST_SCORED)

    results = {}
    for region in args.regions.split(","):
        matched = pd.read_csv(Path(args.scan) / f"observation-scores-{region}.csv")
        matched["Date"] = pd.to_datetime(matched.date)
        matched = matched[matched.Date >= first]
        print(f"{region}: {len(matched):,} finds in window", flush=True)
        history, _background = read_history(region, set(matched.location_id.dropna()))
        frame = add_lags(history, BRANCH_LAG_COLUMNS, BRANCH_LAG_DAYS)
        frame = frame[frame.Date >= first].reset_index(drop=True)
        params, zone_curves = load_specs(session, region)
        results[region] = {}

        for species in FUNGI:
            records = sum(sum(truth["climatology_monthly"][region][species][y].values())
                          for y in CLIMATOLOGY_YEARS)
            if records < MIN_CLIMATOLOGY_RECORDS:
                continue
            rates = monthly_rate(truth, region, species)
            if not np.isfinite(rates).any():
                continue
            in_season, _dead = month_labels(rates)
            found = matched[(matched.species_id == species)
                            & matched.Date.dt.month.isin(in_season)]
            if len(found) < 20:
                continue
            cases = set(zip(found.location_id, found.Date.dt.strftime("%Y-%m-%d")))

            allowed = params[species].get("climate_zones", [])
            eligible = frame[frame.climate_zone.isin(allowed)] if allowed else frame
            scored = decompose(eligible, species, params, zone_curves)
            scored = scored[scored.Date.dt.month.isin(in_season)].copy()
            if scored.empty:
                continue
            # Each location's own season mean: a static property, since Finland is reliably
            # wetter than Spain regardless of the day.
            scored["weather_climate"] = scored.groupby("Location_Id").weather_part.transform("mean")
            scored["weather_anomaly"] = scored.weather_part - scored.weather_climate

            entry = {}
            for column in ("static_part", "weather_part", "weather_climate",
                           "weather_anomaly", "full_score"):
                value, used = within_day_auc(scored, cases, column)
                entry[column] = None if value is None else round(value, 3)
                entry[f"{column}_n"] = used
            results[region][species] = entry
            print(f"  {species:12s} n={entry['weather_part_n']:4d}  static={entry['static_part']}  "
                  f"weather={entry['weather_part']}  climate={entry['weather_climate']}  "
                  f"anomaly={entry['weather_anomaly']}  full={entry['full_score']}", flush=True)

    Path(args.output).write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(f"\nwrote {args.output}")
    print("\nWithin-day, across-location AUC. 0.5 = no spatial information.")
    print("Effort is uncontrolled, so read the gaps between columns, not the levels.")
    for column in ("static_part", "weather_part", "weather_climate", "weather_anomaly", "full_score"):
        values = [entry[column] for region in results.values() for entry in region.values()
                  if entry.get(column) is not None]
        weights = [entry[f"{column}_n"] for region in results.values() for entry in region.values()
                   if entry.get(column) is not None]
        if values:
            print(f"  {column:17s} case-weighted {np.average(values, weights=weights):.3f}   "
                  f"median {np.median(values):.3f}   over {len(values)} region-species")


if __name__ == "__main__":
    main()
