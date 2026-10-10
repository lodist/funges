"""ERA5 rain for past days: local-day totals at each fetched coord."""
from datetime import date

import netCDF4
import numpy as np
import pandas as pd

import era5_rain as er

DAY = date(2026, 10, 1)


def _hours(first="2026-09-30 01:00", periods=72):
    """Hourly valid times; each value is the rain of the hour ending then (UTC)."""
    return pd.date_range(first, periods=periods, freq="h")


def _one_cell(times, rain_at):
    hourly = np.zeros((len(times), 1, 1))
    for when, mm in rain_at.items():
        hourly[times.get_loc(pd.Timestamp(when)), 0, 0] = mm
    return hourly


def _rain(hourly, times, coords, lats=(50.0,), lons=(0.0,), days=(DAY,)):
    return er.local_day_rain(hourly, times, np.array(lats), np.array(lons), coords, list(days))


def test_rain_is_summed_over_the_local_day():
    times = _hours()
    hourly = _one_cell(times, {"2026-10-01 00:00": 5.0, **{
        f"2026-10-01 {h:02d}:00": 1.0 for h in range(1, 24)}, "2026-10-02 00:00": 1.0})
    # At 0° the local day is the UTC day: the hour ending 1 Oct 00:00 belongs to 30 Sep.
    row = _rain(hourly, times, [(50.0, 0.0)]).iloc[0]
    assert row["Date"] == "2026-10-01"
    assert row["TotalPrecipitation_mm"] == 24.0


def test_local_day_follows_longitude():
    times = _hours()
    hourly = _one_cell(times, {"2026-10-01 03:00": 7.0, "2026-10-02 05:00": 2.0})
    # At 105° W a local day runs 07:00-07:00 UTC: 03:00 on 1 Oct is still 30 Sep there.
    row = _rain(hourly, times, [(40.0, -105.0)], lats=(40.0,), lons=(-105.0,)).iloc[0]
    assert row["TotalPrecipitation_mm"] == 2.0


def test_rain_hours_count_hours_with_at_least_a_tenth_of_a_millimetre():
    times = _hours()
    hourly = _one_cell(times, {"2026-10-01 02:00": 0.05, "2026-10-01 03:00": 0.1,
                               "2026-10-01 04:00": 2.0})
    assert _rain(hourly, times, [(50.0, 0.0)]).iloc[0]["Rain Hours"] == 2


def test_a_day_without_all_its_hours_is_left_out():
    times = _hours(periods=40)  # ends 1 Oct 16:00, before the day is complete
    hourly = _one_cell(times, {"2026-10-01 02:00": 3.0})
    assert _rain(hourly, times, [(50.0, 0.0)]).empty


def test_a_day_with_a_blank_hour_is_left_out():
    times = _hours()
    hourly = _one_cell(times, {"2026-10-01 02:00": 3.0})
    hourly[times.get_loc(pd.Timestamp("2026-10-01 05:00")), 0, 0] = np.nan
    assert _rain(hourly, times, [(50.0, 0.0)]).empty


def test_each_coord_reads_its_nearest_cell():
    times = _hours()
    hourly = np.zeros((len(times), 1, 2))
    hourly[times.get_loc(pd.Timestamp("2026-10-01 12:00")), 0, 1] = 4.0
    rows = _rain(hourly, times, [(50.0, 0.1), (50.0, 0.4)], lons=(0.0, 0.5))
    assert rows["TotalPrecipitation_mm"].tolist() == [0.0, 4.0]
    assert rows["Rain Measured"].all()


def test_requests_split_at_month_ends():
    # A year/month/day request is a cross product: one month per request, or it asks for
    # dates that do not exist yet.
    days = pd.date_range("2026-09-28", "2026-10-02").date
    requests = er.cds_requests(days, (49.0, 71.5), (-25.0, 32.0))
    assert [(r["month"], r["day"]) for r in requests] == [
        (["09"], ["28", "29", "30"]), (["10"], ["01", "02"])]
    assert requests[0]["area"] == [71.5, -25.0, 49.0, 32.0]
    assert requests[0]["variable"] == ["total_precipitation"]


def _netcdf(path, hours, metres):
    with netCDF4.Dataset(path, "w") as nc:
        nc.createDimension("valid_time", len(hours))
        nc.createDimension("latitude", 1)
        nc.createDimension("longitude", 1)
        time = nc.createVariable("valid_time", "i8", ("valid_time",))
        time.units = "seconds since 1970-01-01"
        time[:] = [pd.Timestamp(hour).timestamp() for hour in hours]
        nc.createVariable("latitude", "f4", ("latitude",))[:] = [50.0]
        nc.createVariable("longitude", "f4", ("longitude",))[:] = [0.0]
        nc.createVariable("tp", "f4", ("valid_time", "latitude", "longitude"))[:] = [
            [[m]] for m in metres]
    return path


def test_cds_netcdf_is_read_in_millimetres(tmp_path):
    path = _netcdf(tmp_path / "tp.nc", ["2026-10-01 01:00", "2026-10-01 02:00"], [0.002, -1e-7])
    hourly, times, lats, lons = er.read_hourly([path])
    assert np.allclose(hourly[:, 0, 0], [2.0, 0.0])  # metres to mm, packing noise clipped
    assert list(times) == [pd.Timestamp("2026-10-01 01:00"), pd.Timestamp("2026-10-01 02:00")]


def test_orders_from_two_nights_count_each_hour_once(tmp_path):
    # Two nights' orders share 1 Oct; counted twice, the day would have 48 hours and drop.
    hours = _hours("2026-09-30 01:00", 48)
    older = _netcdf(tmp_path / "a.nc", hours[:36], [0.001] * 36)
    newer = _netcdf(tmp_path / "b.nc", hours[12:], [0.001] * 36)
    hourly, times, lats, lons = er.read_hourly([older, newer])
    assert list(times) == list(hours)
    row = er.local_day_rain(hourly, times, lats, lons, [(50.0, 0.0)], [DAY]).iloc[0]
    assert row["TotalPrecipitation_mm"] == 24.0


def test_without_a_key_rain_is_skipped(monkeypatch):
    monkeypatch.delenv("CDSAPI_KEY", raising=False)
    rows = er.start((49.0, 71.5), (-25.0, 32.0), [(60.0, 10.0)], date(2026, 10, 8))
    assert rows().empty
