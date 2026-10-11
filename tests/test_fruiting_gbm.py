"""The fruiting GBM in production must see exactly what it was trained on."""
import numpy as np
import pandas as pd

import build_training_table as tt
import forecast_pipeline as fp
from test_fruiting import _production_frame, _series


def test_production_daily_lags_match_the_training_table():
    series = _series()
    dates = pd.DatetimeIndex(series["Date"].iloc[[50, 75, 119]])
    trained = tt.daily_lags(series, dates)
    production = fp.fruiting_gbm_lags(_production_frame(series, dates))
    assert list(production.columns) == list(trained.columns)
    pd.testing.assert_frame_equal(production.reset_index(drop=True), trained.reset_index(drop=True),
                                  check_dtype=False, atol=1e-9)


def test_lags_reaching_before_the_history_are_missing():
    series = _series()
    dates = pd.DatetimeIndex(series["Date"].iloc[[10]])            # 10 days in: rain_d42 has no day
    lags = tt.daily_lags(series, dates)
    assert np.isnan(lags["rain_d42"].iloc[0]) and np.isfinite(lags["rain_d10"].iloc[0])


def _grid():
    lat, lon = np.arange(47.0, 45.0, -0.25, dtype=np.float32), np.arange(8.0, 10.0, 0.25, dtype=np.float32)
    month = np.arange(1, 13, dtype=np.float32)[:, None, None] * np.ones((1, len(lat), len(lon)), np.float32)
    return {"lat": lat, "lon": lon, "tmean": month, "rain": month + 100, "rh": month + 200}


def _gbm_spec(booster, anchor="2026-07-15", corrections=None):
    return {"booster": booster, "region_code": 1, "anchor": pd.Timestamp(anchor), "normals": _grid(),
            "corrections": corrections or {}, "map": [{"eta": [-1e6, 1e6], "weather_part": [0.0, 1.0]}] * 12}


def _frame():
    series = _series()
    frame = _production_frame(series, pd.DatetimeIndex(series["Date"].iloc[[60, 90]]))
    return frame.assign(Latitude=46.17, Longitude=8.8)


def test_gbm_features_follow_the_training_layout():
    frame = _frame()
    x = fp.fruiting_gbm_features(frame, _gbm_spec(None, corrections={"Humidity (%)": [10.0, 0.9]}))
    names = fp.FRUITING_GBM_FEATURES
    assert x.shape == (len(frame), len(names))
    col = names.index
    assert np.allclose(x[:, col("rh_d1")], 10.0 + 0.9 * frame["Humidity (%)_1days_ago"])
    assert np.allclose(x[:, col("rain_d3")], np.log1p(frame["TotalPrecipitation_mm_3days_ago"]))
    assert (x[:, col("find_doy")] == pd.Timestamp("2026-07-15").dayofyear).all()   # the run's day, every row
    assert (x[:, col("norm_tmean")] == 7.0).all() and (x[:, col("norm_rh")] == 207.0).all()  # July
    assert (x[:, col("lat")] == 46.25).all() and (x[:, col("region")] == 1).all()


def test_a_missing_lag_counts_as_unknown():
    frame = _frame().drop(columns=["Temperature (C) Min_5days_ago"])
    x = fp.fruiting_gbm_features(frame, _gbm_spec(None))
    assert np.isnan(x[:, fp.FRUITING_GBM_FEATURES.index("tmin_d5")]).all()


def test_a_species_with_a_gbm_scores_with_it():
    import fit_fruiting_gbm as gbm
    rng = np.random.default_rng(0)
    k = len(fp.FRUITING_GBM_FEATURES)
    booster = gbm.fit(rng.normal(size=(300, 5, k)), np.ones((300, 5), bool), rounds=5)
    frame = _frame()
    spec = _gbm_spec(booster)
    expected = booster.predict(fp.fruiting_gbm_features(frame, spec), raw_score=True) / 2e6 + 0.5
    assert np.allclose(fp.fruiting_gbm_weather_part(fp.fruiting_gbm_features(frame, spec), frame, spec), expected)


def _write_gbm(tmp_path, features=None):
    """A model on 'R2' (a dict served by fetch) and its index file; returns (path, fetch)."""
    import gzip
    import hashlib
    import json
    import fit_fruiting_gbm as gbm
    k = len(fp.FRUITING_GBM_FEATURES)
    booster = gbm.fit(np.random.default_rng(1).normal(size=(300, 5, k)), np.ones((300, 5), bool), rounds=5)
    data = gzip.compress(booster.model_to_string().encode())
    store = {"models/fruiting_gbm/test/chant.txt.gz": data}
    path = tmp_path / "fruiting_gbm.json"
    path.write_text(json.dumps({
        "features": features or fp.FRUITING_GBM_FEATURES,
        "inputs_from_stored": {"SE": {"Humidity (%)": [12.0, 0.89]}},
        "models": {"chant": {"file": "models/fruiting_gbm/test/chant.txt.gz",
                             "sha256": hashlib.sha256(data).hexdigest(),
                             "regions": {"SE": {"map": [{"eta": [-1, 1], "weather_part": [0, 1]}] * 12}}}}}))
    return path, store.__getitem__


def test_a_shipped_gbm_replaces_the_linear_fit(tmp_path):
    params = {"chant": {"fruiting": {"beta": [0]}}, "parasol": {"fruiting": {"beta": [0]}}}
    fp.attach_fruiting_gbm(params, "SE", pd.Timestamp("2026-10-12"), *_write_gbm(tmp_path))
    assert "fruiting" not in params["chant"] and params["chant"]["fruiting_gbm"]["region_code"] == 1
    assert params["chant"]["fruiting_gbm"]["corrections"] == {"Humidity (%)": [12.0, 0.89]}
    assert "fruiting" in params["parasol"] and "fruiting_gbm" not in params["parasol"]


def test_a_gbm_file_for_other_features_is_not_used(tmp_path, capsys):
    params = {"chant": {"fruiting": {"beta": [0]}}}
    fp.attach_fruiting_gbm(params, "SE", pd.Timestamp("2026-10-12"), *_write_gbm(tmp_path, features=["x"]))
    assert "fruiting_gbm" not in params["chant"] and "fruiting" in params["chant"]
    assert "features differ" in capsys.readouterr().out


def test_scoring_uses_the_gbm_weather_part(tmp_path):
    import _phase2_fixture as fx
    df = fx.forward_df().drop(columns=["_coord_lat", "_coord_lon"])
    df["Wind Speed (m/s)"] = df.pop("Wind Speed (kph)") / 3.6
    params = fx.species_params()
    shipped = {"sp_curve": dict(params["sp_curve"])}
    fp.attach_fruiting_gbm({"chant": shipped["sp_curve"]}, "SE", pd.Timestamp("2026-06-13"), *_write_gbm(tmp_path))
    out = fp.calculate_mushroom_score(df.copy(), shipped, fx.zone_curves())
    model = shipped["sp_curve"]["fruiting_gbm"]
    expected = fp.fruiting_gbm_weather_part(fp.fruiting_gbm_features(df, model), df, model)
    assert np.allclose(out["sp_curve_Weather_Score"], np.clip(expected, 0, 1))


def test_a_model_that_fails_its_checksum_keeps_the_linear_fit(tmp_path, capsys):
    path, fetch = _write_gbm(tmp_path)
    params = {"chant": {"fruiting": {"beta": [0]}}}
    fp.attach_fruiting_gbm(params, "SE", pd.Timestamp("2026-10-12"), path, lambda key: fetch(key) + b"x")
    assert "fruiting_gbm" not in params["chant"] and "fruiting" in params["chant"]
    assert "linear fit stays" in capsys.readouterr().out


def test_a_model_that_cannot_be_fetched_keeps_the_linear_fit(tmp_path):
    path, _ = _write_gbm(tmp_path)
    params = {"chant": {"fruiting": {"beta": [0]}}}

    def blocked(key):
        raise ConnectionError("R2 unreachable")
    fp.attach_fruiting_gbm(params, "SE", pd.Timestamp("2026-10-12"), path, blocked)
    assert "fruiting_gbm" not in params["chant"] and "fruiting" in params["chant"]
