"""Hourly weather from free model files: sampling, hours, blending and the past."""
import base64
import os
import time

import numpy as np
import pandas as pd
import pytest
import requests

import hourly_weather as hw
from hourly_sources import Source

INIT = pd.Timestamp("2026-10-15 18:00", tz="UTC")
H = pd.Timedelta(hours=1)


def _at(*leads):
    return pd.DatetimeIndex([INIT + lead * H for lead in leads])


def _hours(first, last):
    return pd.date_range(INIT + first * H, INIT + last * H, freq="h")


def test_nearest_cells_find_the_closest_cell_and_drop_points_off_the_grid():
    lat, lon = np.meshgrid(np.arange(40.0, 51.0), np.arange(0.0, 11.0), indexing="ij")
    cells = hw.nearest_cells(lat.ravel(), lon.ravel(), np.array([45.2, 60.0]), np.array([5.4, 5.0]))
    assert (lat.ravel()[cells[0]], lon.ravel()[cells[0]]) == (45.0, 5.0)
    assert cells[1] == -1


def test_states_are_linear_between_steps_and_missing_beyond_them():
    out = hw.to_hours("state", _at(0, 3, 6), np.array([[0.0], [3.0], [6.0]]), _hours(1, 8), INIT)
    np.testing.assert_allclose(out[:, 0], [1, 2, 3, 4, 5, 6, np.nan, np.nan])


def test_amounts_since_the_run_start_become_hourly_amounts():
    # 1 mm in the first hour, 2 in the second, then 6 over three hours: 2 an hour.
    values = np.array([[0.0], [1.0], [3.0], [9.0]])
    out = hw.to_hours("accum", _at(0, 1, 2, 5), values, _hours(1, 6), INIT)
    np.testing.assert_allclose(out[:, 0], [1, 2, 2, 2, 2, np.nan])


def test_means_since_the_run_start_become_hourly_means():
    values = np.array([[0.0], [100.0], [150.0]])  # W/m², the mean since the run started
    out = hw.to_hours("mean", _at(0, 1, 2), values, _hours(1, 2), INIT)
    np.testing.assert_allclose(out[:, 0], [100, 200])


def test_hourly_amounts_stay_in_their_hour():
    out = hw.to_hours("hourly", _at(1, 2), np.array([[0.5], [0.0]]), _hours(1, 3), INIT)
    np.testing.assert_allclose(out[:, 0], [0.5, 0.0, np.nan])


def test_blend_takes_each_value_from_the_first_source_that_has_it():
    values, src = hw.blend([np.array([[np.nan, 1.0]]), np.array([[2.0, 3.0]])])
    np.testing.assert_allclose(values, [[2.0, 1.0]])
    assert src.tolist() == [[1, 0]]


def test_source_vars_combine_fields_into_one_variable():
    source = Source(name="test", cycles=(0,), ready=None, files=None,
                    vars={"wind10_kmh": ("state", ("u", "v"), lambda u, v: np.hypot(u, v) * 3.6)})
    fields = {"u": {INIT: np.array([3.0]), INIT + 2 * H: np.array([3.0])},
              "v": {INIT: np.array([4.0]), INIT + 2 * H: np.array([4.0])}}
    out = hw.source_vars(source, fields, _hours(1, 2), INIT)
    np.testing.assert_allclose(out["wind10_kmh"][:, 0], [18.0, 18.0])


def test_frame_has_a_row_per_hour_and_point_and_names_its_source():
    hours = _hours(1, 2)
    fine = {var: np.array([[np.nan, 1.0], [np.nan, 1.0]]) for var in hw.VARS}
    coarse = {var: np.full((2, 2), 2.0) for var in hw.VARS}
    frame = hw.to_frame(hours, np.array([45.0, 46.0]), np.array([7.0, 8.0]), [fine, coarse], ["fine", "coarse"])
    assert frame["time"].tolist() == [hours[0], hours[0], hours[1], hours[1]]
    assert frame["lat"].tolist() == [45.0, 46.0, 45.0, 46.0]
    assert frame["t2m_c"].tolist() == [2.0, 1.0, 2.0, 1.0]
    assert frame["source"].tolist() == ["coarse", "fine", "coarse", "fine"]


def _night(region_dir, init, hours=48):
    """A night's file whose temperature is its lead minus one, so nights tell apart."""
    times = pd.date_range(init + H, periods=hours, freq="h")
    frame = pd.DataFrame({"time": times, "lat": 45.0, "lon": 7.0, "t2m_c": np.arange(hours, dtype=np.float32)})
    return hw.write_night(region_dir, frame, init)


def test_passed_hours_move_into_the_past_once(tmp_path):
    first, second, third = INIT, INIT + 24 * H, INIT + 48 * H
    _night(tmp_path, first)
    assert hw.roll_past(tmp_path, first) == []          # nothing earlier yet
    _night(tmp_path, second)
    hw.roll_past(tmp_path, second)
    _night(tmp_path, third)
    written = hw.roll_past(tmp_path, third)
    assert [p.name for p in written] == ["2026-10-16.parquet", "2026-10-17.parquet"]
    past = _past(tmp_path)
    assert past["time"].tolist() == list(pd.date_range(first + H, third, freq="h"))
    assert past["t2m_c"].tolist() == [*range(24), *range(24)]  # each hour from its newest run
    # An hour belongs to the day it starts in, as era5_rain's local days: 23-24h is the 16th's.
    sizes = {p.name: len(pd.read_parquet(p)) for p in (tmp_path / "past").glob("*.parquet")}
    assert sizes == {"2026-10-15.parquet": 6, "2026-10-16.parquet": 24, "2026-10-17.parquet": 18}


def _past(region_dir):
    return pd.concat(pd.read_parquet(p) for p in sorted((region_dir / "past").glob("*.parquet")))


def test_a_missed_night_is_filled_from_the_older_run(tmp_path):
    _night(tmp_path, INIT, hours=72)
    _night(tmp_path, INIT + 48 * H)
    hw.roll_past(tmp_path, INIT + 48 * H)
    assert len(_past(tmp_path)) == 48


def test_prune_deletes_old_files_and_empty_folders(tmp_path):
    old = tmp_path / "a" / "old.grib2"
    old.parent.mkdir()
    old.write_bytes(b"x")
    os.utime(old, (0, 0))
    new = tmp_path / "b" / "new.grib2"
    new.parent.mkdir()
    new.write_bytes(b"x")
    hw.prune(tmp_path, days=2)
    assert not (tmp_path / "a").exists() and new.exists()


def test_newest_run_is_the_newest_complete_one():
    ok = {"1512"}
    source = Source(name="test", cycles=(0, 12), ready=lambda session, init: f"{init:%d%H}" in ok,
                    files=None, vars={})
    now = pd.Timestamp("2026-10-16 05:00", tz="UTC")
    assert hw.newest_run(source, None, now) == pd.Timestamp("2026-10-15 12:00", tz="UTC")
    ok.add("1600")
    assert hw.newest_run(source, None, now) == pd.Timestamp("2026-10-16 00:00", tz="UTC")
    ok.clear()
    assert hw.newest_run(source, None, now) is None


def test_steps_further_apart_than_six_hours_are_not_bridged():
    # A stretch of lost files: those hours fall to the next model, not to a straight line
    # or a shower spread over a day and a half.
    out = hw.to_hours("state", _at(0, 3, 12), np.array([[0.0], [3.0], [12.0]]), _hours(1, 12), INIT)
    assert not np.isnan(out[:3, 0]).any() and np.isnan(out[3:11, 0]).all()
    rain = hw.to_hours("accum", _at(0, 1, 9), np.array([[0.0], [1.0], [9.0]]), _hours(1, 9), INIT)
    assert rain[0, 0] == 1 and np.isnan(rain[1:, 0]).all()


def test_files_no_server_would_list_count_as_failed(tmp_path, monkeypatch):
    monkeypatch.setattr(hw, "OUT_DIR", tmp_path)
    source = Source(name="test", cycles=(18,), ready=None, vars={},
                    files=lambda session, init, last: [("t", None, None)] * 20)
    with pytest.raises(RuntimeError, match="20 of 20"):
        hw.read_source(source, INIT, 24, np.array([45.0]), np.array([7.0]), None, time.time() + 60)


def test_a_model_past_the_deadline_is_given_up(tmp_path, monkeypatch):
    monkeypatch.setattr(hw, "OUT_DIR", tmp_path)
    monkeypatch.setattr(hw, "download", lambda *args: time.sleep(3))
    source = Source(name="slow", cycles=(18,), ready=None, vars={},
                    files=lambda session, init, last: [("t", "https://slow.example", None)])
    started = time.time()
    with pytest.raises(TimeoutError):
        hw.read_source(source, INIT, 24, np.array([45.0]), np.array([7.0]), None, time.time() + 0.5)
    assert time.time() - started < 2  # gave up at the deadline, without waiting for the download


GOOD = Source(name="good", cycles=(18,), ready=lambda session, init: init == INIT, files=None,
              vars={"t2m_c": ("state", ("t",), lambda t: t)})


def _run(tmp_path, monkeypatch, sources, read):
    monkeypatch.setattr(hw, "SOURCES", {"EU": sources})
    monkeypatch.setattr(hw, "read_source", read)
    monkeypatch.setattr(hw, "upload", lambda region_dir: None)
    monkeypatch.setattr(hw, "OUT_DIR", tmp_path)
    hw.run("SE", [(45.0, 7.0)], now=INIT + 5 * H)


def _temperature(value):
    return lambda source, *args: {"t": {INIT + k * H: np.full(1, value) for k in range(175)}}


def test_one_model_failing_does_not_cost_the_others(tmp_path, monkeypatch):
    def unreachable(session, init):
        raise requests.ConnectionError("server down")

    def read(source, *args):
        if source.name == "broken":
            raise RuntimeError("mirror throttled")
        return _temperature(10.0)(source)

    sources = (Source(name="unreachable", cycles=(18,), ready=unreachable, files=None, vars={}),
               Source(name="broken", cycles=(18,), ready=lambda session, init: True, files=None, vars={}),
               GOOD)
    _run(tmp_path, monkeypatch, sources, read)
    frame = pd.read_parquet(tmp_path / "SE" / "forecast" / "2026101518.parquet")
    assert len(frame) == hw.HOURS and (frame["t2m_c"] == 10.0).all()
    assert set(frame["source"]) == {"good 2026-10-15 18z"}


def test_a_night_without_temperature_is_not_written(tmp_path, monkeypatch):
    with pytest.raises(RuntimeError, match="no temperature"):
        _run(tmp_path, monkeypatch, (GOOD,), _temperature(np.nan))
    assert not (tmp_path / "SE" / "forecast").exists()


# A 4x2 Lambert message cut from a real NBM one: rows alternate direction (scanning mode
# 0x50), so its values, in file order, are 1 2 3 4 | 8 7 6 5 west to east 1..8.
ALTERNATING_ROWS = base64.b64decode(
    "R1JJQgAAAAIAAAAAAAAAxAAAABUBAAcADgEBAQfqCg4MAAAAAQAAAFEDAAAAAAgAAAAeAQAAYTeA/wAAAP//AAAA/wAAAAQA"
    "AAACASVpSA3uVggwAX14QA/LlEAAJsC3ACbAtwBQAX14QAF9eECFXUqAAAAAAAAAACIEAAAAAAAAAv9o////AQAAAAhnAAAA"
    "AAL/AAAAAAAAAAAVBQAAAAgAAEEgAAAAAAABBwAAAAAHBgD/AAAADAcAKKHozxkoNzc3Nw==")


def test_decode_puts_rows_that_alternate_direction_back_west_to_east():
    valid, values, (lats, lons) = hw.decode(ALTERNATING_ROWS, with_grid=True)
    assert values.tolist() == [1, 2, 3, 4, 5, 6, 7, 8]
    assert (np.diff(lons.reshape(2, 4), axis=1) > 0).all()  # ecCodes lists every row west to east
    assert valid == pd.Timestamp("2026-10-14 20:00", tz="UTC")
