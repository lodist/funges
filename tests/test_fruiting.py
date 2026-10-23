"""The fitted fruiting model in production must see exactly what it was trained on."""
import json

import numpy as np
import pytest
import pandas as pd

import build_training_table as tt
import forecast_pipeline as fp


def _series(days=120, seed=0):
    rng = np.random.default_rng(seed)
    dates = pd.date_range("2026-05-01", periods=days)
    return pd.DataFrame({
        "Location_Id": "A", "Date": dates,
        "TotalPrecipitation_mm": np.where(rng.random(days) < 0.3, rng.gamma(1.5, 4.0, days), 0.0),
        "Temperature (C)": rng.normal(14, 4, days),
        "Temperature (C) Min": rng.normal(6, 5, days),
        "Temperature (C) Max": rng.normal(20, 4, days),
        "Humidity (%)": rng.uniform(50, 98, days),
        "Solar Radiation (Wh/m2)": rng.uniform(500, 6000, days),
        "Pressure (hPa)": 1013.0, "Wind Speed (m/s)": 3.0,
    })


def _production_frame(series, dates):
    target = series[series["Date"].isin(dates)]
    columns = ["Temperature (C)", "TotalPrecipitation_mm", "Humidity (%)",
               "Temperature (C) Min", "Solar Radiation (Wh/m2)"]
    return fp.compute_lag_features(series, columns, 42, target=target).reset_index(drop=True)


def test_production_features_match_the_training_table():
    series = _series()
    dates = pd.DatetimeIndex(series["Date"].iloc[[50, 75, 119]])
    trained = fp.fruiting_design(tt.features(series, dates))
    production = fp.fruiting_design(fp.fruiting_raw_features(_production_frame(series, dates)))
    pd.testing.assert_frame_equal(production.reset_index(drop=True), trained.reset_index(drop=True),
                                  check_dtype=False, atol=1e-9)


def test_warmth_terms_are_each_window_times_the_normal_less_the_base():
    series = _series()
    dates = pd.DatetimeIndex(series["Date"].iloc[[50, 75]])
    warmth = np.array([3.0, -2.0])
    design = fp.fruiting_design(tt.features(series, dates), warmth)
    for name in fp.FRUITING_WARM_WINDOWS:
        np.testing.assert_allclose(design[f"{name}_x_warmth"], design[name] * warmth)
    assert fp.fruiting_design(tt.features(series, dates))["rain_8_14_x_warmth"].isna().all()   # unknown, so average


def test_production_reads_warmth_from_the_scored_day_as_the_maps_do():
    grid = {"lat": np.array([46.0, 45.75], np.float32), "lon": np.array([8.0, 8.25], np.float32),
            "tmean": np.repeat(np.arange(1.0, 13.0)[:, None, None] * 2, 2, axis=1).repeat(2, axis=2).astype(np.float16),
            "rain": np.ones((12, 2, 2), np.float16), "rh": np.full((12, 2, 2), 80, np.float16)}
    days = pd.DatetimeIndex(["2026-07-15", "2026-10-15"])
    warmth = fp.fruiting_warmth(grid, [46.0, 46.0], [8.0, 8.0], days)
    np.testing.assert_allclose(warmth, [14.0 - fp.WARMTH_BASE_C, 20.0 - fp.WARMTH_BASE_C], atol=0.15)   # mid-July, mid-October


def test_a_place_at_its_normal_rain_gets_nothing_from_the_warmth_terms():
    grid = {"lat": np.array([46.0, 45.75], np.float32), "lon": np.array([8.0, 8.25], np.float32),
            "tmean": np.stack([np.full((2, 2), t) for t in np.linspace(2, 24, 12)]).astype(np.float16),
            "rain": np.full((12, 2, 2), 3.0, np.float16), "rh": np.full((12, 2, 2), 80, np.float16)}
    days = pd.DatetimeIndex(["2026-02-15", "2026-08-15"])          # a cold and a warm time of year
    design = pd.DataFrame({name: np.zeros(2) for name in fp.FRUITING_FEATURES})
    for w in fp.FRUITING_WARM_WINDOWS:
        near, far = fp.FRUITING_RAIN_WINDOWS[w]
        design[w] = np.log1p(3.0 * (far - near + 1))             # exactly the normal rain
        design[f"{w}_x_warmth"] = design[w] * 5.0
    out = fp.fruiting_relative(design, grid, [46.0, 46.0], [8.0, 8.0], days)
    for w in fp.FRUITING_WARM_WINDOWS:
        np.testing.assert_allclose(out[f"{w}_x_warmth"], 0.0, atol=1e-2)
    wetter = design.assign(rain_15_21=design["rain_15_21"] + 1.0)
    moved = fp.fruiting_relative(wetter, grid, [46.0, 46.0], [8.0, 8.0], days)["rain_15_21_x_warmth"].to_numpy()
    assert moved[1] > 0 > moved[0]                                  # extra rain counts up when warm, down when cold


def test_the_gbm_keeps_the_window_features_it_shipped_with():
    shipped = json.loads((fp.FRUITING_GBM_PATH).read_text(encoding="utf-8"))
    assert shipped["features"] == fp.FRUITING_GBM_FEATURES
    assert fp.FRUITING_GBM_FEATURES[:len(fp.FRUITING_GBM_BASE)] == fp.FRUITING_GBM_BASE


def test_a_dry_spell_longer_than_the_lags_is_capped_the_same_way():
    series = _series()
    series.loc[:, "TotalPrecipitation_mm"] = 0.0
    series.loc[5, "TotalPrecipitation_mm"] = 30.0           # the only real rain, 100 days back
    dates = pd.DatetimeIndex(series["Date"].iloc[[105]])
    trained = fp.fruiting_design(tt.features(series, dates))["dry_days"].iloc[0]
    production = fp.fruiting_design(fp.fruiting_raw_features(_production_frame(series, dates)))["dry_days"].iloc[0]
    assert trained == production == np.log1p(fp.DRY_DAYS_CAP)


def _model(beta, means=None, months=None):
    k = len(fp.FRUITING_FEATURES)
    month = {"eta": [-5.0, 0.0, 5.0], "weather_part": [0.1, 0.5, 0.9]}
    return {"means": np.zeros(k) if means is None else means, "sds": np.ones(k), "beta": beta,
            "map": months or [month] * 12}


def test_the_index_is_mapped_onto_the_hand_set_weather_part_scale():
    series = _series()
    frame = _production_frame(series, pd.DatetimeIndex(series["Date"].iloc[[60, 61]]))
    flat = fp.fruiting_weather_part(frame, _model(np.zeros(len(fp.FRUITING_FEATURES))))
    assert np.allclose(flat, 0.5)                          # index 0 -> the middle of the map
    wet = np.zeros(len(fp.FRUITING_FEATURES))
    wet[fp.FRUITING_FEATURES.index("rain_8_14")] = 1.0
    scored = fp.fruiting_weather_part(frame, _model(wet))
    expected = np.interp(fp.fruiting_design(fp.fruiting_raw_features(frame))["rain_8_14"].to_numpy(),
                         [-5.0, 0.0, 5.0], [0.1, 0.5, 0.9])
    assert np.allclose(scored, expected)


def test_a_feature_the_row_lacks_counts_as_average():
    series = _series()
    series["Temperature (C) Min"] = np.nan                     # a fetch that returned no minimum
    frame = _production_frame(series, pd.DatetimeIndex(series["Date"].iloc[[60]]))
    frost_only = np.zeros(len(fp.FRUITING_FEATURES))
    frost_only[fp.FRUITING_FEATURES.index("frost")] = 3.0
    assert np.allclose(fp.fruiting_weather_part(frame, _model(frost_only)), 0.5)


def test_sunshine_is_not_read():
    # Stored only since 8 Oct 2026 and never compared with ERA5's; leaving it out cost nothing.
    series = _series()
    frame = _production_frame(series, pd.DatetimeIndex(series["Date"].iloc[[60, 90]]))
    dark = frame.assign(**{c: 0.0 for c in frame.columns if c.startswith("Solar Radiation")})
    model = _model(np.ones(len(fp.FRUITING_FEATURES)), months=[{"eta": [-1e6, 1e6], "weather_part": [0.0, 1.0]}] * 12)
    assert np.allclose(fp.fruiting_weather_part(frame, model), fp.fruiting_weather_part(dark, model), rtol=0, atol=1e-12)


def test_a_shipped_species_scores_with_its_fitted_weather_part(monkeypatch):
    import _phase2_fixture as fx

    df = fx.forward_df().drop(columns=["_coord_lat", "_coord_lon"])
    df["Wind Speed (m/s)"] = df.pop("Wind Speed (kph)") / 3.6
    params = fx.species_params()
    shipped = dict(params["sp_curve"], fruiting=_model(np.zeros(len(fp.FRUITING_FEATURES))))
    out = fp.calculate_mushroom_score(df.copy(), {"sp_curve": shipped}, fx.zone_curves())
    assert np.allclose(out["sp_curve_Weather_Score"], 0.5)
    hand_set = fp.calculate_mushroom_score(df.copy(), {"sp_curve": params["sp_curve"]}, fx.zone_curves())
    assert not np.allclose(out["sp_curve_score"], hand_set["sp_curve_score"])


def test_a_fit_file_for_other_features_is_not_used(tmp_path, capsys):
    path = tmp_path / "fruiting_fit.json"
    path.write_text(json.dumps({"features": ["something_else"], "means": [0], "sds": [1],
                                "models": {"sp_curve": {"NE": {"beta": [1], "map": {}}}}}))
    params = {"sp_curve": {}}
    fp.attach_fruiting_models(params, "NE", path)
    assert "fruiting" not in params["sp_curve"]
    assert "features differ" in capsys.readouterr().out


def test_the_scale_follows_the_time_of_year():
    series = _series(days=250)                                   # 1 May 2026 - 5 Jan 2027
    at = {d: series.index[series["Date"] == d][0] for d in ("2026-06-15", "2026-07-01", "2027-01-01")}
    frame = _production_frame(series, pd.DatetimeIndex(series["Date"].iloc[list(at.values())]))
    flat = np.zeros(len(fp.FRUITING_FEATURES))
    level = [2.0] + [m / 10 for m in range(1, 11)] + [3.0]      # January 2, June 0.5, July 0.6, December 3
    months = [{"eta": [-1.0, 1.0], "weather_part": [v, v]} for v in level]
    june, july_1st, new_year = fp.fruiting_weather_part(frame, _model(flat, months=months))
    assert abs(june - 0.5) < 0.01                                # mid-June reads June's scale
    assert abs(july_1st - 0.55) < 0.01                           # 1 July: halfway to July's
    assert 2.0 < new_year < 3.0                                  # between December's and January's


def _local(ratio):
    """Settings of a species whose season is local, with a region curve of this ratio."""
    return {"local_season": {}, "season_curve": {"multiplier": {m: 1.0 for m in range(1, 13)},
                                                 "ratio": {m: r for m, r in zip(range(1, 13), ratio)}}}


def _months(base=0.1, step=0.7 / 11):
    return [{"eta": [-1.0, 1.0], "weather_part": [base + m * step, base + m * step + 0.1]} for m in range(12)]


def test_the_best_month_is_the_region_curve_s_peak():
    months = _months()
    june = fp.best_month_parts(months, _local([0] * 5 + [1] + [0] * 6)["season_curve"])
    assert len(june) == 1 and np.allclose(june[0], months[5]["weather_part"])
    autumn = fp.best_month_parts(months, _local([0, 0, 0, 0, 0, 0.1, 0.5, 0.8, 1.0, 0.6, 0.2, 0])["season_curve"])
    assert np.allclose(autumn[0], months[8]["weather_part"])     # September, the peak
    assert len(fp.best_month_parts(months, _local([1] * 12)["season_curve"])) == 12   # a tie keeps them all
    assert fp.best_month_parts(months, None) is None             # no ratio, no best month


def test_pooled_quantiles_weigh_each_part_alike():
    low, high = np.array([0.2, 0.3, 0.4]), np.array([0.6, 0.7, 0.8])
    assert np.allclose(fp.pooled_quantiles([low]), low)
    pooled = fp.pooled_quantiles([low, high])
    assert pooled[0] == pytest.approx(0.2) and pooled[-1] == pytest.approx(0.8) and 0.4 <= pooled[1] <= 0.6


def test_a_species_reads_on_one_scale_in_every_region(monkeypatch):
    months, september = _months(), _local([0] * 8 + [1] + [0] * 3)
    monkeypatch.setattr(fp, "species_scales", lambda: {"porcini": np.array([0.5, 0.9])})
    assert np.allclose(fp.season_scale("porcini", months, september), [0.5, 0.9])
    assert np.allclose(fp.season_scale("other", months, september), months[8]["weather_part"])  # its region's best month
    regional = {k: v for k, v in september.items() if k != "local_season"}
    assert fp.season_scale("porcini", months, regional) is None  # season on region curves: months' own
    assert fp.season_scale("porcini", months, {"local_season": {}}) is None   # no ratio


def _peak(month):
    return {"multiplier": {m: 1.0 for m in range(1, 13)}, "ratio": {m: float(m == month) for m in range(1, 13)}}


def test_the_one_scale_pools_each_region_s_best_month():
    import build_fruiting_scale

    north, west, south = _months(0.6, 0.01), _months(0.2, 0.01), _months(0.9, 0.0)
    fit = {"porcini": {"NE": {"map": north}, "SE": {"map": south}}}
    gbm = {"porcini": {"regions": {"USW": {"map": west}}}}
    curves = {"NE": {"porcini": _peak(9)}, "SE": {"porcini": _peak(9)}, "USW": {"porcini": _peak(10)}}
    local = {"NE": {"porcini"}, "USW": {"porcini"}}                 # SE's season is not local: left out
    scales = build_fruiting_scale.build(fit, gbm, curves, local)
    best = [np.array(north[8]["weather_part"]), np.array(west[9]["weather_part"])]   # September, October
    assert np.allclose(scales["porcini"], fp.pooled_quantiles(best))


def test_a_fitted_local_species_without_a_best_month_stops_the_build():
    import build_fruiting_scale

    flat = {"porcini": {"multiplier": {m: 1.0 for m in range(1, 13)}}}   # no ratio
    with pytest.raises(SystemExit, match="porcini NE"):
        build_fruiting_scale.build({"porcini": {"NE": {"map": _months()}}}, {}, {"NE": flat}, {"NE": {"porcini"}})


def test_the_scales_are_read_from_their_file(tmp_path, monkeypatch, capsys):
    path = tmp_path / "fruiting_scale.json"
    path.write_text(json.dumps({"built": "2026-10-24", "scales": {"porcini": [0.2, 0.5, 0.9]}}))
    monkeypatch.setattr(fp, "FRUITING_SCALE_PATH", path)
    fp.species_scales.cache_clear()
    try:
        assert np.allclose(fp.species_scales()["porcini"], [0.2, 0.5, 0.9])
        fp.species_scales.cache_clear()
        monkeypatch.setattr(fp, "FRUITING_SCALE_PATH", tmp_path / "missing.json")
        assert fp.species_scales() == {}                             # each region keeps its own best month
        assert "not loaded" in capsys.readouterr().out
    finally:
        fp.species_scales.cache_clear()


def test_on_one_scale_the_same_weather_reads_the_same_all_year():
    series = _series(days=250)
    at = [series.index[series["Date"] == d][0] for d in ("2026-06-15", "2026-07-15", "2027-01-01")]
    frame = _production_frame(series, pd.DatetimeIndex(series["Date"].iloc[at]))
    level = [2.0] + [m / 10 for m in range(1, 11)] + [3.0]
    months = [{"eta": [-1.0, 1.0], "weather_part": [v, v]} for v in level]
    model = _model(np.zeros(len(fp.FRUITING_FEATURES)), months=months)
    model["scale"] = np.array([0.3, 0.7])
    assert np.allclose(fp.fruiting_weather_part(frame, model), 0.5)   # the months' own levels are gone
    months[6] = {"eta": [-2.0, 0.0], "weather_part": [0.7, 0.7]}      # July: index 0 is its best
    assert abs(fp.fruiting_weather_part(frame, model)[1] - 0.7) < 0.02  # a month still ranks its own index


def test_a_species_with_a_local_season_gets_one_scale(tmp_path, monkeypatch):
    monkeypatch.setattr(fp, "species_scales", dict)                 # no other region: its own best month
    k = len(fp.FRUITING_FEATURES)
    month = {"eta": [-1.0, 1.0], "weather_part": [0.2, 0.6]}
    path = tmp_path / "fruiting_fit.json"
    path.write_text(json.dumps({"features": fp.FRUITING_FEATURES, "means": [0] * k, "sds": [1] * k,
                                "humidity_from_stored": {"NE": [0.0, 1.0]},
                                "models": {s: {"NE": {"beta": [0] * k, "map": [month] * 12}} for s in ("a", "b")}}))
    params = {"a": _local([1.0] * 12), "b": {}}
    fp.attach_fruiting_models(params, "NE", path)
    assert np.allclose(params["a"]["fruiting"]["scale"], [0.2, 0.6])
    assert params["b"]["fruiting"]["scale"] is None


def test_stored_humidity_is_put_on_the_era5_level_first():
    series = _series()
    frame = _production_frame(series, pd.DatetimeIndex(series["Date"].iloc[[60, 90]]))
    humid = np.zeros(len(fp.FRUITING_FEATURES))
    humid[fp.FRUITING_FEATURES.index("humidity")] = 0.05
    humid[fp.FRUITING_FEATURES.index("humidity_early")] = 0.02
    as_era5 = frame.copy()
    for column in [c for c in frame.columns if c.startswith("Humidity (%)")]:
        as_era5[column] = 20.0 + 0.8 * frame[column]
    assert np.allclose(fp.fruiting_weather_part(frame, {**_model(humid), "humidity_from_stored": [20.0, 0.8]}),
                       fp.fruiting_weather_part(as_era5, _model(humid)))


def test_a_shipped_model_carries_its_region_humidity_correction(tmp_path):
    k = len(fp.FRUITING_FEATURES)
    path = tmp_path / "fruiting_fit.json"
    path.write_text(json.dumps({"features": fp.FRUITING_FEATURES, "means": [0] * k, "sds": [1] * k,
                                "humidity_from_stored": {"SE": [21.0, 0.9], "NE": [27.0, 0.8]},
                                "models": {"chant": {"SE": {"beta": [0] * k, "map": []}}}}))
    params = {"chant": {}, "parasol": {}}
    fp.attach_fruiting_models(params, "SE", path)
    assert params["chant"]["fruiting"]["humidity_from_stored"] == [21.0, 0.9]
    assert "fruiting" not in params["parasol"]


def _grid(rh=75.0, tmean=14.0, lat=(45.0, 44.75), lon=(10.0, 10.25)):
    """A normals grid whose every month holds the same values (per longitude when given as tuples)."""
    shape = (12, len(lat), len(lon))
    return {"lat": np.array(lat), "lon": np.array(lon), "rain": np.full(shape, 2.0),
            "tmean": np.broadcast_to(np.array(tmean), shape).copy(), "rh": np.broadcast_to(np.array(rh), shape).copy()}


def _place(name, lat, lon, humidity, temperature, days=120):
    series = _series(days).assign(Location_Id=name, Latitude=lat, Longitude=lon)
    series["Humidity (%)"], series["Temperature (C)"] = humidity, temperature
    return series


_CLIMATE = {"temp": 0.1, "temp_sq": -0.1, "humidity": 0.05, "humidity_early": 0.05}


def _climate_model(**extra):
    beta = np.zeros(len(fp.FRUITING_FEATURES))
    for name, b in _CLIMATE.items():
        beta[fp.FRUITING_FEATURES.index(name)] = b
    return {**_model(beta, months=[{"eta": [-50.0, 50.0], "weather_part": [0.0, 1.0]}] * 12), **extra}


def test_a_normal_day_scores_the_same_in_a_dry_and_a_wet_climate():
    # The fit learns only from days at the same place, so a drier or warmer climate lowered
    # every day there, which no test checked (central Apennines, autumn 2024: 7.5 vs 9 in the Alps).
    grid = _grid(rh=(85.0, 60.0), tmean=(12.0, 18.0), lon=(10.0, 15.0))
    wet, dry = _place("wet", 45.0, 10.0, 85.0, 12.0), _place("dry", 45.0, 15.0, 60.0, 18.0)
    day = pd.DatetimeIndex(wet["Date"].iloc[[90]])
    frame = pd.concat([_production_frame(wet, day), _production_frame(dry, day)], ignore_index=True)
    absolute = fp.fruiting_weather_part(frame, _climate_model())
    relative = fp.fruiting_weather_part(frame, _climate_model(normals=grid))
    assert not np.isclose(absolute[0], absolute[1])
    assert np.isclose(relative[0], relative[1])


def test_days_at_one_place_rank_as_before():
    series = _series().assign(Latitude=45.0, Longitude=10.0)
    frame = _production_frame(series, pd.DatetimeIndex(series["Date"].iloc[60:110]))
    absolute = fp.fruiting_weather_part(frame, _climate_model())
    relative = fp.fruiting_weather_part(frame, _climate_model(normals=_grid()))
    assert np.allclose(relative - absolute, (relative - absolute)[0])     # one shift for the place


def test_off_the_normals_grid_humidity_and_temperature_count_as_average():
    series = _series().assign(Latitude=28.3, Longitude=-16.5)              # the Canaries
    frame = _production_frame(series, pd.DatetimeIndex(series["Date"].iloc[[60, 90]]))
    assert np.allclose(fp.fruiting_weather_part(frame, _climate_model(normals=_grid())), 0.5)


def test_a_fit_on_departures_gives_its_models_the_region_normals(tmp_path):
    k = len(fp.FRUITING_FEATURES)
    path = tmp_path / "fruiting_fit.json"
    path.write_text(json.dumps({"features": fp.FRUITING_FEATURES, "means": [0] * k, "sds": [1] * k,
                                "relative_to_normal": True, "humidity_from_stored": {"SE": [21.0, 0.9]},
                                "models": {"chant": {"SE": {"beta": [0] * k, "map": []}}}}))
    params = {"chant": {}}
    fp.attach_fruiting_models(params, "SE", path)
    assert params["chant"]["fruiting"]["normals"]["rh"].shape[0] == 12


def test_a_thin_member_takes_its_groups_answer_and_a_rich_one_keeps_its_own():
    import fit_fruiting as ff
    rng = np.random.default_rng(0)
    group = np.array([1.0, -0.5])
    x = rng.normal(size=(400, 5, 2))
    mask = np.ones((400, 5), bool)
    assert np.allclose(ff.member_fit(x[:10], mask[:10], group), group)          # too few strata: the group's
    x[:, 0, 0] += 2.0                                                           # the member's own finds lean on feature 0
    own = ff.member_fit(x, mask, group)
    assert own[0] > group[0]


def test_a_member_ships_on_its_years_or_pooled_when_its_years_are_few():
    import fit_fruiting as ff
    many = [(y, 0.0, 0.1) for y in range(2016, 2024)]                            # better in 8 of 8 years
    assert ff.group_ships(many, finds=1000, pooled_ci=[-0.1, 0.2])
    few = many[:3]
    assert ff.group_ships(few, finds=400, pooled_ci=[0.01, 0.2])
    assert not ff.group_ships(few, finds=100, pooled_ci=[0.01, 0.2])             # too few finds to pool
    assert not ff.group_ships(few, finds=400, pooled_ci=[-0.01, 0.2])


def _rain_frame(days_back_of_rain, mm=60.0):
    row = {f"TotalPrecipitation_mm_{k}days_ago": (mm if k in days_back_of_rain else 0.0) for k in range(1, 43)}
    row.update({f"Temperature (C)_{k}days_ago": 10.0 for k in range(1, 43)})
    row.update({f"Humidity (%)_{k}days_ago": 70.0 for k in range(1, 43)})
    row.update({f"Wind Speed (m/s)_{k}days_ago": 3.0 for k in range(1, 43)})
    return pd.DataFrame([row])


def test_a_rain_delay_ignores_the_last_days_and_reads_the_weeks_before():
    recent, older = _rain_frame({2}), _rain_frame({16})
    m = lambda df, d: fp._moisture_memory_score(df, cumulative_rain_target=35, rain_first=True, delay=d)[0]
    assert m(recent, 0) > 0.5 and m(recent, 10) == 0.02          # rain 2 days ago: soaked now, nothing yet with a 10-day delay
    assert m(older, 10) > m(older, 0)                             # rain 16 days ago counts in full only once delayed
    assert m(recent, 0) == fp._moisture_memory_score(recent, cumulative_rain_target=35, rain_first=True)[0]


def test_the_rain_delay_is_read_from_the_species_settings():
    df = _rain_frame({2})
    for col, v in (("Temperature (C)", 12.0), ("Humidity (%)", 80.0), ("TotalPrecipitation_mm", 0.0), ("Wind Speed (m/s)", 2.0),
                   ("Elevation (m)", 500.0), ("ph_level", 6.0), ("dist_m_water", 100.0), ("dist_m_sea", 1e5)):
        df[col] = v
    df["climate_zone"], df["Date"], df["Latitude"], df["Longitude"] = "temperate", pd.Timestamp("2026-09-20"), 45.0, 10.0
    base = {"optimal_temp": 15, "temp_sigma": 5, "optimal_alt": 500, "alt_sigma": 800, "optimal_humidity": 80,
            "humidity_sigma": 15, "optimal_pH": 6, "pH_sigma_near": 1.5, "pH_sigma_far": 1.5, "pH_range_near": [5, 7],
            "min_cumulative_rain": 35, "weather_preference": {"rain_first": True}, "season_months": list(range(1, 13))}
    now = fp.calculate_mushroom_score(df.copy(), {"x": base}, {})["x_score"][0]
    later = fp.calculate_mushroom_score(df.copy(), {"x": {**base, "rain_delay_days": 10}}, {})["x_score"][0]
    assert later < now
