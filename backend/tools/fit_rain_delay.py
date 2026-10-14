#!/usr/bin/env python3
"""A rain delay for the hand-set boletes: their rain part waits as their finds do.

Every bolete's finds peak 14-19 days after rain (net of the bracket-fungus placebo, 14 Oct 2026),
but a hand-set rain part answers last week's rain. Where no fit ships (pine and bronze bolete in
South Europe, eastern and rocky king), rain_delay_days moves the hand-set windows back
(forecast_pipeline._moisture_memory_score). The delay is chosen and tested as the fits are:

  --parts  each find's and bracket-fungus day's weather parts recomputed from the ERA5 blocks with
           the code that built training_scores (tools/build_training_table.baseline), the rain part
           at every delay in DELAYS -> <out>/rain_delay/<block>.parquet
  --test   per species-region: each year scored with the delay chosen on the other years (the one
           ranking find days highest over today's, by MIN_GAIN), against delay 0; shipped by the
           fits' rule or, with fewer than SHIP_MIN_YEARS test years, a pooled held-out gain (>=
           MIN_POOLED finds, week-resampled CI above 0). Then the place test on the full score
           (tools/fit_fruiting_parts.places). -> <out>/rain_delay.csv

    python backend/tools/fit_rain_delay.py --out ../era5_training --parts
    python backend/tools/fit_rain_delay.py --out ../era5_training --test
"""
import lightgbm  # noqa: F401  before pandas/pyarrow: see tests/conftest.py
import argparse
import sys
from io import StringIO
from multiprocessing import Pool
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT / "backend" / "tools"), str(ROOT / "backend"), str(ROOT / "scripts")]
import forecast_pipeline as fp  # noqa: E402
from fit_fruiting import (CONTINENT, MIN_POOLED, MIN_TEST_STRATA, PLACEBO, SHIP_MIN_YEARS, find_day_rank,  # noqa: E402
                          group_ships, sign_test, strata, transform)
from fit_fruiting_parts import (PARTS, STORED_WITH, full_score, place_parts, places, pooled_gain,  # noqa: E402
                                weather, wide)

TARGETS = [("bronze_bolete", "SE"), ("pine_bolete", "SE"), ("eastern_king", "USE"), ("eastern_king", "USW"),
           ("rocky_king", "USW")]
DELAYS = (0, 3, 7, 10, 14)
MIN_GAIN = 0.002
_SPECS = {}


def _load_specs():
    import requests
    from qa_season_branch_replay import load_specs
    fp.load_dotenv(ROOT / ".env")
    fp.load_dotenv(ROOT / ".env.secret")
    session = requests.Session()
    _SPECS.update({r: load_specs(session, r) for r in sorted({r for _, r in TARGETS})})


def block_parts(job):
    """One block's target rows: temperature, humidity, the weather part (delay 0, wind included)
    and the rain part at every delay, per species."""
    import build_training_table as tt
    from qa_season_branch_replay import BRANCH_LAG_COLUMNS
    from qa_weather_skill import decompose
    training_path, block_path, out = job
    rows = pd.read_parquet(training_path, columns=["case_id", "species", "region", "offset", "date", "cell_lat", "cell_lon"])
    want = {r: [s for s, rr in TARGETS if rr == r] for _, r in TARGETS}
    rows = rows[rows["region"].isin(want) & (rows["species"].isin({s for s, _ in TARGETS}) | (rows["species"] == PLACEBO))]
    rows = rows[[s == PLACEBO or s in want[r] for s, r in zip(rows["species"], rows["region"])]]
    if rows.empty:
        return 0
    block = pd.read_parquet(block_path)
    history = tt._history(block)
    rows = rows.assign(Location_Id=rows["cell_lat"].round(2).astype(str) + "_" + rows["cell_lon"].round(2).astype(str),
                       Date=pd.to_datetime(rows["date"]))
    target = history.merge(rows[["Location_Id", "Date"]].drop_duplicates(), on=["Location_Id", "Date"])
    if target.empty:
        return 0
    frame = fp.compute_lag_features(history, BRANCH_LAG_COLUMNS, tt.LAG_DAYS, target=target).reset_index(drop=True)
    pieces = []
    for region, here in rows.groupby("region"):
        params, zone_curves = _SPECS[region]
        for species in want[region]:
            subset = here[(here["species"] == species) | (here["species"] == PLACEBO)]
            p = params[species]
            parts = decompose(frame, species, params, zone_curves)[["Location_Id", "Date", "weather_part", "temp", "humidity"]]
            for d in DELAYS:
                parts[f"moisture_{d}"] = fp._moisture_memory_score(
                    frame, cumulative_rain_target=float(p.get("min_cumulative_rain", 20.0)),
                    rain_first=bool(p.get("weather_preference", {}).get("rain_first", False)), delay=d)
            pieces.append(subset[["case_id", "offset", "Location_Id", "Date"]].merge(parts, on=["Location_Id", "Date"])
                          .drop(columns=["Location_Id", "Date"]).assign(species=species))
    if pieces:
        pd.concat(pieces, ignore_index=True).to_parquet(out / "rain_delay" / training_path.name, index=False)
    return sum(len(p) for p in pieces)


def build_parts(out: Path, workers: int) -> None:
    import pyarrow.parquet as pq
    (out / "rain_delay").mkdir(exist_ok=True)
    jobs = [(p, out / "era5_blocks" / p.name, out) for p in sorted((out / "training").glob("*.parquet"))
            if "case_id" in pq.read_schema(p).names and (out / "era5_blocks" / p.name).exists()]
    with Pool(workers, initializer=_load_specs) as pool:
        done = 0
        for n, count in enumerate(pool.imap_unordered(block_parts, jobs, chunksize=8), start=1):
            done += count
            if n % 500 == 0 or n == len(jobs):
                print(f"{n:,}/{len(jobs):,} blocks, {done:,} rows", flush=True)


def test(out: Path) -> pd.DataFrame:
    from fit_plant_settings import static_info
    from qa_spatial_weights import region_config
    from species_registry import get_species_params
    table = pd.concat([t for t in (pd.read_parquet(p) for p in (out / "training").glob("*.parquet")) if len(t)], ignore_index=True)
    parts = pd.concat([pd.read_parquet(p) for p in (out / "rain_delay").glob("*.parquet")], ignore_index=True)
    stored = pd.concat([s for s in (pd.read_parquet(p) for p in (out / "training_scores").glob("*.parquet")) if len(s)],
                       ignore_index=True)
    cases, _, mask = strata(table, transform(table))
    is_placebo, regions, years = (cases["species"] == PLACEBO).to_numpy(), cases["region"].to_numpy(), cases["year"].to_numpy()
    found = pd.to_datetime(cases["find_date"])
    weeks = (found.dt.isocalendar().year * 100 + found.dt.isocalendar().week).to_numpy(int)
    dates = found.to_numpy().astype("datetime64[D]").astype(np.int64)
    sites = (table[table["offset"] == 0].drop_duplicates("case_id").set_index("case_id")["Location_Id"]
             .reindex(cases["case_id"]).to_numpy())
    base = pd.concat([pd.read_csv(StringIO(fp.r2_fetch(fp.get_required_env(f"{r}_BASE_DATA")).decode("utf-8")),
                                  usecols=["Location_Id", "Latitude", "Longitude"]) for r in ("NE", "SE", "USE", "USW")]
                     ).drop_duplicates("Location_Id").set_index("Location_Id")
    statics, specs, rows = {c: static_info(c) for c in ("EU", "US")}, {}, []
    for species, region in TARGETS:
        own = parts[parts["species"] == species]
        p = get_species_params(region)[species]
        today = {k: float(p.get(k, d)) for k, (_, d) in PARTS.items()}
        temp, hum, wp = (wide(own, cases, c) for c in ("temp", "humidity", "weather_part"))
        moist = {d: wide(own, cases, f"moisture_{d}") for d in DELAYS}
        check = wide(stored[stored["species"] == species], cases, "weather_part")
        both = np.isfinite(check) & np.isfinite(wp)
        rebuilt = float(np.nanmax(np.abs(check[both] - wp[both]))) if both.any() else np.nan
        here = np.flatnonzero(((cases["species"] == species).to_numpy() | is_placebo) & (regions == region)
                              & mask[:, 0] & np.isfinite(wp[:, 0]))
        temp, hum, wp, moist = temp[here], hum[here], wp[here], {d: m[here] for d, m in moist.items()}
        wind = wp / weather({"temp": temp, "humidity": hum, "moisture": moist[0]}, STORED_WITH, np.ones_like(wp))
        index = {d: weather({"temp": temp, "humidity": hum, "moisture": m}, today, wind) for d, m in moist.items()}
        days = mask[here] & np.isfinite(wp)
        mine, plac, yrs, wks = (cases["species"] == species).to_numpy()[here], is_placebo[here], years[here], weeks[here]

        def net(i, tc, tp):
            return float(find_day_rank(i[tc], days[tc]).mean() - find_day_rank(i[tp], days[tp]).mean())

        def choose(tc, tp):
            nets = {d: net(index[d], tc, tp) for d in DELAYS}
            best = max(nets, key=nets.get)
            return best if nets[best] >= nets[0] + MIN_GAIN else 0

        results, changes, picks = [], [], []
        for year in sorted(set(yrs[mine])):
            held = yrs == year
            tc, tp = mine & held, plac & held
            if not tp.any():
                continue
            d = choose(mine & ~held, plac & ~held)
            picks.append(d)
            (f0, f1), (p0, p1) = [[find_day_rank(i[s], days[s]) for i in (index[0], index[d])] for s in (tc, tp)]
            changes.append(((f1 - f0, wks[tc]), (p1 - p0, wks[tp])))
            if tc.sum() >= MIN_TEST_STRATA and tp.sum() >= MIN_TEST_STRATA:
                results.append((int(year), float(f0.mean() - p0.mean()), float(f1.mean() - p1.mean())))
        final = choose(mine, plac)
        wins, pval, gain = sign_test(results) if results else (0, 1.0, 0.0)
        pooled, ci = pooled_gain(changes) if changes else (0.0, [0.0, 0.0])
        timing = bool(final) and group_ships(results, int(mine.sum()), ci)
        entry = {"species": species, "region": region, "finds": int(mine.sum()), "rebuilt vs stored": round(rebuilt, 4),
                 "delay": final, "delays chosen by year": " ".join(map(str, picks)), "years": len(results), "wins": wins,
                 "p": round(pval, 4), "pooled gain": round(pooled, 4), "pooled ci": ci,
                 "net 0": round(net(index[0], mine, plac), 4), "net delayed": round(net(index[final], mine, plac), 4)}
        if final:
            if region not in specs:
                specs[region] = fp._load_species_and_curves(region_config(region))
            params = {k: v for k, v in specs[region][0][species].items() if k not in ("fruiting", "fruiting_gbm")}
            place = place_parts(species, params, specs[region][1], sites[here], dates[here], base, statics[CONTINENT[region]])
            entry.update(places(full_score(index[0][:, 0], today, wind[:, 0], place),
                                full_score(index[final][:, 0], today, wind[:, 0], place),
                                mine, plac, dates[here], sites[here], wks))
        entry["ships"] = timing and entry.get("places ci", [0, 0])[1] >= 0
        rows.append(entry)
        print(entry, flush=True)
    return pd.DataFrame(rows)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True, help="the training folder (training/, training_scores/, era5_blocks/)")
    parser.add_argument("--parts", action="store_true")
    parser.add_argument("--test", action="store_true")
    parser.add_argument("--workers", type=int, default=6)
    args = parser.parse_args()
    out = Path(args.out)
    fp.load_dotenv(ROOT / ".env")
    fp.load_dotenv(ROOT / ".env.secret")
    if args.parts:
        build_parts(out, args.workers)
    if args.test:
        result = test(out)
        result.to_csv(out / "rain_delay.csv", index=False)
        pd.set_option("display.width", 250)
        print(result.to_string(index=False))


if __name__ == "__main__":
    main()
