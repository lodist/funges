"""Checks for the case-crossover in qa_weather_skill. If these break, every skill number is wrong."""
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from qa_weather_skill import crossover  # noqa: E402

FIND = pd.Timestamp("2026-08-15")


def _series(values_by_offset, location="A"):
    return pd.DataFrame({
        "Location_Id": location,
        "Date": [FIND + pd.Timedelta(days=offset) for offset in values_by_offset],
        "weather_part": list(values_by_offset.values()),
    })


def _cases(location="A"):
    return pd.DataFrame({"Location_Id": [location], "Date": [FIND]})


def test_find_day_is_ranked_among_same_weekday_controls_only():
    # Controls at -21/-14/+14/+21 hold 1, 9, 2, 3: the find (5) beats three of four.
    # Days 10 and 7 away are a different weekday or inside the moisture window: ignored.
    series = _series({-21: 1.0, -14: 9.0, -10: 100.0, 0: 5.0, 7: 100.0, 14: 2.0, 21: 3.0})
    assert crossover(_cases(), series, "weather_part").tolist() == [0.75]


def test_ties_count_half():
    series = _series({-21: 5.0, -14: 5.0, 0: 5.0, 14: 5.0, 21: 5.0})
    assert crossover(_cases(), series, "weather_part").tolist() == [0.5]


def test_find_needs_a_control_on_each_side():
    # No control after the find: the seasonal trend would not cancel, so it is dropped.
    series = _series({-21: 1.0, -14: 2.0, 0: 5.0})
    assert len(crossover(_cases(), series, "weather_part")) == 0


def test_missing_control_days_are_skipped_not_counted():
    series = _series({-14: 1.0, 0: 5.0, 21: np.nan, 14: 9.0})
    assert crossover(_cases(), series, "weather_part").tolist() == [0.5]


def test_controls_come_from_the_finds_own_location():
    series = pd.concat([_series({-14: 9.0, 0: 5.0, 14: 9.0}, "A"),
                        _series({-14: 1.0, 0: 5.0, 14: 1.0}, "B")])
    assert crossover(_cases("A"), series, "weather_part").tolist() == [0.0]
