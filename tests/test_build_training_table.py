"""The training table's weather features: each window must cover exactly the days it names."""
import numpy as np
import pandas as pd

import build_training_table as tt


def _cell(days=120, start="2026-05-01", **by_day):
    dates = pd.date_range(start, periods=days)
    frame = pd.DataFrame({"Date": dates, "TotalPrecipitation_mm": 0.0, "Temperature (C)": 15.0,
                          "Temperature (C) Max": 20.0, "Temperature (C) Min": 10.0,
                          "Humidity (%)": 80.0, "Solar Radiation (Wh/m2)": 3000.0})
    for column, values in by_day.items():
        for day, value in values.items():
            frame.loc[frame.Date == pd.Timestamp(day), column] = value
    return frame


def test_rain_windows_count_days_before_and_never_the_day_itself():
    cell = _cell(TotalPrecipitation_mm={"2026-08-10": 9.0, "2026-08-09": 2.0, "2026-08-07": 1.0,
                                        "2026-08-03": 4.0, "2026-07-20": 8.0})
    row = tt.features(cell, pd.DatetimeIndex(["2026-08-10"])).iloc[0]
    assert row["rain_0"] == 9.0
    assert row["rain_1_3"] == 3.0        # 7-9 Aug
    assert row["rain_4_7"] == 4.0        # 3-6 Aug
    assert row["rain_8_14"] == 0.0       # 27 Jul - 2 Aug
    assert row["rain_15_28"] == 8.0      # 13-26 Jul
    assert row["rain_29_42"] == 0.0


def test_days_since_real_rain_looks_only_backwards():
    cell = _cell(TotalPrecipitation_mm={"2026-08-01": 6.0, "2026-08-05": 4.9, "2026-08-10": 20.0})
    rows = tt.features(cell, pd.DatetimeIndex(["2026-08-10", "2026-08-11"]))
    assert rows["days_since_rain5"].tolist() == [9, 1]   # 4.9 mm is not real rain


def test_temperature_humidity_and_cold_snap_windows():
    cell = _cell(**{"Temperature (C) Min": {"2026-08-08": -1.0, "2026-08-09": 1.0},
                    "Temperature (C)": {"2026-08-09": 8.0}})
    row = tt.features(cell, pd.DatetimeIndex(["2026-08-10"])).iloc[0]
    assert np.isclose(row["temp_1_7"], (15.0 * 6 + 8.0) / 7)
    assert row["frost_days_1_14"] == 1
    assert np.isclose(row["tmin_1_3"], (10.0 - 1.0 + 1.0) / 3)
    assert np.isclose(row["tmin_drop"], row["tmin_1_3"] - 10.0)   # vs 8-14 days back
    assert row["humidity_1_7"] == 80.0
    assert row["sun_1_7_kwh"] == 21.0


def test_a_window_reaching_before_the_series_is_empty():
    cell = _cell(start="2026-08-01")
    row = tt.features(cell, pd.DatetimeIndex(["2026-08-10"])).iloc[0]
    assert np.isnan(row["rain_29_42"])
    assert row["rain_1_3"] == 0.0


def test_each_find_gets_its_own_day_and_four_same_weekday_controls():
    finds = pd.DataFrame({"species": ["parasol"], "Location_Id": ["A"], "region": ["NE"],
                          "Date": pd.to_datetime(["2026-08-15"]), "year": [2026]})
    rows = tt.case_rows(finds)
    assert rows["offset"].tolist() == [0, -21, -14, 14, 21]
    assert (rows["date"] - rows["find_date"]).dt.days.tolist() == [0, -21, -14, 14, 21]
    assert rows["case_id"].nunique() == 1
