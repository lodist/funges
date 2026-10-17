"""The lag builders after the rewrite must equal the originals exactly: values, dtypes, column
order and index, with duplicate days, gaps, missing values and an integer column."""
import numpy as np
import pandas as pd

import forecast_pipeline as fp


def _original_lags(df, columns, days, target=None):
    """compute_lag_features before the rewrite (verbatim)."""
    df = df.sort_values(by=["Location_Id", "Date"], ascending=[True, True])
    lookups = {col: df.groupby(["Location_Id", "Date"])[col].last() for col in columns}
    out = df if target is None else target.sort_values(
        by=["Location_Id", "Date"], ascending=[True, True]).copy()
    locs = out["Location_Id"].to_numpy()
    for day in range(1, days + 1):
        target_idx = pd.MultiIndex.from_arrays(
            [locs, (out["Date"] - pd.Timedelta(days=day)).to_numpy()]
        )
        for col in columns:
            out[f"{col}_{day}days_ago"] = lookups[col].reindex(target_idx).to_numpy()
    return out


def _original_by_coord(df, columns, days, coord_lat="_coord_lat", coord_lon="_coord_lon", target=None):
    """compute_lag_features_by_coord before the rewrite (verbatim, on the original lags)."""
    key = df[coord_lat].astype(str) + "_" + df[coord_lon].astype(str)
    coord_series = df.assign(_coord_key=key)[["_coord_key", "Date"] + columns]
    coord_series = (coord_series.drop_duplicates(["_coord_key", "Date"], keep="last")
                                .rename(columns={"_coord_key": "Location_Id"}))
    coord_lagged = _original_lags(coord_series, columns, days)
    lag_cols = [f"{c}_{d}days_ago" for c in columns for d in range(1, days + 1)]
    coord_lagged = coord_lagged.rename(columns={"Location_Id": "_coord_key"})[["_coord_key", "Date"] + lag_cols]
    if target is None:
        dst, dst_key = df, key
    else:
        dst = target
        dst_key = target[coord_lat].astype(str) + "_" + target[coord_lon].astype(str)
    out = dst.assign(_coord_key=dst_key).merge(coord_lagged, on=["_coord_key", "Date"], how="left")
    return out.drop(columns=["_coord_key", coord_lat, coord_lon])


def _frame(seed=0, places=40, base_per_coord=3):
    rng = np.random.default_rng(seed)
    rows = []
    for p in range(places):
        coord = (round(40 + p * 0.06, 3), round(-3 + p * 0.075, 3))
        days = pd.date_range("2026-09-01", "2026-10-23")
        days = days[rng.random(len(days)) > 0.08]                 # gaps
        for b in range(base_per_coord):
            for d in days:
                rows.append({"Location_Id": f"L{p}_{b}", "Date": d, "_coord_lat": coord[0], "_coord_lon": coord[1],
                             "Temperature (C)": rng.normal(12, 5), "Rain Hours": int(rng.integers(0, 24)),
                             "TotalPrecipitation_mm": np.nan if rng.random() < 0.05 else rng.gamma(1, 2),
                             "other": rng.random()})
    df = pd.DataFrame(rows)
    dup = df.sample(30, random_state=seed)                         # duplicate (Location_Id, Date)
    dup["Temperature (C)"] += 1
    return pd.concat([df, dup], ignore_index=True).sample(frac=1, random_state=seed)


COLUMNS = ["Temperature (C)", "TotalPrecipitation_mm", "Rain Hours"]


def test_compute_lag_features_equals_the_original():
    df = _frame().drop(columns=["_coord_lat", "_coord_lon"])
    target = df[df["Date"] >= "2026-10-17"]
    for t in (None, target):
        pd.testing.assert_frame_equal(fp.compute_lag_features(df, COLUMNS, 42, target=t),
                                      _original_lags(df, COLUMNS, 42, target=t), check_exact=True)


def test_compute_lag_features_by_coord_equals_the_original():
    df = _frame(seed=1).drop_duplicates(["Location_Id", "Date"], keep="last")
    target = df[df["Date"] >= "2026-10-17"]
    for t in (None, target):
        pd.testing.assert_frame_equal(fp.compute_lag_features_by_coord(df, COLUMNS, 42, target=t),
                                      _original_by_coord(df, COLUMNS, 42, target=t), check_exact=True)


def test_compute_lag_features_by_coord_equals_the_original_on_float_weather():
    # Weather lags are all floats in the pipeline: the one-block path.
    df = _frame(seed=2).drop_duplicates(["Location_Id", "Date"], keep="last")
    df["Rain Hours"] = df["Rain Hours"].astype(float)
    target = df[df["Date"] >= "2026-10-17"]
    for t in (None, target):
        pd.testing.assert_frame_equal(fp.compute_lag_features_by_coord(df, COLUMNS, 42, target=t),
                                      _original_by_coord(df, COLUMNS, 42, target=t), check_exact=True)
