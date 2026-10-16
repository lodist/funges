import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from qa_replay import evaluate, on_day, percentiles, summarise  # noqa: E402


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


def test_stored_scores_are_compared_on_their_own_days():
    days = pd.date_range("2026-08-01", periods=50)
    finds = pd.DataFrame({"species_id": ["a", "b"], "date": [str(days[45].date())] * 2,
                          "loc": ["p0", "p1"], "kingdom": ["Fungi", "Fungi"]})
    today = pd.DataFrame({"Location_Id": np.repeat(["p0", "p1"], 50), "Date": np.tile(days, 2)})
    today["a_score"] = np.where(today.Location_Id == "p0", 1.0, 2.0)
    today.loc[(today.Location_Id == "p0") & (today.Date == days[45]), "a_score"] = 5.0
    today["b_score"] = 3.0
    stored = today[today.Date >= days[30]].copy()          # a species stored from day 30 only
    stored.loc[(stored.Location_Id == "p0") & (stored.Date == days[46]), "a_score"] = 9.0

    rows = evaluate("NE", finds, {"today": today, "stored": stored}, days)
    a = rows[rows.species == "a"].set_index("source")
    assert a.timing["today"] == 1.0                       # days 24..49 besides its own: all lower
    assert a.timing["stored"] == 18 / 19                  # days 30..49: one higher
    assert a.timing["today@stored"] == 1.0                # today's code on those same 19 days

    summary = summarise(rows, "stored").set_index("species")
    assert summary.d_timing["a"] == 1.0 - 18 / 19
    assert summary.paired["a"] == 1 and summary.n["all Fungi"] == 2


def test_on_day_anchors_the_gbm_without_touching_the_settings():
    gbm = {"anchor": "2026-10-16", "booster": object()}
    params = {"porcini": {"fruiting_gbm": gbm, "optimal_temp": 14}, "nettle": {"optimal_temp": 12}}
    day = np.datetime64("2026-09-01")
    dated = on_day(params, day)
    assert dated["porcini"]["fruiting_gbm"]["anchor"] == day
    assert dated["porcini"]["fruiting_gbm"]["booster"] is gbm["booster"]
    assert gbm["anchor"] == "2026-10-16"
    assert dated["nettle"] is params["nettle"]
