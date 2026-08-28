"""Does the weather model actually work? A case-crossover test on freshly computed scores.

Nothing here reads a stored score. Every score is recomputed from raw R2 weather with the
current code, because the stored series shows a simultaneous cross-region step on
2026-04-25 that weather cannot explain -- almost certainly a deploy, so pre-May stored
scores are a different model.

The design is case-crossover: every GBIF find is compared against *the same grid point on
other days*. That holds constant, by construction, everything the model gets credit for
without deserving it -- habitat, elevation, pH, water distance, climate zone, and observer
effort geography, since a location's popularity with foragers cannot change between its
own control days. Control days are taken symmetrically before and after the find, so the
seasonal ramp cancels too.

What is left varying is weather. So:

    weather_part percentile ~ 0.5  ->  the weather model has no timing skill
    weather_part percentile  > 0.5  ->  it does

The score is a weighted geometric mean, which factors cleanly:

    static_part  = Altitude, pH, Water/Sea      (constant per location)
    weather_part = Temp, Humidity, Moisture, and the lagged wind factor

`static_part` is reported as a built-in null: being constant within a location, it must
come out at exactly 0.5. If it does not, the harness is broken, not the model.
"""

from __future__ import annotations

import argparse
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

import forecast_pipeline as fp
import seasonality as sn
from qa_gbif_scores import REGIONS
from qa_season_analysis import CLIMATOLOGY_YEARS, MIN_CLIMATOLOGY_RECORDS, monthly_rate, month_labels
from qa_season_branch_replay import BRANCH_LAG_COLUMNS, BRANCH_LAG_DAYS, RAW_COLUMNS, add_lags, load_specs
from qa_season_scan import FUNGI

# Component order inside the aggregator, from calculate_mushroom_score.
WEATHER_COMPONENTS = {"Temp", "Humidity", "Moisture"}
NAMES_NO_PH = ["Temp", "Humidity", "Moisture", "Altitude", "Water/Sea"]
NAMES_PH = ["Temp", "Humidity", "Moisture", "Altitude", "pH", "Water/Sea"]
# Control days: far enough from the find that the 7-day moisture window is not shared,
# near enough that the season has not moved. Symmetric, so the seasonal trend cancels.
CONTROL_MIN_LAG, CONTROL_MAX_LAG = 10, 24
MIN_CONTROLS_PER_SIDE = 2
FIRST_SCORED = "2026-05-24"   # 42 full lag days after the R2 history starts


def decompose(
    frame: pd.DataFrame,
    species: str,
    params: dict,
    zone_curves: dict,
    *,
    candidate_components: dict[str, tuple[np.ndarray, float]] | None = None,
) -> pd.DataFrame:
    """Score the frame and return the weather-only and static-only geometric parts."""
    captured = []
    original = fp._hybrid_component_mean_rows

    extras = candidate_components or {}

    def spy(components, weights, **kwargs):
        component_array = np.asarray(components, float)
        weight_array = np.asarray(weights, float)
        base_names = NAMES_PH if component_array.shape[0] == 6 else NAMES_NO_PH
        names = list(base_names)
        if extras:
            component_array = np.vstack(
                [component_array, *[np.asarray(values, float) for values, _weight in extras.values()]]
            )
            weight_array = np.concatenate(
                [weight_array, np.array([weight for _values, weight in extras.values()], float)]
            )
            names.extend(extras)
        captured.append((component_array, weight_array, names))
        return original(component_array, weight_array, **kwargs)

    fp._hybrid_component_mean_rows = spy
    try:
        scored = fp.calculate_mushroom_score(frame.copy(), {species: params[species]}, zone_curves)
    finally:
        fp._hybrid_component_mean_rows = original

    components, weights, names = max(captured, key=lambda item: item[0].shape[0])
    components = np.clip(components, 0.02, 1.0)

    def geometric(selected):
        mask = np.array([n in selected for n in names]) & (weights > 0)
        if not mask.any():
            return np.ones(components.shape[1])
        chosen, chosen_weights = components[mask], weights[mask]
        return np.exp((chosen_weights[:, None] * np.log(chosen)).sum(axis=0) / chosen_weights.sum())

    wind = fp._lagged_wind_factor(frame) if params[species].get("wind_sensitive", False) else 1.0
    identity = ["Location_Id", "Date"]
    identity.extend(column for column in ("Latitude", "Longitude") if column in frame.columns)
    out = frame[identity].copy()
    out["weather_part"] = geometric(WEATHER_COMPONENTS) * wind
    out["static_part"] = geometric(set(names) - WEATHER_COMPONENTS)
    # The calendar also varies between a find and its controls, and near a seasonal peak it
    # is concave -- both earlier and later controls sit lower -- which symmetric controls do
    # not cancel. Carried explicitly so the full score's skill can be attributed.
    out["season_part"] = (sn.season_multiplier_for_species(frame, species, params[species], zone_curves)
                          * sn.season_gate_for_species(frame, species, params[species], zone_curves))
    out["full_score"] = scored[f"{species}_score"].to_numpy()
    return out


def read_history(region: str, locations: set[str]) -> pd.DataFrame:
    url = REGIONS[region][0]
    fs = fsspec.filesystem("https")
    rows = []
    with fs.open(url, "rb", block_size=16 * 1024 * 1024) as handle:
        parquet = pq.ParquetFile(handle)
        for number, batch in enumerate(parquet.iter_batches(columns=RAW_COLUMNS), start=1):
            frame = batch.to_pandas()
            frame["Date"] = pd.to_datetime(frame["Date"]).dt.normalize()
            hit = frame[frame.Location_Id.isin(locations)]
            if not hit.empty:
                rows.append(hit)
            if number % 40 == 0:
                print(f"    {region}: {number} batches", flush=True)
    return (pd.concat(rows, ignore_index=True)
            .drop_duplicates(["Location_Id", "Date"], keep="last")
            .sort_values(["Location_Id", "Date"]).reset_index(drop=True))


def crossover(cases: pd.DataFrame, series: pd.DataFrame, column: str) -> tuple[float | None, int]:
    """Mean percentile of the find day among that same location's symmetric control days."""
    lookup = series.set_index(["Location_Id", "Date"])[column]
    lookup = lookup[~lookup.index.duplicated(keep="last")]
    by_location = {location: group for location, group in series.groupby("Location_Id")}
    percentiles = []
    for row in cases.itertuples(index=False):
        group = by_location.get(row.Location_Id)
        if group is None:
            continue
        offsets = (group.Date - row.Date).dt.days
        window = group[(offsets.abs() >= CONTROL_MIN_LAG) & (offsets.abs() <= CONTROL_MAX_LAG)]
        if window.empty:
            continue
        before = window[window.Date < row.Date]
        after = window[window.Date > row.Date]
        if len(before) < MIN_CONTROLS_PER_SIDE or len(after) < MIN_CONTROLS_PER_SIDE:
            continue
        case_value = lookup.get((row.Location_Id, row.Date))
        controls = window[column].to_numpy(float)
        controls = controls[np.isfinite(controls)]
        if case_value is None or not np.isfinite(case_value) or not len(controls):
            continue
        percentiles.append((np.sum(controls < case_value) + 0.5 * np.sum(controls == case_value))
                           / len(controls))
    if not percentiles:
        return None, 0
    return float(np.mean(percentiles)), len(percentiles)


def bootstrap_ci(values: list[float], seed: int = 20260814) -> tuple[float, float]:
    rng = np.random.default_rng(seed)
    array = np.asarray(values, float)
    means = [float(rng.choice(array, size=len(array), replace=True).mean()) for _ in range(2000)]
    low, high = np.quantile(means, [0.025, 0.975])
    return round(float(low), 3), round(float(high), 3)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--truth",
        default="docs/qa/model-evaluation-2026/seasonal-ground-truth/gbif-season-truth.json",
    )
    parser.add_argument("--scan", default="docs/qa/model-evaluation-2026/seasonal-timing")
    parser.add_argument("--regions", default="NE,SE,USE,USW")
    parser.add_argument(
        "--output",
        default="docs/qa/model-evaluation-2026/seasonal-timing/weather-skill.json",
    )
    args = parser.parse_args()
    truth = json.loads(Path(args.truth).read_text(encoding="utf-8"))
    session = requests.Session()
    session.headers["User-Agent"] = "fung.es weather skill QA"
    first = pd.Timestamp(FIRST_SCORED)

    results, pooled = {}, {"weather_part": [], "static_part": [], "full_score": []}
    for region in args.regions.split(","):
        matched_path = Path(args.scan) / f"observation-scores-{region}.csv"
        if not matched_path.exists():
            print(f"skip {region}: {matched_path} missing", flush=True)
            continue
        matched = pd.read_csv(matched_path)
        matched["Date"] = pd.to_datetime(matched.date)
        matched = matched[matched.Date >= first]
        if matched.empty:
            print(f"skip {region}: no finds inside the replayable window", flush=True)
            continue

        locations = set(matched.location_id.dropna())
        print(f"{region}: {len(matched):,} finds at {len(locations):,} locations", flush=True)
        history = read_history(region, locations)
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
            cases = matched[(matched.species_id == species)
                            & matched.Date.dt.month.isin(in_season)].copy()
            cases = cases.rename(columns={"location_id": "Location_Id"})
            cases = cases.drop_duplicates(["Location_Id", "Date"])
            if len(cases) < 20:
                continue
            allowed = params[species].get("climate_zones", [])
            scored = decompose(
                frame[frame.climate_zone.isin(allowed)] if allowed else frame,
                species, params, zone_curves,
            )
            entry = {"cases_available": int(len(cases))}
            for column in ("weather_part", "static_part", "season_part", "full_score"):
                value, used = crossover(cases, scored, column)
                entry[column] = None if value is None else round(value, 3)
                entry[f"{column}_n"] = used
            results[region][species] = entry
            print(f"  {species:12s} n={entry.get('weather_part_n', 0):4d}  "
                  f"weather={entry['weather_part']}  static={entry['static_part']}  "
                  f"season={entry['season_part']}  full={entry['full_score']}", flush=True)

    Path(args.output).write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(f"\nwrote {args.output}")
    print("\n0.500 means the weather on the day people found things was no better than the "
          "weather at the same spot a fortnight earlier or later.")
    for column in ("static_part", "weather_part", "season_part", "full_score"):
        values = [entry[column] for region in results.values() for entry in region.values()
                  if entry.get(column) is not None]
        weights = [entry[f"{column}_n"] for region in results.values() for entry in region.values()
                   if entry.get(column) is not None]
        if not values:
            continue
        weighted = float(np.average(values, weights=weights))
        low, high = bootstrap_ci(values)
        label = " (null check, must be 0.500)" if column == "static_part" else ""
        print(f"  {column:13s} case-weighted {weighted:.3f}   median {np.median(values):.3f}   "
              f"95% CI over {len(values)} region-species {low}-{high}{label}")


if __name__ == "__main__":
    main()
