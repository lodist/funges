"""Hourly weather from free model files: sampling, hours, blending and the past."""
import os

import numpy as np
import pandas as pd

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
    source = Source(name="test", cycles=(0,), probe=None, files=None,
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
    assert [p.name for p in written] == ["2026-10.parquet"]
    past = pd.read_parquet(written[0])
    assert past["time"].tolist() == list(pd.date_range(first + H, third, freq="h"))
    assert past["t2m_c"].tolist() == [*range(24), *range(24)]  # each hour from its newest run


def test_a_missed_night_is_filled_from_the_older_run(tmp_path):
    _night(tmp_path, INIT, hours=72)
    _night(tmp_path, INIT + 48 * H)
    past = pd.read_parquet(hw.roll_past(tmp_path, INIT + 48 * H)[0])
    assert len(past) == 48


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
