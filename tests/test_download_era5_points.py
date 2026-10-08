"""ERA5 training weather: local days must line up with the production pipeline's."""
from datetime import datetime

import numpy as np
import pandas as pd

import download_era5_points as dl


def _hourly(lat=50.0, lon=0.0, start="2026-08-01 00:00", hours=72, **values):
    times = pd.date_range(start, periods=hours, freq="h")
    frame = pd.DataFrame({"valid_time": times.strftime("%Y-%m-%d %H:%M:%S"),
                          "latitude": lat, "longitude": lon,
                          "tp": 0.0, "t2m": 288.15, "d2m": 283.15, "ssrd": 0.0, "u10": 3.0, "v10": 4.0})
    for column, by_time in values.items():
        for when, value in by_time.items():
            frame.loc[times == pd.Timestamp(when), column] = value
    return frame


def test_rain_counts_toward_the_local_day_its_hour_ended_in():
    # At 0° the hour ending 2 Aug 00:00 is 1 Aug's last hour.
    days = dl.daily(_hourly(tp={"2026-08-02 00:00": 0.004, "2026-08-02 01:00": 0.002})).set_index("Date")
    assert days.loc["2026-08-01", "TotalPrecipitation_mm"] == 4.0
    assert days.loc["2026-08-02", "TotalPrecipitation_mm"] == 2.0
    assert days.loc["2026-08-01", "Rain Hours"] == 1


def test_local_day_follows_longitude():
    # At 105° W a day runs 07:00-07:00 UTC: rain in the hour ending 2 Aug 05:00 is 1 Aug's.
    days = dl.daily(_hourly(lat=40.0, lon=-105.0, tp={"2026-08-02 05:00": 0.003})).set_index("Date")
    assert days.loc["2026-08-01", "TotalPrecipitation_mm"] == 3.0


def test_instant_fields_become_mean_max_min_humidity_and_wind():
    hourly = _hourly(t2m={"2026-08-01 12:00": 298.15})
    day = dl.daily(hourly).set_index("Date").loc["2026-08-01"]
    assert day["Temperature (C) Max"] == 25.0
    assert day["Temperature (C) Min"] == 15.0
    assert np.isclose(day["Temperature (C)"], 15.0 + 10.0 / 24, atol=1e-3)
    assert np.isclose(day["Wind Speed (kph)"], 18.0)            # 5 m/s
    assert 70.0 < day["Humidity (%)"] < 73.0                    # 15 °C over a 10 °C dew point


def test_days_missing_hours_are_left_out():
    days = dl.daily(_hourly(start="2026-08-01 06:00", hours=30))
    assert days.empty


def test_blocks_are_2x2_cells_busiest_first():
    points = pd.DataFrame({"Latitude": [46.1, 46.2, 46.3, 60.0], "Longitude": [8.6, 8.8, 8.7, 10.0]})
    found = dl.blocks(points)
    assert found.iloc[0][["south", "west", "finds"]].tolist() == [46.0, 8.5, 3]
    assert found.iloc[1][["south", "west", "finds"]].tolist() == [60.0, 10.0, 1]


def test_nothing_is_submitted_during_the_nightly_run():
    assert dl.seconds_until_allowed(datetime(2026, 10, 8, 0, 29)) == 0
    assert dl.seconds_until_allowed(datetime(2026, 10, 8, 1, 7)) == (4 * 60 + 53) * 60
    assert dl.seconds_until_allowed(datetime(2026, 10, 8, 6, 0)) == 0
