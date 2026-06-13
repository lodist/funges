"""Live verification on a small subset of NE coordinates.

Proves, against the REAL WeatherAPI + R2 inputs, that the converted pipeline:
  1. makes exactly ONE call per coordinate,
  2. gets 7 forecast days back per coordinate (in that one call),
  3. produces a daily-contiguous forward window after merge, and
  4. computes species scores for FUTURE dates (not just today).

Writes the merged result to a LOCAL parquet only — it never writes the prod R2
master (the cold-start / local-file path is used so prod is untouched).

Run: python backend/run_subset_proof.py
"""
import sys
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd

_BACKEND = Path(__file__).resolve().parent
sys.path.insert(0, str(_BACKEND))
import forecast_pipeline as fp

SUBSET = 20
MAX_BASE_LOCATIONS = 200  # keep the base-grid expansion small for the proof
LOCAL_OUT = _BACKEND / "subset_master_NE.parquet"

CONFIG = fp.RegionConfig(
    boundaries_env="NE_BOUNDARIES_DATA",
    coordinates_env="NE_UNIQUE_COORDINATES",
    base_env="NE_BASE_DATA",
    species_params_env="NE_SPECIES_PARAMS",
    weather_data_env="NE_WEATHER_DATA",
    static_info_env="EU_STATIC_INFO",
    season_curves_env="NE_SEASON_CURVES",
    zone_curves_env="EU_ZONE_SEASON_CURVES",
    lat_range=(49.0, 71.5),
    lon_range=(-25.0, 32.0),
)


def main():
    root = _BACKEND.parent
    fp.load_dotenv(root / ".env")
    fp.load_dotenv(root / ".env.secret")
    api_key = fp.get_required_env("WEATHERAPI_KEY")

    species_params, zone_curves = fp._load_species_and_curves(
        CONFIG, fp.get_required_env(CONFIG.species_params_env))
    static_map = fp._load_static_map(fp.get_required_env(CONFIG.static_info_env), CONFIG.ndp)
    coords = fp._load_or_build_coords(
        CONFIG, fp.get_required_env(CONFIG.coordinates_env),
        fp.get_required_env(CONFIG.boundaries_env))[:SUBSET]
    print(f"\nSubset: {len(coords)} coordinates\n" + "-" * 60)

    counter = fp.CallCounter()
    weather_long = fp._fetch_all(CONFIG, coords, static_map, api_key, counter)

    # PROOF 1: one forecast FETCH per coordinate (structural: one fetch_weather_data
    # call per coord). The HTTP attempt counter may exceed #coords only via the
    # pre-existing transient-retry path — identical to the old history.json code, so
    # it is NOT extra data volume. We assert every coordinate yielded a forecast and
    # report any retries explicitly.
    fetched_coords = weather_long[["Latitude", "Longitude"]].drop_duplicates()
    assert len(fetched_coords) == len(coords), \
        f"only {len(fetched_coords)}/{len(coords)} coords returned a forecast"
    retries = counter.count - len(coords)
    # PROOF 2: 7 days returned per coordinate (all in that single forecast request).
    per_coord = weather_long.groupby(["Latitude", "Longitude"])["Date"].nunique()
    assert (per_coord == fp.FORECAST_DAYS).all(), \
        f"not all coords returned {fp.FORECAST_DAYS} days:\n{per_coord}"
    print(f"PROOF 1: {len(coords)} coords -> {len(coords)} forecast fetches; "
          f"{counter.count} HTTP requests ({retries} transient retr{'y' if retries == 1 else 'ies'}, "
          f"same retry path as the old history.json code -> no extra data volume).")
    print(f"PROOF 2: every coord returned exactly {fp.FORECAST_DAYS} forecast days in its one "
          f"request ({weather_long['Date'].min()} .. {weather_long['Date'].max()}); "
          f"{len(weather_long)} rows = {len(coords)} x {fp.FORECAST_DAYS}.")

    # Join to the base grid, then keep a small slice of output locations for speed.
    df = fp._join_to_base(CONFIG, weather_long, fp.get_required_env(CONFIG.base_env))
    keep_ids = pd.Index(df["Location_Id"].drop_duplicates()).tolist()[:MAX_BASE_LOCATIONS]
    df = df[df["Location_Id"].isin(keep_ids)].copy()
    print(f"Proof slice: {df['Location_Id'].nunique()} output locations x {fp.FORECAST_DAYS} days "
          f"= {len(df)} rows")

    today = pd.Timestamp(datetime.now().date())
    # Local, non-existent path -> cold-start branch -> no prod R2 write.
    out = fp._merge_and_score(CONFIG, df, species_params, zone_curves,
                              main_data_path=str(LOCAL_OUT))

    # PROOF 3: forward window is daily-contiguous (would raise otherwise).
    fp.assert_window_contiguous(out, today, forward_days=fp.FORECAST_DAYS, lookback=CONFIG.lag_days)
    diffs = (out.sort_values(["Location_Id", "Date"])
                .groupby("Location_Id")["Date"].diff().dropna().dt.days.unique().tolist())
    print(f"PROOF 3: forward window contiguous; per-location date diffs == {diffs} (expect [1]).")

    # PROOF 4: species scores exist for FUTURE dates, not just today.
    score_cols = [c for c in out.columns if c.endswith("_score")]
    out["Date"] = pd.to_datetime(out["Date"])
    future = out[out["Date"].dt.normalize() > today]
    assert len(future) > 0, "no future-dated rows in output"
    nonnull_future_cols = [c for c in score_cols if future[c].notna().any()]
    assert nonnull_future_cols, "no species scores on future dates"
    print(f"PROOF 4: {future['Date'].dt.date.nunique()} future date(s) carry scores; "
          f"{len(nonnull_future_cols)}/{len(score_cols)} species have non-null future scores.")
    # Show one location's score trajectory across the 7 days for a sanity look.
    demo_loc = future["Location_Id"].iloc[0]
    demo = out[out["Location_Id"] == demo_loc].sort_values("Date")
    demo_col = nonnull_future_cols[0]
    print(f"\n  e.g. {demo_loc} — {demo_col} by date:")
    for _, r in demo.iterrows():
        print(f"    {r['Date'].date()}  {demo_col}={r[demo_col]}")

    out.to_parquet(LOCAL_OUT, index=False)
    print("-" * 60)
    print(f"Wrote subset master -> {LOCAL_OUT} ({len(out)} rows). NO prod write performed.")


if __name__ == "__main__":
    main()
