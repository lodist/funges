#!/usr/bin/env python3
"""Hand-set mushroom weather settings: switch a part off, or move the temperature optimum, where
that times the finds better and ranks their places no worse.

Where no fitted model ships (tools/fit_fruiting.py, tools/fit_fruiting_gbm.py), a mushroom's
weather is its hand-set temperature, humidity and rain parts in a geometric mean weighted 1.75,
1.0 and rain_weight (1.5), and some time the finds no better than the walkers: morel in North
Europe (-0.015 net of the bracket-fungus days), hedgehog in US West (-0.026). The test is
fit_fruiting's: each find's own day against the same place 14 and 21 days either side, net of
bracket-placebo days, on the training table's ERA5 days with the parts as
tools/build_training_table.py stored them. Parts go one at a time while that lifts the net by
MIN_GAIN; each year is scored with the parts chosen on the other years, and a species-region
ships where that beats today's model in more years than chance (sign test p < 0.1, at least 6
years), as the fits ship. Where fewer than 6 years have 50 finds, all its held-out years
together: at least MIN_POOLED finds and a gain whose 95% CI, resampling whole weeks within each
year (a week's finds share its weather), is above 0.
A part that times the finds badly can still tell their places apart: morel in North Europe timed
its finds better without temperature and humidity (10 of 11 years) and ranked its places far
worse (#320, switched back). So a pick also has to rank places no worse: each find's own day
against up to K_PLACES bracket-fungus finds in its region that day elsewhere, on the full score
(the place parts from the production scorer at each find's place), 95% CI resampling weeks. The
summer 2026 strata (--spatial) and the map come after.

--optima moves the temperature optimum instead (by SHIFTS, chosen and tested the same way), the
temperature part rebuilt from the 12 days' ERA5 temperatures in training_lags/. ERA5 reads within
about 1 C of the app's stored temperature (fit_fruiting.stored_corrections), so a move carries over.

    python backend/tools/fit_fruiting_parts.py --out ../era5_training             # -> parts_fruiting.csv
    python backend/tools/fit_fruiting_parts.py --out ../era5_training --spatial   # the picks on summer 2026
    python backend/tools/fit_fruiting_parts.py --out ../era5_training --optima [--spatial]
"""
import lightgbm  # noqa: F401  before pandas/pyarrow: see tests/conftest.py
import argparse
import json
import sys
from io import StringIO
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT / "backend" / "tools"), str(ROOT / "backend"), str(ROOT / "scripts")]
from fit_fruiting import (CONTINENT, MIN_TEST_STRATA, PLACEBO, SHIP_MIN_YEARS, SLOTS, find_day_rank, sign_test,  # noqa: E402
                          ships, strata, transform)
from species_registry import get_species_params  # noqa: E402

PARTS = {"temp_weight": ("temp", 1.75), "humidity_weight": ("humidity", 1.0), "rain_weight": ("moisture", 1.5)}
# build_training_table stored every mushroom's parts at these weights (10 Oct 2026, before #320)
STORED_WITH = {k: default for k, (_, default) in PARTS.items()}
MIN_GAIN = 0.002
MIN_POOLED = 150
SHIFTS = np.arange(-6.0, 6.5, 1.0)       # C, the moves of the temperature optimum tried
K_PLACES = 10


def wide(scores: pd.DataFrame, cases: pd.DataFrame, column: str) -> np.ndarray:
    """[case, 5 days] of one stored column for these cases (NaN where absent)."""
    return (scores.pivot_table(index="case_id", columns="offset", values=column)
            .reindex(index=cases["case_id"], columns=list(SLOTS)).to_numpy(float))


def weather(parts: dict, weights: dict, wind: np.ndarray) -> np.ndarray:
    """The weather part with these weights, as forecast_pipeline combines it (each part floored at
    0.02, a weighted geometric mean; 1 with every part off), times the stored wind factor."""
    total = sum(weights.values())
    if total <= 0:
        return wind
    log_sum = sum(w * np.log(np.clip(parts[name], 0.02, 1.0)) for name, w in
                  ((PARTS[k][0], weights[k]) for k in PARTS))
    return np.exp(log_sum / total) * wind


def net(index: np.ndarray, days: np.ndarray, target: np.ndarray, placebo: np.ndarray) -> float:
    return float(find_day_rank(index[target], days[target]).mean() - find_day_rank(index[placebo], days[placebo]).mean())


def choose(parts, today, wind, days, target, placebo) -> dict:
    """Parts off, one at a time, while that lifts the net on these strata by MIN_GAIN."""
    weights = dict(today)
    current = net(weather(parts, weights, wind), days, target, placebo)
    while True:
        trials = {k: net(weather(parts, {**weights, k: 0.0}, wind), days, target, placebo)
                  for k, w in weights.items() if w > 0}
        if not trials:
            return weights
        k, best = max(trials.items(), key=lambda kv: kv[1])
        if best < current + MIN_GAIN:
            return weights
        weights[k], current = 0.0, best


def temp_part(lags: np.ndarray, mu: float, sigma: float) -> np.ndarray:
    """forecast_pipeline's temperature part from the 12 days before ([..., 12], C): a gaussian
    around the optimum on each day, weighted most around 4 days back."""
    d = np.arange(1, 13)
    w = 0.6 * np.exp(-0.5 * ((d - 4) / 3.0) ** 2) + 0.4 * np.exp(-0.08 * d)
    return np.clip((w / w.sum() * np.exp(-((lags - mu) ** 2) / (2 * sigma ** 2))).sum(axis=-1), 0, 1)


def choose_shift(index_of, days, target, placebo) -> float:
    """The move of the temperature optimum (one of SHIFTS) that ranks these find days highest,
    kept where it beats today's optimum by MIN_GAIN."""
    nets = {float(s): net(index_of(float(s)), days, target, placebo) for s in SHIFTS}
    best = max(nets, key=nets.get)
    return best if nets[best] >= nets[0.0] + MIN_GAIN else 0.0


def held_out(index_of, choose_on, days, mine, plac, years, weeks) -> tuple[list, list]:
    """Each year scored with the setting chosen on the other years: per year (today's net, the
    choice's net) for the sign test, and every held-out stratum's change in rank for the pooled one."""
    today = index_of(None)
    results, changes = [], []
    for year in sorted(set(years[mine])):
        held = years == year
        tc, tp = mine & held, plac & held
        if not tp.any():
            continue
        after = index_of(choose_on(mine & ~held, plac & ~held))
        (f0, f1), (p0, p1) = [[find_day_rank(i[s], days[s]) for i in (today, after)] for s in (tc, tp)]
        changes.append(((f1 - f0, weeks[tc]), (p1 - p0, weeks[tp])))
        if tc.sum() >= MIN_TEST_STRATA and tp.sum() >= MIN_TEST_STRATA:
            results.append((int(year), float(f0.mean() - p0.mean()), float(f1.mean() - p1.mean())))
    return results, changes


def place_parts(species: str, params: dict, zone_curves: dict, sites, dates, base, static) -> tuple:
    """The score's place parts at each case's own place on its find day, from the production
    scorer (scripts/qa_spatial_weights.parts): the weighted log of the altitude, pH and water parts,
    their total weight, and range prior x hosts x habitat x season. The weather given it is a
    placeholder: the weather parts come from the training table."""
    from scipy.spatial import cKDTree
    from qa_spatial_weights import parts
    where = base.reindex(sites)
    near = cKDTree(static[["Latitude", "Longitude"]].to_numpy(float)).query(
        where[["Latitude", "Longitude"]].fillna(0).to_numpy(float))[1]
    frame = pd.DataFrame({
        "Location_Id": sites, "Latitude": where["Latitude"].to_numpy(float), "Longitude": where["Longitude"].to_numpy(float),
        "Date": pd.to_datetime(dates.astype("datetime64[D]")), "Elevation (m)": static["Altitude"].to_numpy(float)[near],
        "ph_level": static["ph_level"].to_numpy(float)[near], "dist_m_water": static["dist_m_water"].to_numpy(float)[near],
        "dist_m_sea": static["dist_m_sea"].to_numpy(float)[near], "climate_zone": static["climate_zone"].to_numpy()[near],
        "Temperature (C)": 12.0, "Humidity (%)": 80.0, "TotalPrecipitation_mm": 2.0, "Wind Speed (m/s)": 3.0,
        "Pressure (hPa)": np.nan})
    placed, w = parts(frame, species, {species: params}, zone_curves)
    has_ph = frame["ph_level"].notna().to_numpy()
    log_sum = (w["altitude"] * np.log(placed["altitude"].to_numpy(float))
               + np.where(has_ph, w["ph"] * np.log(placed["ph"].to_numpy(float)), 0.0)
               + (w["water"] * np.log(placed["water"].to_numpy(float)) if w["water"] > 0 else 0.0))
    return (log_sum, w["altitude"] + np.where(has_ph, w["ph"], 0.0) + w["water"],
            placed["range"].to_numpy(float) * placed["season"].to_numpy(float))


def full_score(index: np.ndarray, weights: dict, wind: np.ndarray, place: tuple) -> np.ndarray:
    """The score from a weather index (weather() with these weights) and the place parts, combined
    as calculate_mushroom_score does: one weighted geometric mean, then the multipliers."""
    log_sum, place_weight, multiplier = place
    weather_weight = sum(weights.values())
    return np.exp((weather_weight * np.log(index / wind) + log_sum) / (weather_weight + place_weight)) * multiplier * wind


def places(today: np.ndarray, after: np.ndarray, mine, plac, dates, sites, weeks, seed: int = 291) -> dict:
    """The place test on the training years: each find's own day against up to K_PLACES
    bracket-fungus finds in its region that day at other places (where people walked), ranked on
    the find day's score ([case] values) with today's settings and the new ones, and a 95% CI of
    the change resampling whole weeks."""
    rng = np.random.default_rng(seed)
    pool = pd.DataFrame({"i": np.flatnonzero(plac), "date": dates[plac], "site": sites[plac]})
    by_date = dict(tuple(pool.groupby("date")))
    finds, controls = [], []
    for i in np.flatnonzero(mine):
        other = by_date.get(dates[i])
        other = other["i"].to_numpy()[other["site"].to_numpy() != sites[i]] if other is not None else []
        if len(other) >= 3:
            finds.append(i)
            controls.append(rng.choice(other, min(K_PLACES, len(other)), replace=False))
    if len(finds) < MIN_TEST_STRATA:
        return {}
    at = np.full((len(finds), K_PLACES + 1), -1)
    at[:, 0] = finds
    for row, c in enumerate(controls):
        at[row, 1:len(c) + 1] = c
    present = at >= 0
    before, moved = (find_day_rank(np.where(present, v[np.clip(at, 0, None)], 0.0), present) for v in (today, after))
    change, week = moved - before, weeks[np.asarray(finds)]
    index = np.unique(week, return_inverse=True)[1]
    total, count = np.bincount(index, change), np.bincount(index)
    draws = [total[d].sum() / count[d].sum() for d in (rng.integers(0, len(total), len(total)) for _ in range(1000))]
    return {"place finds": len(finds), "places today": round(float(before.mean()), 4),
            "places after": round(float(moved.mean()), 4),
            "places ci": [round(float(q), 4) for q in np.quantile(draws, [0.025, 0.975])]}


def pooled_gain(changes: list, seed: int = 291) -> tuple[float, list]:
    """All held-out years together: the net's gain, each year weighted by its finds, and its 95% CI
    resampling whole weeks of finds and of placebo days within each year. changes: per year,
    ((finds' change in rank, their weeks), (placebo days' change, their weeks))."""
    def by_week(change, weeks):
        index = np.unique(weeks, return_inverse=True)[1]
        return np.bincount(index, change), np.bincount(index)

    years = [(by_week(*finds), by_week(*placebo)) for finds, placebo in changes]
    n = np.array([f[1].sum() for f, _ in years], float)

    def gain(draw):
        d = [f[0][i].sum() / f[1][i].sum() - p[0][j].sum() / p[1][j].sum() for (f, p), (i, j) in zip(years, draw)]
        return float(np.dot(n, d) / n.sum())

    rng = np.random.default_rng(seed)
    draws = [gain([(rng.integers(0, len(f[0]), len(f[0])), rng.integers(0, len(p[0]), len(p[0]))) for f, p in years])
             for _ in range(1000)]
    return gain([(np.arange(len(f[0])), np.arange(len(p[0]))) for f, p in years]), \
        [round(float(q), 4) for q in np.quantile(draws, [0.025, 0.975])]


def hand_set(species: str, region: str, fits: dict, gbms: dict) -> bool:
    return region not in fits.get(species, {}) and region not in gbms.get(species, {}).get("regions", {})


def settings(pick) -> dict:
    """A pick's settings for the manifest: its parts off, or its temperature optimum moved."""
    if "move" in pick:
        return {"optimal_temp": float(pick["optimal_temp"]) + float(pick["move"])}
    return {k: 0 for k in str(pick["switched off"]).split()}


def spatial(out: Path, picks: pd.DataFrame) -> pd.DataFrame:
    """Each pick on scripts/qa_spatial_weights.py's summer 2026 strata (a find against other
    species' finds in its region that week, on the app's stored weather): the find's rank with
    today's settings and with the pick's, the full score as the nightly run scores it."""
    import forecast_pipeline as fp
    from fit_plant_settings import paired_ci
    from qa_season_branch_replay import BRANCH_LAG_COLUMNS
    from qa_spatial_weights import MIN_CASES, region_config, stack
    from qa_weather_skill import LAG_DAYS
    fp.load_dotenv(ROOT / ".env")
    fp.load_dotenv(ROOT / ".env.secret")
    layout_all = pd.read_parquet(out / "spatial" / "spatial_strata.parquet",
                                 columns=["case", "slot", "species", "Location_Id", "Date", "region"])
    layout_all["Date"] = pd.to_datetime(layout_all["Date"]).dt.normalize()
    rows = []
    for region, mine in picks.groupby("region"):
        layout = layout_all[(layout_all["region"] == region) & layout_all["species"].isin(mine["species"])]
        if layout.empty:
            continue
        params, zone_curves = fp._load_species_and_curves(region_config(region))
        history = pd.read_parquet(next((out / "acceptance_cache").glob(f"stored-{region}-*.parquet")))
        history["Date"] = pd.to_datetime(history["Date"]).dt.normalize()
        need = layout[["Location_Id", "Date"]].drop_duplicates()
        frame = fp.compute_lag_features(history, BRANCH_LAG_COLUMNS + fp.FRUITING_LAG_COLUMNS, LAG_DAYS,
                                        target=history.merge(need, on=["Location_Id", "Date"]))
        frame = frame.drop_duplicates(["Location_Id", "Date"], keep="last").reset_index(drop=True)
        for _, pick in mine.iterrows():
            species, change = pick["species"], settings(pick)
            table = layout[layout["species"] == species]
            if table["case"].nunique() < MIN_CASES:
                continue
            here = frame[frame["Date"].isin(table["Date"].unique())].reset_index(drop=True)
            scored = here[["Location_Id", "Date"]].copy()
            for name, p in (("before", params[species]), ("after", {**params[species], **change})):
                scored[name] = fp.calculate_mushroom_score(here.copy(), {species: p}, zone_curves)[f"{species}_score"].to_numpy()
            x, mask, _ = stack(table.merge(scored, on=["Location_Id", "Date"], how="left"), ["before", "after"])
            before, after = find_day_rank(x[..., 0], mask), find_day_rank(x[..., 1], mask)
            rows.append({"species": species, "region": region, "change": change, "finds": len(before),
                         "today": round(float(before.mean()), 4), "after": round(float(after.mean()), 4),
                         "ci": paired_ci(after, before)})
            print(rows[-1], flush=True)
    return pd.DataFrame(rows)


def daily_temps(out: Path, table: pd.DataFrame, cases: pd.DataFrame) -> np.ndarray:
    """[case, 5 days, 12] ERA5 mean temperature of the 12 days before each stratum day
    (training_lags/), a missing day as the day's own, as forecast_pipeline fills it."""
    names = [f"tmean_d{d}" for d in range(1, 13)]
    lags = pd.concat([pd.read_parquet(p, columns=["case_id", "offset", *names])
                      for p in (out / "training_lags").glob("*.parquet")], ignore_index=True)
    row = pd.Series(np.arange(len(cases)), index=cases["case_id"].to_numpy())
    at = row.reindex(lags["case_id"].to_numpy()).to_numpy()
    ok = np.isfinite(at)
    temps = np.full((len(cases), len(SLOTS), 12), np.nan, np.float32)
    temps[at[ok].astype(int), lags["offset"].map(SLOTS).to_numpy()[ok]] = lags.loc[ok, names].to_numpy(np.float32)
    return np.where(np.isnan(temps), wide(table, cases, "temp_0")[..., None], temps)


TEMP_SHIFTS = (-12.0, -10.0, -8.0, -6.0, -4.0, -2.0, -1.0, 0.0, 1.0, 2.0, 4.0, 6.0, 8.0, 10.0, 12.0, 14.0)  # C, optimum moves
TEMP_WIDTHS = (0.67, 1.0, 1.5, 2.2)  # x today's temp_sigma
TIMING_FLOOR = -0.005  # a temperature setting may not time the finds worse than this (held-out gain)


def control_sets(mine, plac, dates, sites, seed: int = 291) -> np.ndarray:
    """[find, 1 + K_PLACES] rows of the place test: each find (column 0) and up to K_PLACES
    bracket-fungus finds that day at other places (-1 pads); finds with fewer than 3 left out."""
    rng = np.random.default_rng(seed)
    pool = pd.DataFrame({"i": np.flatnonzero(plac), "date": dates[plac], "site": sites[plac]})
    by_date = dict(tuple(pool.groupby("date")))
    rows = []
    for i in np.flatnonzero(mine):
        other = by_date.get(dates[i])
        other = other["i"].to_numpy()[other["site"].to_numpy() != sites[i]] if other is not None else []
        if len(other) >= 3:
            pick = rng.choice(other, min(K_PLACES, len(other)), replace=False)
            rows.append(np.concatenate([[i], pick, np.full(K_PLACES - len(pick), -1)]))
    return np.array(rows, int).reshape(-1, K_PLACES + 1)


def place_ranks(score: np.ndarray, at: np.ndarray) -> np.ndarray:
    """Each find's rank among its same-day controls on `score` ([case] values)."""
    present = at >= 0
    return find_day_rank(np.where(present, score[np.clip(at, 0, None)], 0.0), present)


def week_ci(change: np.ndarray, weeks: np.ndarray, seed: int = 291) -> list:
    """95% interval of a mean change, resampling whole weeks."""
    index = np.unique(weeks, return_inverse=True)[1]
    total, count = np.bincount(index, change), np.bincount(index)
    rng = np.random.default_rng(seed)
    draws = [total[d].sum() / count[d].sum() for d in (rng.integers(0, len(total), len(total)) for _ in range(1000))]
    return [round(float(q), 4) for q in np.quantile(draws, [0.025, 0.975])]


def fit_temperature(p: dict, parts: dict, lags: np.ndarray, today: dict, wind: np.ndarray, place: tuple,
                    days, mine, plac, years, weeks, dates, sites) -> dict:
    """The temperature optimum and width that best place and time the finds, chosen on the other
    years for each held-out year: the place test (each find's place against where people walked
    that day, on the full score) plus the timing (find day against the same place 14 and 21 days
    either side, net of bracket days). Chosen on places alone, a fixed optimum bends to encode the
    geography of the finds (golden chanterelle in North Europe ran to 8 C, chicken of the woods in
    the US East to 33 C) and the timing gets worse; timing alone moves almost nothing (#321).
    Ships when it is better beyond doubt on one, not worse on the other, its timing gain at least
    TIMING_FLOOR, and not at the grid's edge (where a fit wants more than a temperature can mean)."""
    mu, sigma = float(p["optimal_temp"]), float(p["temp_sigma"])
    grid = [(mu + s, sigma * w) for s in TEMP_SHIFTS for w in TEMP_WIDTHS]
    now = grid.index((mu, sigma))
    at = control_sets(mine, plac, dates, sites)
    if len(at) < MIN_POOLED:
        return {}
    ranks, timing_f, timing_p = [], [], []          # [combo, find] / [combo, find] / [combo, placebo day]
    for m, s in grid:
        index = weather({**parts, "temp": temp_part(lags, m, s)}, today, wind)
        ranks.append(place_ranks(full_score(index[:, 0], today, wind[:, 0], place), at))
        timing_f.append(find_day_rank(index[mine], days[mine]))
        timing_p.append(find_day_rank(index[plac], days[plac]))
    ranks, timing_f, timing_p = np.array(ranks), np.array(timing_f), np.array(timing_p)
    year_p, week_p = years[at[:, 0]], weeks[at[:, 0]]
    year_f, year_c, week_f, week_c = years[mine], years[plac], weeks[mine], weeks[plac]
    held_place, held_week, changes, picks = [], [], [], []
    def objective(place_rows, find_rows, placebo_rows):
        return (ranks[:, place_rows].mean(axis=1) + timing_f[:, find_rows].mean(axis=1)
                - timing_p[:, placebo_rows].mean(axis=1))

    for year in sorted(set(year_p)):
        train, test = year_p != year, year_p == year
        best = int(np.argmax(objective(train, year_f != year, year_c != year)))
        picks.append(grid[best])
        held_place.append(ranks[best, test] - ranks[now, test])
        held_week.append(week_p[test])
        tf, tc = year_f == year, year_c == year
        changes.append(((timing_f[best, tf] - timing_f[now, tf], week_f[tf]),
                        (timing_p[best, tc] - timing_p[now, tc], week_c[tc])))
    place_change, place_weeks = np.concatenate(held_place), np.concatenate(held_week)
    timing, timing_ci = pooled_gain([c for c in changes if len(c[0][0]) and len(c[1][0])])
    final = grid[int(np.argmax(objective(np.ones(len(year_p), bool), np.ones(len(year_f), bool),
                                         np.ones(len(year_c), bool))))]
    place_ci = week_ci(place_change, place_weeks)
    edge = final[0] - mu in (min(TEMP_SHIFTS), max(TEMP_SHIFTS))
    return {"optimal_temp": mu, "temp_sigma": sigma, "fitted optimum": final[0], "fitted sigma": round(final[1], 2),
            "held-out picks": sorted({(round(a, 1), round(b, 2)) for a, b in picks}),
            "place finds": len(at), "places today": round(float(ranks[now].mean()), 4),
            "places held out": round(float(ranks[now].mean() + place_change.mean()), 4),
            "place gain": round(float(place_change.mean()), 4), "place ci": place_ci,
            "timing gain": round(timing, 4), "timing ci": timing_ci,
            "edge": edge,
            "ships": bool(final != (mu, sigma) and not edge and timing >= TIMING_FLOOR
                          and ((place_ci[0] > 0 and timing_ci[1] >= 0) or (timing_ci[0] > 0 and place_ci[1] >= 0)))}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True, help="the training folder (training/, training_scores/)")
    parser.add_argument("--spatial", action="store_true", help="the timing picks on the summer 2026 strata")
    parser.add_argument("--optima", action="store_true", help="move the temperature optimum instead")
    parser.add_argument("--temperature", action="store_true",
                        help="fit the temperature optimum and width on the place test (fit_temperature)")
    args = parser.parse_args()
    out = Path(args.out)
    name = "temperature_fruiting" if args.temperature else "optima_fruiting" if args.optima else "parts_fruiting"
    if args.spatial:
        picks = pd.read_csv(out / f"{name}.csv")
        result = spatial(out, picks[picks["ships"].astype(str) == "True"])
        result.to_csv(out / f"{name}_spatial.csv", index=False)
        print(result.to_string(index=False))
        return
    table = pd.concat([t for t in (pd.read_parquet(p) for p in (out / "training").glob("*.parquet")) if len(t)], ignore_index=True)
    scores = pd.concat([s for s in (pd.read_parquet(p) for p in (out / "training_scores").glob("*.parquet")) if len(s)],
                       ignore_index=True)
    cases, _, mask = strata(table, transform(table))
    temps = daily_temps(out, table, cases) if args.optima or args.temperature else None
    is_placebo = (cases["species"] == PLACEBO).to_numpy()
    fits = json.loads((ROOT / "backend" / "generated" / "fruiting_fit.json").read_text(encoding="utf-8")).get("models", {})
    gbms = json.loads((ROOT / "backend" / "generated" / "fruiting_gbm.json").read_text(encoding="utf-8")).get("models", {})
    params = {r: get_species_params(r) for r in ("NE", "SE", "USE", "USW")}
    years_all, regions = cases["year"].to_numpy(), cases["region"].to_numpy()
    found = pd.to_datetime(cases["find_date"])
    weeks_all = (found.dt.isocalendar().year * 100 + found.dt.isocalendar().week).to_numpy(int)
    dates_all = found.to_numpy().astype("datetime64[D]").astype(np.int64)
    sites_all = (table[table["offset"] == 0].drop_duplicates("case_id").set_index("case_id")["Location_Id"]
                 .reindex(cases["case_id"]).to_numpy())
    import forecast_pipeline as fp
    from fit_plant_settings import static_info
    from qa_spatial_weights import region_config
    fp.load_dotenv(ROOT / ".env")
    fp.load_dotenv(ROOT / ".env.secret")
    base = pd.concat([pd.read_csv(StringIO(fp.r2_fetch(fp.get_required_env(f"{r}_BASE_DATA")).decode("utf-8")),
                                  usecols=["Location_Id", "Latitude", "Longitude"]) for r in ("NE", "SE", "USE", "USW")]
                     ).drop_duplicates("Location_Id").set_index("Location_Id")
    statics, specs = {c: static_info(c) for c in ("EU", "US")}, {}
    rows = []
    for species in sorted(set(cases["species"]) - {PLACEBO}):
        mine_all = (cases["species"] == species).to_numpy()
        own = scores[scores["species"] == species]
        parts_all = {name: wide(own, cases, name) for name, _ in PARTS.values()}
        stored_all = wide(own, cases, "weather_part")
        for region in sorted(set(regions[mine_all])):
            if region not in params or species not in params[region] or not hand_set(species, region, fits, gbms):
                continue
            p = params[region][species]
            today = {k: float(p.get(k, default)) for k, (_, default) in PARTS.items()}
            if (args.optima or args.temperature) and today["temp_weight"] <= 0:
                continue
            here = np.flatnonzero((mine_all | is_placebo) & (regions == region) & mask[:, 0] & np.isfinite(stored_all[:, 0]))
            parts = {name: part[here] for name, part in parts_all.items()}
            stored, years, weeks = stored_all[here], years_all[here], weeks_all[here]
            wind = stored / weather(parts, STORED_WITH, np.ones_like(stored))   # 1 unless wind-sensitive
            days = mask[here] & np.isfinite(stored)
            mine, plac = mine_all[here], is_placebo[here]
            if args.temperature:
                if region not in specs:
                    specs[region] = fp._load_species_and_curves(region_config(region))
                place = place_parts(species, {k: v for k, v in specs[region][0][species].items()
                                              if k not in ("fruiting", "fruiting_gbm")},
                                    specs[region][1], sites_all[here], dates_all[here], base, statics[CONTINENT[region]])
                fit = fit_temperature(p, parts, temps[here], today, wind, place, days, mine, plac, years, weeks,
                                      dates_all[here], sites_all[here])
                if fit:
                    rows.append({"species": species, "region": region, "finds": int(mine.sum()), **fit})
                    print(rows[-1], flush=True)
                continue
            if args.optima:
                mu, sigma, lags = float(p["optimal_temp"]), float(p["temp_sigma"]), temps[here]
                cache = {}

                def index_of(shift):
                    shift = shift or 0.0
                    if shift not in cache:
                        cache[shift] = weather({**parts, "temp": temp_part(lags, mu + shift, sigma)}, today, wind)
                    return cache[shift]

                def choose_on(target, placebo):
                    return choose_shift(index_of, days, target, placebo)
            else:
                def index_of(weights):
                    return weather(parts, weights or today, wind)

                def choose_on(target, placebo):
                    return choose(parts, today, wind, days, target, placebo)
            results, changes = held_out(index_of, choose_on, days, mine, plac, years, weeks)
            final = choose_on(mine, plac)
            if args.optima:
                rebuilt = np.clip(temp_part(lags, mu, sigma), 0.02, 1) - np.clip(parts["temp"], 0.02, 1)
                change = {"optimal_temp": mu, "move": final, "rebuilt vs stored": round(float(np.nanmax(np.abs(rebuilt))), 4)}
                changed = final != 0
            else:
                off = sorted(k for k in PARTS if today[k] > 0 and final[k] == 0)
                change, changed = {"switched off": " ".join(off)}, bool(off)
            if changed:
                if region not in specs:
                    specs[region] = fp._load_species_and_curves(region_config(region))
                place = place_parts(species, specs[region][0][species], specs[region][1], sites_all[here],
                                    dates_all[here], base, statics[CONTINENT[region]])
                after_weights = today if args.optima else final
                change.update(places(full_score(index_of(None)[:, 0], today, wind[:, 0], place),
                                     full_score(index_of(final)[:, 0], after_weights, wind[:, 0], place),
                                     mine, plac, dates_all[here], sites_all[here], weeks))
            wins, pval, gain = sign_test(results) if results else (0, 1.0, 0.0)
            pooled, ci = pooled_gain(changes) if changes else (0.0, [0.0, 0.0])
            thin = len(results) < SHIP_MIN_YEARS
            timing = mine.sum() >= MIN_POOLED and ci[0] > 0 if thin else ships(results)
            rows.append({"species": species, "region": region, "finds": int(mine.sum()), "years": len(results),
                         "wins": wins, "p": round(pval, 4), "mean gain": round(gain, 4),
                         "pooled gain": round(pooled, 4), "pooled ci": ci,
                         "today net": round(net(index_of(None), days, mine, plac), 4),
                         "after net": round(net(index_of(final), days, mine, plac), 4), **change,
                         "ships": changed and timing and change.get("places ci", [0, 0])[1] >= 0})
            print(rows[-1], flush=True)
    result = pd.DataFrame(rows)
    result.to_csv(out / f"{name}.csv", index=False)
    pd.set_option("display.width", 220)
    print(result.to_string(index=False))


if __name__ == "__main__":
    main()
