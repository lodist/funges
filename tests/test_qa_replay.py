import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from qa_replay import on_day, percentiles  # noqa: E402


def test_percentiles_weigh_background_and_count_ties_half():
    matrix = np.ones((3, 50))
    matrix[0, 10] = 5.0          # the find
    matrix[0, 11] = 5.0          # a tie inside its 3 weeks
    matrix[1, 10], matrix[2, 10] = 4.0, 5.0
    where, timing, season = percentiles(matrix, np.array([0]), np.array([10]), np.array([1, 2]), np.array([1, 3]))
    assert where[0] == (1 + 0.5 * 3) / 4
    # days 0..31 lie within 21 days of day 10: 31 besides the find's own day
    assert timing[0] == 30.5 / 31
    assert season[0] == 48.5 / 49


def test_percentiles_leave_out_thin_windows_and_unscored_finds():
    matrix = np.full((2, 50), np.nan)
    matrix[0, :10] = 1.0
    matrix[1, :] = 2.0
    matrix[1, 30] = np.nan
    where, timing, season = percentiles(matrix, np.array([0, 1]), np.array([5, 30]), np.array([1]), np.array([1]))
    assert np.isnan(timing[0])   # 9 other days, fewer than MIN_TIMING_DAYS
    assert season[0] == 4.5 / 9  # ties counting half
    assert where[0] == 0.0
    assert np.isnan(where[1]) and np.isnan(timing[1]) and np.isnan(season[1])


def test_on_day_anchors_the_gbm_without_touching_the_settings():
    gbm = {"anchor": "2026-10-16", "booster": object()}
    params = {"porcini": {"fruiting_gbm": gbm, "optimal_temp": 14}, "nettle": {"optimal_temp": 12}}
    day = np.datetime64("2026-09-01")
    dated = on_day(params, day)
    assert dated["porcini"]["fruiting_gbm"]["anchor"] == day
    assert dated["porcini"]["fruiting_gbm"]["booster"] is gbm["booster"]
    assert gbm["anchor"] == "2026-10-16"
    assert dated["nettle"] is params["nettle"]
