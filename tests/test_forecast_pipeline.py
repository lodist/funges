import json
from pathlib import Path
import numpy as np
import pandas as pd
import pytest

import forecast_pipeline as fp  # backend/ is on sys.path via conftest.py

FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "forecast_sample.json").read_text(encoding="utf-8"))
NDP = 3


def _static():
    return {"Altitude": 120.0, "dist_m_water": 50.0, "dist_m_sea": 9000.0,
            "climate_zone": "temperate", "ph_level": 6.2}


def test_parse_emits_one_row_per_forecast_day():
    rows = fp.parse_forecast_days(FIXTURE, _static(), 59.330, 18.070, NDP)
    assert len(rows) == 7


def test_parse_dates_are_real_and_contiguous():
    rows = fp.parse_forecast_days(FIXTURE, _static(), 59.330, 18.070, NDP)
    dates = pd.to_datetime([r["Date"] for r in rows]).sort_values()
    diffs = dates.to_series().diff().dropna().dt.days.unique().tolist()
    assert diffs == [1]  # strictly daily, no gaps


def test_parse_pressure_is_that_days_hourly_mean():
    rows = fp.parse_forecast_days(FIXTURE, _static(), 59.330, 18.070, NDP)
    fday = FIXTURE["forecast"]["forecastday"][3]
    expected = float(np.mean([h["pressure_mb"] for h in fday["hour"] if h.get("pressure_mb") is not None]))
    row3 = [r for r in rows if r["Date"] == fday["date"]][0]
    assert row3["Pressure (hPa)"] == pytest.approx(expected)


def test_parse_carries_day_fields_and_location_id():
    rows = fp.parse_forecast_days(FIXTURE, _static(), 59.330, 18.070, NDP)
    r0 = rows[0]
    d0 = FIXTURE["forecast"]["forecastday"][0]["day"]
    assert r0["Temperature (C) Max"] == d0["maxtemp_c"]
    assert r0["Temperature (C) Min"] == d0["mintemp_c"]
    assert r0["Temperature (C)"] == d0["avgtemp_c"]
    assert r0["Wind Speed (kph)"] == d0["maxwind_kph"]
    assert r0["Humidity (%)"] == d0["avghumidity"]
    assert r0["TotalPrecipitation_mm"] == d0["totalprecip_mm"]
    assert r0["Description"] == d0["condition"]["text"]
    assert len({r["Location_Id"] for r in rows}) == 1
    assert r0["climate_zone"] == "temperate"


def _mk(loc, dates, precip):
    return pd.DataFrame({
        "Location_Id": loc,
        "Date": pd.to_datetime(dates),
        "TotalPrecipitation_mm": precip,
    })


def test_merge_fresher_forecast_overwrites_overlapping_future():
    existing = _mk("A", ["2026-06-09", "2026-06-10", "2026-06-11"], [1.0, 2.0, 3.0])
    new = _mk("A", ["2026-06-10", "2026-06-11", "2026-06-12"], [9.0, 9.0, 9.0])
    out = fp.merge_master(existing, new).sort_values("Date").reset_index(drop=True)
    assert out["Date"].dt.strftime("%Y-%m-%d").tolist() == ["2026-06-09", "2026-06-10", "2026-06-11", "2026-06-12"]
    assert out["TotalPrecipitation_mm"].tolist() == [1.0, 9.0, 9.0, 9.0]


def test_merge_keeps_distinct_locations_separate():
    existing = _mk("A", ["2026-06-09"], [1.0])
    new = _mk("B", ["2026-06-09"], [5.0])
    out = fp.merge_master(existing, new)
    assert len(out) == 2
