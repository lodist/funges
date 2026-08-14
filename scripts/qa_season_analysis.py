"""Season-timing QA: does the model know *when* a species fruits, not just where?

Five tests, all on production scores:

A  curve headroom      published season multiplier range vs observed GBIF seasonal range
B  in/out-of-season    within-location AUC separating fruiting months from dead months,
                       for the full score, for the season curve alone, for weather alone
C  onset timing        observed vs predicted season start, in days, against a climatology
                       baseline that uses the season curve and no weather at all
D  lead / lag          cross-correlation of daily score against effort-normalised
                       fruiting rate, to see whether the score leads or trails fruiting
E  anomaly skill       does the weather side of the score explain departures from
                       climatology -- the only part that cannot be circular

Ground truth is effort-normalised: every observed count is divided by the count of all
fungal observations in the same region on the same day (or month), so observer effort,
weekends and the 2020s growth in GBIF submissions cancel out.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import requests
from scipy.stats import rankdata, spearmanr

sys.path.insert(0, str(Path(__file__).resolve().parent))
from qa_season_scan import FUNGI, load_specs

MONTH_MID_DOY = np.array([15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349])
CLIMATOLOGY_YEARS = ("2021", "2022", "2023", "2024", "2025")
IN_SEASON_FRACTION = 0.50   # of peak effort-normalised rate
OUT_SEASON_FRACTION = 0.10
ONSET_FRACTION = 0.15       # of peak, for both observed and predicted onset
MIN_CLIMATOLOGY_RECORDS = 200   # same bar the production curve builder uses
GOOD_SCORE = 4.0            # the app's "worth going" threshold
SMOOTH_DAYS = 7


# --------------------------------------------------------------------------- truth


def monthly_rate(truth: dict, region: str, species: str) -> np.ndarray:
    """Effort-normalised monthly fruiting rate, averaged over the climatology years."""
    species_counts = truth["climatology_monthly"][region][species]
    effort_counts = truth["climatology_monthly"][region]["_all_fungi"]
    rates = np.zeros(12)
    for month in range(1, 13):
        numerator = sum(species_counts[year][str(month)] for year in CLIMATOLOGY_YEARS)
        denominator = sum(effort_counts[year][str(month)] for year in CLIMATOLOGY_YEARS)
        rates[month - 1] = numerator / denominator if denominator else np.nan
    return rates


def month_labels(rates: np.ndarray) -> tuple[set[int], set[int]]:
    peak = np.nanmax(rates)
    if not np.isfinite(peak) or peak <= 0:
        return set(), set()
    normalised = rates / peak
    in_season = {m for m in range(1, 13) if normalised[m - 1] >= IN_SEASON_FRACTION}
    out_season = {m for m in range(1, 13) if normalised[m - 1] <= OUT_SEASON_FRACTION}
    return in_season, out_season


def daily_observed_rate(truth: dict, region: str, species: str) -> pd.DataFrame:
    """Daily records / daily all-fungi effort, smoothed."""
    records = pd.DataFrame(truth["records"])
    subset = records[(records.region == region) & (records.species_id == species)]
    effort = pd.Series(truth["effort_daily"][region], dtype=float)
    effort.index = pd.to_datetime(effort.index)
    effort = effort.sort_index()
    counts = subset.groupby("date").size() if len(subset) else pd.Series(dtype=float)
    counts.index = pd.to_datetime(counts.index)
    frame = pd.DataFrame({"effort": effort})
    frame["count"] = counts.reindex(frame.index).fillna(0.0)
    frame["rate"] = np.where(frame.effort > 0, frame["count"] / frame.effort, np.nan)
    frame["rate_smooth"] = (
        frame.rate.rolling(SMOOTH_DAYS, min_periods=max(3, SMOOTH_DAYS // 2), center=True).mean()
    )
    frame["count_smooth"] = frame["count"].rolling(SMOOTH_DAYS, min_periods=3, center=True).mean()
    return frame


def climatological_doy_rate(rates: np.ndarray, index: pd.DatetimeIndex) -> np.ndarray:
    """Interpolate the monthly climatology onto days, the same way the model does."""
    xp = np.concatenate(([MONTH_MID_DOY[-1] - 365], MONTH_MID_DOY, [MONTH_MID_DOY[0] + 365]))
    fp = np.concatenate(([rates[-1]], rates, [rates[0]]))
    return np.interp(index.dayofyear.to_numpy(), xp, fp)


# ------------------------------------------------------------------------- metrics


def auc_from_ranks(values: np.ndarray, positive: np.ndarray) -> float | None:
    n_pos = int(positive.sum())
    n_neg = int((~positive).sum())
    if n_pos == 0 or n_neg == 0:
        return None
    ranks = rankdata(values)
    return float((ranks[positive].sum() - n_pos * (n_pos + 1) / 2) / (n_pos * n_neg))


def within_location_auc(frame: pd.DataFrame, column: str) -> tuple[float | None, int]:
    """Mean AUC over locations, so no location's baseline level can drive the result."""
    aucs, weights = [], []
    frame = frame[np.isfinite(frame[column].to_numpy(float))]
    for _, group in frame.groupby("Location_Id", sort=False):
        positive = group.in_season.to_numpy()
        if positive.all() or not positive.any():
            continue
        value = auc_from_ranks(group[column].to_numpy(float), positive)
        if value is None:
            continue
        aucs.append(value)
        weights.append(int(positive.sum()) * int((~positive).sum()))
    if not aucs:
        return None, 0
    return float(np.average(aucs, weights=weights)), len(aucs)


def crossing_date(series: pd.Series, fraction: float) -> pd.Timestamp | None:
    """First sustained crossing of `fraction` of the series peak."""
    clean = series.dropna()
    if clean.empty:
        return None
    peak = clean.max()
    if peak <= 0:
        return None
    above = clean >= fraction * peak
    # Require the level to hold for most of the following week, so a single wet day
    # or a single lucky observation does not define an onset.
    sustained = above.rolling(7, min_periods=4).mean().shift(-6) >= 0.6
    hits = clean.index[above & sustained.fillna(False)]
    return hits[0] if len(hits) else (clean.index[above][0] if above.any() else None)


def best_lag(observed: pd.Series, predicted: pd.Series, max_lag: int = 21) -> dict:
    results = []
    for lag in range(-max_lag, max_lag + 1):
        shifted = predicted.shift(lag)
        pair = pd.concat([observed, shifted], axis=1).dropna()
        if len(pair) < 20:
            continue
        rho, p_value = spearmanr(pair.iloc[:, 0], pair.iloc[:, 1])
        results.append({"lag": lag, "rho": float(rho), "p": float(p_value), "n": len(pair)})
    if not results:
        return {}
    best = max(results, key=lambda row: row["rho"])
    at_zero = next((row for row in results if row["lag"] == 0), {})
    return {"best_lag_days": best["lag"], "best_rho": round(best["rho"], 3),
            "rho_at_lag_0": round(at_zero.get("rho", np.nan), 3),
            "p_at_lag_0": at_zero.get("p"), "n_days": at_zero.get("n")}


# ---------------------------------------------------------------------------- main


def analyse_region(region: str, truth: dict, grid: pd.DataFrame, params: dict) -> dict:
    grid = grid.copy()
    grid["Date"] = pd.to_datetime(grid.date)
    grid["month"] = grid.Date.dt.month
    output = {"tests": {}, "daily": {}}

    for species in FUNGI:
        score_column = f"{species}_score"
        mult_column = f"{species}_season_mult"
        if score_column not in grid.columns:
            continue
        allowed = params[species].get("climate_zones", [])
        eligible = grid[grid.climate_zone.isin(allowed)] if allowed else grid
        if eligible.empty:
            continue
        eligible = eligible.copy()
        eligible["weather_side"] = np.clip(
            eligible[score_column] / eligible[mult_column].replace(0, np.nan), 0, 10
        )

        rates = monthly_rate(truth, region, species)
        climatology_records = sum(
            sum(truth["climatology_monthly"][region][species][year].values())
            for year in CLIMATOLOGY_YEARS
        )
        if climatology_records < MIN_CLIMATOLOGY_RECORDS or not np.isfinite(rates).any():
            output["tests"][species] = {
                "skipped": "too few climatology records to define a season",
                "climatology_records_2021_2025": int(climatology_records),
            }
            continue
        in_season, out_season = month_labels(rates)
        observed_peak_month = int(np.nanargmax(rates) + 1)

        # --- A: dynamic range, model vs reality
        model_curve = eligible.groupby("month")[mult_column].mean()
        positive = rates[np.isfinite(rates) & (rates > 0)]
        observed_range = float(np.nanmax(rates) / positive.min()) if len(positive) else None
        entry = {
            "climatology_records_2021_2025": int(climatology_records),
            "observed_in_season_months": sorted(in_season),
            "observed_dead_months": sorted(out_season),
            "observed_peak_month": observed_peak_month,
            "observed_seasonal_range_x": round(observed_range, 1) if observed_range else None,
            "model_multiplier_min": round(float(model_curve.min()), 3),
            "model_multiplier_max": round(float(model_curve.max()), 3),
            "model_seasonal_range_x": round(float(model_curve.max() / model_curve.min()), 2),
            "model_peak_month_in_window": int(model_curve.idxmax()),
        }

        # --- B: in-season vs dead-month separation, within location
        labelled = eligible[eligible.month.isin(in_season | out_season)].copy()
        labelled["in_season"] = labelled.month.isin(in_season)
        testable = labelled.in_season.nunique() == 2
        entry["separation"] = {"testable_in_window": bool(testable)}
        if testable:
            for name, column in (("full_score", score_column),
                                 ("season_curve_only", mult_column),
                                 ("weather_only", "weather_side")):
                value, locations = within_location_auc(labelled, column)
                entry["separation"][name] = round(value, 3) if value is not None else None
                entry["separation"]["locations"] = locations
            in_rows = labelled[labelled.in_season]
            out_rows = labelled[~labelled.in_season]
            entry["separation"].update({
                "median_score_in_season": round(float(in_rows[score_column].median()), 2),
                "median_score_dead_months": round(float(out_rows[score_column].median()), 2),
                "share_ge4_in_season": round(float((in_rows[score_column] >= GOOD_SCORE).mean()), 3),
                "share_ge4_dead_months": round(float((out_rows[score_column] >= GOOD_SCORE).mean()), 3),
                "n_in_season_cell_days": int(len(in_rows)),
                "n_dead_cell_days": int(len(out_rows)),
            })

        # --- C/D/E: daily series
        daily = eligible.groupby("Date").agg(
            median_score=(score_column, "median"),
            mean_score=(score_column, "mean"),
            share_ge4=(score_column, lambda values: float((values >= GOOD_SCORE).mean())),
            season_mult=(mult_column, "mean"),
            weather_side=("weather_side", "mean"),
        )
        observed = daily_observed_rate(truth, region, species).reindex(daily.index)
        daily["observed_rate"] = observed.rate_smooth
        daily["observed_count"] = observed["count"]
        climatology = climatological_doy_rate(np.nan_to_num(rates), daily.index)
        daily["climatology_rate"] = climatology
        daily["observed_anomaly"] = daily.observed_rate / np.where(
            climatology > 0, climatology, np.nan
        )

        observed_onset = crossing_date(daily.observed_rate, ONSET_FRACTION)
        entry["onset"] = {
            "observed": observed_onset.date().isoformat() if observed_onset is not None else None,
            "total_records_2026_in_window": int(daily.observed_count.sum()),
            # The score history starts 2026-04-12, so a species already fruiting then has
            # its true onset outside the window and no onset error can be claimed.
            "observed_censored_at_window_start": bool(
                observed_onset is not None and observed_onset == daily.index[0]
            ),
        }
        for name, column in (("model", "median_score"), ("climatology_baseline", "season_mult")):
            predicted = crossing_date(daily[column], ONSET_FRACTION)
            entry["onset"][name] = predicted.date().isoformat() if predicted is not None else None
            if predicted is not None and observed_onset is not None:
                entry["onset"][f"{name}_error_days"] = int((predicted - observed_onset).days)
        # The relative rule above is degenerate for a series whose floor is 0.6 of its
        # own peak, so also report the product's own definition of "season has started":
        # the first day the region's median score reaches the recommendation threshold.
        above = daily.index[daily.median_score >= GOOD_SCORE]
        entry["onset"]["model_median_ge4"] = above[0].date().isoformat() if len(above) else None
        entry["onset"]["share_of_window_median_ge4"] = round(
            float((daily.median_score >= GOOD_SCORE).mean()), 3
        )
        if len(above) and observed_onset is not None:
            entry["onset"]["model_median_ge4_error_days"] = int((above[0] - observed_onset).days)

        entry["lead_lag"] = {
            name: best_lag(daily.observed_rate, daily[column])
            for name, column in (("full_score", "median_score"),
                                 ("season_curve_only", "season_mult"),
                                 ("weather_only", "weather_side"))
        }

        anomaly = daily[["observed_anomaly", "weather_side", "median_score"]].dropna()
        if len(anomaly) >= 20:
            rho_weather, p_weather = spearmanr(anomaly.observed_anomaly, anomaly.weather_side)
            rho_full, p_full = spearmanr(anomaly.observed_anomaly, anomaly.median_score)
            entry["anomaly_skill"] = {
                "weather_rho": round(float(rho_weather), 3), "weather_p": round(float(p_weather), 4),
                "full_score_rho": round(float(rho_full), 3), "full_score_p": round(float(p_full), 4),
                "n_days": int(len(anomaly)),
            }
        else:
            entry["anomaly_skill"] = {"n_days": int(len(anomaly))}

        # Both series rise through the summer, so a raw correlation is mostly shared
        # trend. Differencing removes any trend and asks the only causal question that
        # matters: when the weather score moves, does fruiting move with it?
        differenced = daily[["observed_rate", "weather_side", "median_score"]].diff().dropna()
        entry["detrended_skill"] = {"n_days": int(len(differenced))}
        if len(differenced) >= 30:
            for name, column in (("weather", "weather_side"), ("full_score", "median_score")):
                rho, p_value = spearmanr(differenced.observed_rate, differenced[column])
                entry["detrended_skill"][f"{name}_rho"] = round(float(rho), 3)
                entry["detrended_skill"][f"{name}_p"] = round(float(p_value), 4)
            lagged = best_lag(
                daily.observed_rate.diff(), daily.weather_side.diff(), max_lag=14
            )
            entry["detrended_skill"]["weather_best_lag"] = lagged

        # Daily GBIF counts are very noisy, so give the weather side a fairer hearing at
        # weekly resolution: week-over-week change in fruiting against week-over-week
        # change in the weather score.
        weekly = daily[["observed_rate", "weather_side", "median_score"]].resample("W").mean()
        weekly_change = weekly.diff().dropna()
        entry["detrended_skill"]["weeks"] = int(len(weekly_change))
        if len(weekly_change) >= 8:
            for name, column in (("weather", "weather_side"), ("full_score", "median_score")):
                rho, p_value = spearmanr(weekly_change.observed_rate, weekly_change[column])
                entry["detrended_skill"][f"weekly_{name}_rho"] = round(float(rho), 3)
                entry["detrended_skill"][f"weekly_{name}_p"] = round(float(p_value), 4)

        output["tests"][species] = entry
        output["daily"][species] = daily.reset_index().assign(
            date=lambda frame: frame.Date.dt.strftime("%Y-%m-%d")
        ).drop(columns="Date").round(4).to_dict("records")
    return output


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--truth", default="docs/qa/season-truth-2026/gbif-season-truth.json")
    parser.add_argument("--scan", default="docs/qa/season-timing-2026")
    parser.add_argument("--regions", default="NE,SE,USE,USW")
    args = parser.parse_args()
    scan = Path(args.scan)
    truth = json.loads(Path(args.truth).read_text(encoding="utf-8"))

    session = requests.Session()
    session.headers["User-Agent"] = "fung.es season-timing QA"
    results = {}
    for region in args.regions.split(","):
        path = scan / f"grid-cell-days-{region}.parquet"
        if not path.exists():
            print(f"skip {region}: {path} missing", flush=True)
            continue
        params, _ = load_specs(session, region)
        grid = pd.read_parquet(path)
        print(f"{region}: {len(grid):,} cell-days, {grid.Location_Id.nunique():,} locations", flush=True)
        results[region] = analyse_region(region, truth, grid, params)
        print(json.dumps(results[region]["tests"], indent=2)[:3000], flush=True)

    (scan / "season-analysis.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(f"wrote {scan / 'season-analysis.json'}")


if __name__ == "__main__":
    main()
