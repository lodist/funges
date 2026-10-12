#!/usr/bin/env python3
"""Does the shipped fruiting GBM keep its edge on the app's own stored weather?

Takes the matched finds and the stored-weather cache that scripts/qa_weather_skill.py
writes, rebuilds each find's stratum as in training (its day and the same place 14 and 21
days either side) and ranks the find day among them with today's hand-set weather part,
the linear fit and the GBM, all from forecast_pipeline's own code and the files in
backend/generated. The GBM's normals and day of year are the find's, as in training.
Net = species minus the bracket placebo, as everywhere in #291.

    python scripts/qa_fruiting_gbm.py --finds ../era5_training/finds-2026-06-14_2026-09-11.csv \\
        --cache ../era5_training/acceptance_cache
"""
import lightgbm  # noqa: F401  before pandas/pyarrow: see tests/conftest.py
import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import requests

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "backend" / "tools"))
sys.path.insert(0, str(ROOT / "scripts"))
import forecast_pipeline as fp  # noqa: E402
from fit_fruiting import PLACEBO, SLOTS, find_day_rank  # noqa: E402
from qa_season_branch_replay import BRANCH_LAG_COLUMNS, load_specs  # noqa: E402
from qa_weather_skill import LAG_DAYS, decompose  # noqa: E402

OFFSETS = sorted(SLOTS, key=SLOTS.get)          # slot order: the find day first
MIN_CASES = 20


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--finds", required=True)
    parser.add_argument("--cache", required=True, help="qa_weather_skill.py's stored-weather cache")
    args = parser.parse_args()
    finds = pd.read_csv(args.finds, parse_dates=["Date"])
    session = requests.Session()
    results = []
    for region in fp.FRUITING_GBM_REGIONS:
        params, zone_curves = load_specs(session, region)
        linear = {k: dict(v) for k, v in params.items()}
        fp.attach_fruiting_models(linear, region)
        gbm = {k: dict(v) for k, v in params.items()}
        fp.attach_fruiting_gbm(gbm, region, pd.Timestamp.now())
        species = sorted(s for s, p in gbm.items() if "fruiting_gbm" in p)
        here = finds[(finds["region"] == region) & finds["species"].isin([*species, PLACEBO])].reset_index(drop=True)
        cached = list(Path(args.cache).glob(f"stored-{region}-*.parquet"))
        if not species or here.empty or not cached:
            continue
        history = pd.read_parquet(cached[0])
        history["Date"] = pd.to_datetime(history["Date"]).dt.normalize()
        days = pd.concat([here[["Location_Id", "Date"]].assign(Date=here["Date"] + pd.Timedelta(days=o))
                          for o in OFFSETS]).drop_duplicates()
        frame = fp.compute_lag_features(history, BRANCH_LAG_COLUMNS + fp.FRUITING_LAG_COLUMNS, LAG_DAYS,
                                        target=history.merge(days, on=["Location_Id", "Date"])).reset_index(drop=True)
        frame = frame.drop_duplicates(["Location_Id", "Date"], keep="last")
        keys = [pd.MultiIndex.from_arrays([here["Location_Id"], here["Date"] + pd.Timedelta(days=o)]) for o in OFFSETS]
        indexed = frame.set_index(["Location_Id", "Date"])
        placebo = (here["species"] == PLACEBO).to_numpy()
        for name in species:
            mine = (here["species"] == name).to_numpy()
            if mine.sum() < MIN_CASES:
                continue
            index = {}
            for label, p in (("today", params), ("linear", linear)):
                parts = decompose(frame, name, p, zone_curves).set_index(["Location_Id", "Date"])["weather_part"]
                parts = parts[~parts.index.duplicated(keep="last")]
                index[label] = np.column_stack([parts.reindex(k).to_numpy(float) for k in keys])
            model, score = gbm[name]["fruiting_gbm"], np.full((len(here), len(OFFSETS)), np.nan)
            for found, group in here.groupby("Date"):          # each stratum anchored at its find
                rows = group.index.to_numpy()
                anchored = {**model, "anchor": found}
                for slot, offset in enumerate(OFFSETS):
                    day = indexed.reindex(pd.MultiIndex.from_arrays(
                        [group["Location_Id"], group["Date"] + pd.Timedelta(days=offset)]))
                    ok = day["TotalPrecipitation_mm"].notna().to_numpy() if "TotalPrecipitation_mm" in day else np.zeros(len(rows), bool)
                    if ok.any():
                        x = fp.fruiting_gbm_features(day[ok].reset_index(), anchored)
                        score[rows[ok], slot] = model["booster"].predict(x, raw_score=True)
            index["gbm"] = score
            mask = np.isfinite(index["today"]) & np.isfinite(score)
            ok = mask[:, 0] & mask[:, 1:3].any(axis=1) & mask[:, 3:].any(axis=1)
            entry = {"species": name, "region": region, "cases": int((mine & ok).sum())}
            for label, values in index.items():
                ranked = np.where(mask, values, -np.inf)
                entry[label] = round(float(find_day_rank(ranked[mine & ok], mask[mine & ok]).mean()
                                           - find_day_rank(ranked[placebo & ok], mask[placebo & ok]).mean()), 3)
            results.append(entry)
            print(f"{region} {name:22s} n={entry['cases']:4d}  today {entry['today']:+.3f}  "
                  f"linear {entry['linear']:+.3f}  gbm {entry['gbm']:+.3f}", flush=True)
    table = pd.DataFrame(results)
    if len(table):
        print(f"\nGBM above linear in {(table['gbm'] > table['linear']).sum()} of {len(table)}, "
              f"above today's in {(table['gbm'] > table['today']).sum()} of {len(table)}")


if __name__ == "__main__":
    main()
