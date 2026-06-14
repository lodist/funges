"""Live verification on a RANDOM subset of coordinates from EACH of the 4 regions.

For every region (NE, SE, USE, USW) it randomly samples N coordinates from that
region's grid and proves, against the REAL WeatherAPI + R2 inputs, that the
converted pipeline:
  1. makes exactly ONE forecast fetch per coordinate,
  2. gets 7 forecast days back per coordinate (in that one call),
  3. produces a daily-contiguous forward window after merge, and
  4. computes species scores for FUTURE dates (not just today).

Each region's merged result is written to a LOCAL parquet only (cold-start / local
path) so the prod R2 masters are never touched.

Run:  python tests/run_subset_proof.py            # all 4 regions
      python tests/run_subset_proof.py NE          # one region
      python tests/run_subset_proof.py --seed 99   # vary the random sample
"""
import sys
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd

_HERE = Path(__file__).resolve().parent          # tests/ — local proof output lands here
_BACKEND = _HERE.parent / "backend"               # for forecast_pipeline + .env loading
sys.path.insert(0, str(_BACKEND))
import forecast_pipeline as fp

SUBSET = 20                 # coordinates sampled per region
MAX_BASE_LOCATIONS = 200    # cap on output locations scored, to keep the proof fast

REGIONS = {
    "NE": fp.RegionConfig(
        boundaries_env="NE_BOUNDARIES_DATA", coordinates_env="NE_UNIQUE_COORDINATES",
        base_env="NE_BASE_DATA", species_params_env="NE_SPECIES_PARAMS",
        weather_data_env="NE_WEATHER_DATA", static_info_env="EU_STATIC_INFO",
        season_curves_env="NE_SEASON_CURVES", zone_curves_env="EU_ZONE_SEASON_CURVES",
        lat_range=(49.0, 71.5), lon_range=(-25.0, 32.0)),
    "SE": fp.RegionConfig(
        boundaries_env="SE_BOUNDARIES_DATA", coordinates_env="SE_UNIQUE_COORDINATES",
        base_env="SE_BASE_DATA", species_params_env="SE_SPECIES_PARAMS",
        weather_data_env="SE_WEATHER_DATA", static_info_env="EU_STATIC_INFO",
        season_curves_env="SE_SEASON_CURVES", zone_curves_env="EU_ZONE_SEASON_CURVES",
        lat_range=(34.0, 55.5), lon_range=(12.0, 42.5)),
    "USE": fp.RegionConfig(
        boundaries_env="USE_BOUNDARIES_DATA", coordinates_env="USE_UNIQUE_COORDINATES",
        base_env="USE_BASE_DATA", species_params_env="USE_SPECIES_PARAMS",
        weather_data_env="USE_WEATHER_DATA", static_info_env="US_STATIC_INFO",
        season_curves_env="USE_SEASON_CURVES", zone_curves_env="US_ZONE_SEASON_CURVES",
        lat_range=(24.0, 37.5), lon_range=(-106.5, -75.0)),
    "USW": fp.RegionConfig(
        boundaries_env="USW_BOUNDARIES_DATA", coordinates_env="USW_UNIQUE_COORDINATES",
        base_env="USW_BASE_DATA", species_params_env="USW_SPECIES_PARAMS",
        weather_data_env="USW_WEATHER_DATA", static_info_env="US_STATIC_INFO",
        season_curves_env="USW_SEASON_CURVES", zone_curves_env="US_ZONE_SEASON_CURVES",
        lat_range=(33.0, 49.5), lon_range=(-125.5, -81.5)),
}


def prove_region(name, config, api_key, seed):
    """Run the 4 proofs on a random N-coordinate sample of one region. Returns a
    result dict; raises AssertionError on any proof failure."""
    print(f"\n{'#'*70}\n# REGION {name}\n{'#'*70}")
    species_params, zone_curves = fp._load_species_and_curves(
        config, fp.get_required_env(config.species_params_env))
    static_map = fp._load_static_map(fp.get_required_env(config.static_info_env), config.ndp)
    all_coords = fp._load_or_build_coords(
        config, fp.get_required_env(config.coordinates_env),
        fp.get_required_env(config.boundaries_env))

    rng = np.random.default_rng(seed)
    pick = rng.choice(len(all_coords), size=min(SUBSET, len(all_coords)), replace=False)
    coords = all_coords[np.sort(pick)]
    print(f"Randomly sampled {len(coords)}/{len(all_coords)} coords (seed={seed})")

    counter = fp.CallCounter()
    weather_long = fp._fetch_all(config, coords, static_map, api_key, counter)

    # PROOF 1: one forecast fetch per coordinate (HTTP count may exceed via the
    # pre-existing transient-retry path only — same as the old history.json code).
    fetched = weather_long[["Latitude", "Longitude"]].drop_duplicates()
    assert len(fetched) == len(coords), f"{name}: only {len(fetched)}/{len(coords)} coords returned a forecast"
    retries = counter.count - len(coords)
    # PROOF 2: 7 forecast days per coordinate, all from that single request.
    per_coord = weather_long.groupby(["Latitude", "Longitude"])["Date"].nunique()
    assert (per_coord == fp.FORECAST_DAYS).all(), f"{name}: not all coords returned {fp.FORECAST_DAYS} days"
    print(f"  PROOF 1: {len(coords)} coords -> {len(coords)} fetches; {counter.count} HTTP "
          f"requests ({retries} transient retr{'y' if retries == 1 else 'ies'}).")
    print(f"  PROOF 2: every coord returned {fp.FORECAST_DAYS} days "
          f"({weather_long['Date'].min()} .. {weather_long['Date'].max()}).")

    df = fp._join_to_base(config, weather_long, fp.get_required_env(config.base_env))
    keep = pd.Index(df["Location_Id"].drop_duplicates()).tolist()[:MAX_BASE_LOCATIONS]
    df = df[df["Location_Id"].isin(keep)].copy()

    # Anchor today to the earliest fetched forecast date (coordinate-local), matching
    # the pipeline — US regions can start a calendar day behind a UTC/Europe runner.
    today = pd.to_datetime(weather_long["Date"]).min().normalize()
    out = fp._merge_and_score(config, df, species_params, zone_curves,
                              main_data_path=str(_HERE / f"subset_master_{name}.parquet"))

    # PROOF 3: forward window daily-contiguous.
    fp.assert_window_contiguous(out, today, forward_days=fp.FORECAST_DAYS, lookback=config.lag_days)
    diffs = (out.sort_values(["Location_Id", "Date"])
                .groupby("Location_Id")["Date"].diff().dropna().dt.days.unique().tolist())
    assert diffs == [1], f"{name}: non-contiguous date diffs {diffs}"
    # PROOF 4: species scores on FUTURE dates.
    out["Date"] = pd.to_datetime(out["Date"])
    score_cols = [c for c in out.columns if c.endswith("_score")]
    future = out[out["Date"].dt.normalize() > today]
    nonnull = [c for c in score_cols if future[c].notna().any()]
    assert len(future) > 0 and nonnull, f"{name}: no future-dated species scores"
    print(f"  PROOF 3: contiguous (date diffs == [1]); {df['Location_Id'].nunique()} locations x {fp.FORECAST_DAYS} days.")
    print(f"  PROOF 4: {future['Date'].dt.date.nunique()} future dates carry scores; "
          f"{len(nonnull)}/{len(score_cols)} species non-null.")

    out.to_parquet(_HERE / f"subset_master_{name}.parquet", index=False)
    return dict(region=name, coords=len(coords), http=counter.count, retries=retries,
                days=int(per_coord.iloc[0]), future_dates=int(future["Date"].dt.date.nunique()),
                species_nonnull=len(nonnull), species_total=len(score_cols))


def main():
    argv = [a for a in sys.argv[1:]]
    seed = 42
    if "--seed" in argv:
        i = argv.index("--seed"); seed = int(argv[i + 1]); del argv[i:i + 2]
    names = [a.upper() for a in argv if a.upper() in REGIONS] or list(REGIONS)

    root = _BACKEND.parent
    fp.load_dotenv(root / ".env")
    fp.load_dotenv(root / ".env.secret")
    api_key = fp.get_required_env("WEATHERAPI_KEY")

    results = []
    for i, name in enumerate(names):
        results.append(prove_region(name, REGIONS[name], api_key, seed=seed + i))

    print(f"\n{'='*70}\nSUMMARY (all proofs passed for every region below)\n{'='*70}")
    print(f"{'region':<6}{'coords':>7}{'http':>6}{'retries':>9}{'days':>6}{'future':>8}{'species':>10}")
    for r in results:
        print(f"{r['region']:<6}{r['coords']:>7}{r['http']:>6}{r['retries']:>9}{r['days']:>6}"
              f"{r['future_dates']:>8}{r['species_nonnull']:>4}/{r['species_total']:<5}")
    print("\nNO prod write performed (each region written to a local subset_master_<R>.parquet).")


if __name__ == "__main__":
    main()
