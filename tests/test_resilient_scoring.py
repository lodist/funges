import numpy as np
import pandas as pd
import pytest

import forecast_pipeline as fp


def _history_frame(rows=2):
    data = {
        "TotalPrecipitation_mm": np.zeros(rows),
        "Temperature (C)": np.full(rows, 14.0),
        "Humidity (%)": np.full(rows, 75.0),
        "Wind Speed (m/s)": np.full(rows, 3.0),
    }
    for day in range(1, 43):
        data[f"TotalPrecipitation_mm_{day}days_ago"] = np.zeros(rows)
        data[f"Temperature (C)_{day}days_ago"] = np.full(rows, 14.0)
        data[f"Humidity (%)_{day}days_ago"] = np.full(rows, 75.0)
        data[f"Wind Speed (m/s)_{day}days_ago"] = np.full(rows, 3.0)
    return pd.DataFrame(data)


def test_moisture_memory_recognises_rain_older_than_21_days():
    df = _history_frame()
    for day in range(22, 43):
        df.loc[1, f"TotalPrecipitation_mm_{day}days_ago"] = 3.0

    score = fp._moisture_memory_score(
        df, cumulative_rain_target=35.0, rain_first=False)

    assert score[0] == pytest.approx(0.02)
    assert score[1] > 0.20


def test_moisture_memory_accounts_for_drying_conditions():
    df = _history_frame()
    for day in range(1, 43):
        df[f"TotalPrecipitation_mm_{day}days_ago"] = 1.5
        df.loc[1, f"Temperature (C)_{day}days_ago"] = 31.0
        df.loc[1, f"Humidity (%)_{day}days_ago"] = 35.0
        df.loc[1, f"Wind Speed (m/s)_{day}days_ago"] = 10.0

    score = fp._moisture_memory_score(
        df, cumulative_rain_target=35.0, rain_first=False)

    assert score[0] > score[1]


def test_today_rain_cannot_fake_historical_moisture():
    dry = _history_frame(1)
    dry["TotalPrecipitation_mm"] = 40.0
    score = fp._moisture_memory_score(
        dry, cumulative_rain_target=35.0, rain_first=False)
    assert score[0] == pytest.approx(0.02)


def test_wind_is_lagged_multiplicative_and_capped():
    df = _history_frame(3)
    df["Wind Speed (m/s)"] = [2.0, 25.0, 25.0]
    for day in range(1, 8):
        df.loc[2, f"Wind Speed (m/s)_{day}days_ago"] = 30.0

    factor = fp._lagged_wind_factor(df)

    assert factor[0] == pytest.approx(factor[1])  # same history, different wind today
    assert factor[0] == pytest.approx(1.0)
    assert factor[2] == pytest.approx(0.82)


def test_hybrid_aggregation_prevents_single_component_veto():
    components = np.array([[1.0], [1.0], [0.0]])
    hybrid = fp._hybrid_component_mean_rows(components, [1.0, 1.0, 1.0])
    pure_geometric = np.exp(np.log(np.clip(components, 0.02, 1.0)).mean(axis=0))

    assert hybrid[0] > pure_geometric[0]
    assert hybrid[0] > 0.25


def test_spatial_smoothing_is_local_to_date_and_reports_confidence():
    df = pd.DataFrame({
        "Date": pd.to_datetime(["2026-07-01"] * 4 + ["2026-07-02"]),
        "Latitude": [60.0, 60.0, 60.0, 60.0, 60.0],
        # Roughly 0, 5.6, 11.1 and 111 km separation at this latitude.
        "Longitude": [24.0, 24.1, 24.2, 26.0, 24.0],
        "porcini_score": [0.0, 10.0, 10.0, 9.0, 7.0],
    })

    out = fp.spatial_smooth_scores(df, ["porcini_score"])

    assert 0.0 < out.loc[0, "porcini_score"] < 10.0
    assert out.loc[3, "porcini_score"] == pytest.approx(9.0)  # beyond 30 km
    assert out.loc[4, "porcini_score"] == pytest.approx(7.0)  # never crosses dates
    assert out.loc[0, "porcini_confidence"] < out.loc[1, "porcini_confidence"]
    assert 0.0 <= out["porcini_confidence"].min() <= out["porcini_confidence"].max() <= 1.0
