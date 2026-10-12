#!/usr/bin/env python3
"""Does blending a region's model into its neighbour's (forecast_pipeline.blend_neighbour_settings)
rank held-out finds as well as the region's own model?

qa_spatial_weights.py's summer 2026 strata (each find with up to 10 places searched within
+-3 days, scored on the app's stored weather) are scored twice per region: with the region's own
model, as before the blend, and blended with the neighbour's, both loaded as the nightly run
loads them. Per species-region, the find-day rank (fit_fruiting.find_day_rank) on the cases the
blend touches (the find or a comparison place leaning to the neighbour), with a bootstrap CI.

    python scripts/qa_region_blend.py --strata ../era5_training/spatial/spatial_strata.parquet \\
        --cache ../era5_training/acceptance_cache --out ../era5_training/region_blend.csv
"""
import lightgbm  # noqa: F401  before pandas/pyarrow: see tests/conftest.py
import argparse
import sys
from dataclasses import replace
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "backend"), str(ROOT / "backend" / "tools"), str(ROOT / "scripts")]
import forecast_pipeline as fp  # noqa: E402
from fit_fruiting import bootstrap, find_day_rank  # noqa: E402
from qa_season_branch_replay import BRANCH_LAG_COLUMNS  # noqa: E402
from qa_spatial_weights import MIN_CASES, region_config, stack  # noqa: E402
from qa_weather_skill import LAG_DAYS  # noqa: E402


def anchored(params, day):
    """A GBM reads the day of the year from its anchor, the run's today: here the find's day."""
    return {s: ({**p, "fruiting_gbm": {**p["fruiting_gbm"], "anchor": day}} if "fruiting_gbm" in p else p)
            for s, p in params.items()}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--strata", required=True)
    parser.add_argument("--cache", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    fp.load_dotenv(ROOT / ".env")
    fp.load_dotenv(ROOT / ".env.secret")
    layout_all = pd.read_parquet(args.strata, columns=["case", "slot", "species", "Location_Id", "Date", "region"])
    layout_all["Date"] = pd.to_datetime(layout_all["Date"]).dt.normalize()
    rows = []
    for region in ("USW", "USE", "NE", "SE"):
        layout = layout_all[layout_all["region"] == region]
        counts = layout.groupby("species")["case"].nunique()
        config = region_config(region)
        params, zone_curves = fp._load_species_and_curves(config)
        species = [s for s in counts[counts >= MIN_CASES].index if s in params]
        other = fp.NEIGHBOUR_REGION[region]
        neighbour = fp._load_species_and_curves(replace(config, region=other, season_curves_env=f"{other}_SEASON_CURVES"))
        history = pd.read_parquet(next(Path(args.cache).glob(f"stored-{region}-*.parquet")))
        history["Date"] = pd.to_datetime(history["Date"]).dt.normalize()
        need = layout[["Location_Id", "Date"]].drop_duplicates()
        frame = fp.compute_lag_features(history, BRANCH_LAG_COLUMNS + fp.FRUITING_LAG_COLUMNS, LAG_DAYS,
                                        target=history.merge(need, on=["Location_Id", "Date"]))
        frame = frame.drop_duplicates(["Location_Id", "Date"], keep="last").reset_index(drop=True)
        lists = None
        if region in ("NE", "SE"):
            lists = tuple(fp._load_coords_any(fp.get_required_env(f"{r}_UNIQUE_COORDINATES")) for r in (region, other))
        frame["w"] = fp.own_settings_weight(region, frame["Latitude"].to_numpy(float), frame["Longitude"].to_numpy(float), lists)
        pieces = []
        for day, here in frame.groupby("Date"):
            mine = anchored({s: params[s] for s in species}, day)
            theirs = (anchored(neighbour[0], day), neighbour[1])
            own = fp.calculate_mushroom_score(here.reset_index(drop=True), mine, zone_curves)
            scores = own[["Location_Id", "Date", "w"] + [f"{s}_score" for s in species]].copy()
            blended = fp.blend_neighbour_settings(own.copy(), mine, config, neighbour=theirs)
            for s in species:
                scores[f"{s}_blend"] = blended[f"{s}_score"].to_numpy()
            pieces.append(scores)
        scores = pd.concat(pieces, ignore_index=True)
        for s in species:
            table = layout[layout["species"] == s].merge(scores, on=["Location_Id", "Date"], how="left")
            touched = table.groupby("case")["w"].transform("min") < 1
            table = table[touched]
            if table["case"].nunique() < MIN_CASES:
                continue
            x, mask, _ = stack(table, [f"{s}_score", f"{s}_blend"])
            before, after = find_day_rank(x[..., 0], mask), find_day_rank(x[..., 1], mask)
            rows.append({"region": region, "species": s, "cases touched": len(before),
                         "own": round(float(before.mean()), 3), "blended": round(float(after.mean()), 3),
                         "ci of blended - own": bootstrap(after, before)})
            print(rows[-1], flush=True)
    result = pd.DataFrame(rows)
    result.to_csv(args.out, index=False)
    pd.set_option("display.width", 200)
    print(result.to_string(index=False))


if __name__ == "__main__":
    main()
