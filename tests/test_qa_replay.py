import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from qa_replay import evaluate, fill_gaps, on_day, percentiles, summarise, with_composites  # noqa: E402


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


def test_a_step_in_the_stored_scores_is_not_timing():
    days = pd.date_range("2026-09-01", periods=40)
    finds = pd.DataFrame({"species_id": ["a", "b"], "date": [str(days[10].date())] * 2,
                          "loc": ["p0", "p1"], "kingdom": ["Fungi", "Fungi"]})
    today = pd.DataFrame({"Location_Id": np.repeat(["p0", "p1"], 40), "Date": np.tile(days, 2),
                          "a_score": 3.0, "b_score": 3.0})
    stored = today.copy()
    stored.loc[stored.Date >= days[20], ["a_score", "b_score"]] -= 1.0    # the code changed on day 20
    rows = evaluate("NE", finds, {"today": today, "stored": stored}, days).set_index(["species", "source"])
    assert rows.timing[("a", "stored")] == rows.timing[("a", "today@stored")] == 0.5


def test_fill_gaps_interpolates_short_holes_and_leaves_long_ones():
    days = pd.date_range("2026-05-01", periods=9)
    present = [0, 1, 3, 4, 8]
    inputs = pd.DataFrame({"Location_Id": "p", "Date": days[present], "Latitude": 50.0, "Longitude": 10.0,
                           "TotalPrecipitation_mm": [d * 10.0 for d in present], "climate_zone": "Cfb"})
    out = fill_gaps(inputs).set_index("Date")
    assert out.loc[days[2], "TotalPrecipitation_mm"] == 20.0
    assert out.loc[days[2], "climate_zone"] == "Cfb"
    assert days[5] not in out.index and len(out) == 6


def test_on_day_anchors_the_gbm_without_touching_the_settings():
    gbm = {"anchor": "2026-10-16", "booster": object()}
    params = {"porcini": {"fruiting_gbm": gbm, "optimal_temp": 14}, "nettle": {"optimal_temp": 12}}
    day = np.datetime64("2026-09-01")
    dated = on_day(params, day)
    assert dated["porcini"]["fruiting_gbm"]["anchor"] == day
    assert dated["porcini"]["fruiting_gbm"]["booster"] is gbm["booster"]
    assert gbm["anchor"] == "2026-10-16"
    assert dated["nettle"] is params["nettle"]


def test_where_absent_leaves_out_spots_where_the_species_was_found_too():
    days = pd.date_range("2026-10-01", periods=10)
    # porcini found at p0; a chanterelle at p1 right next to it and one at p2 far away
    finds = pd.DataFrame({"species_id": ["porcini", "chant", "chant"], "date": ["2026-10-05"] * 3,
                          "loc": ["p0", "p1", "p2"], "kingdom": ["Fungi"] * 3,
                          "lat": [46.0, 46.01, 47.0], "lon": [9.0, 9.0, 9.0]})
    today = pd.DataFrame({"Location_Id": np.repeat(["p0", "p1", "p2"], 10), "Date": np.tile(days, 3)})
    today["porcini_score"] = np.repeat([5.0, 8.0, 2.0], 10)   # p1, beside the find, scores higher
    today["chant_score"] = 1.0
    stored = today.iloc[:0]
    rows = evaluate("NE", finds, {"today": today, "stored": stored}, days)
    find = rows[(rows.species == "porcini") & (rows.source == "today")].iloc[0]
    assert find["where"] == 0.5          # beats p2, loses to p1
    assert find["where_absent"] == 1.0   # p1 had porcini nearby: only p2 counts


def test_a_composite_is_judged_against_other_species_and_never_against_its_members():
    days = pd.date_range("2026-10-01", periods=10)
    # porcini at p0, a pine bolete at p1, a parasol (in no composite) at p2
    finds = pd.DataFrame({"species_id": ["mushroom", "pine_bolete", "parasol"], "date": ["2026-10-05"] * 3,
                          "loc": ["p0", "p1", "p2"], "kingdom": ["Fungi"] * 3, "region": ["NE"] * 3})
    finds = with_composites(finds)
    assert sorted(finds[finds.composite].loc[:, "loc"]) == ["p0", "p1"]
    today = pd.DataFrame({"Location_Id": np.repeat(["p0", "p1", "p2"], 10), "Date": np.tile(days, 3)})
    for species in ("mushroom", "pine_bolete", "bronze_bolete", "summer_bolete", "parasol"):
        today[f"{species}_score"] = 1.0
    today["mushroom_score"] = np.repeat([6.0, 2.0, 2.0], 10)
    today["boletus_score"] = np.repeat([6.0, 7.0, 3.0], 10)
    rows = evaluate("NE", finds, {"today": today, "stored": today.iloc[:0]}, days)
    rows = rows[rows.source == "today"]
    # porcini against the pine bolete and the parasol spots, not against its own composite rows
    assert rows[rows.species == "mushroom"]["where"].iloc[0] == 1.0
    # the composite only against the parasol spot: both its finds beat it
    assert list(rows[rows.species == "boletus"]["where"]) == [1.0, 1.0]
    assert rows[rows.species == "boletus"].composite.all() and not rows[rows.species == "mushroom"].composite.any()
