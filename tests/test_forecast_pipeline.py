import json
from pathlib import Path
import numpy as np
import pandas as pd
import pyarrow.parquet as pq
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


def test_contiguity_passes_on_gapless_forward_window():
    today = pd.Timestamp("2026-06-13")
    dates = pd.date_range(today, periods=7)  # today..today+6
    df = pd.DataFrame({"Location_Id": "A", "Date": dates})
    fp.assert_window_contiguous(df, today, forward_days=7)


def test_contiguity_raises_on_gap_in_forward_window():
    today = pd.Timestamp("2026-06-13")
    dates = [today, today + pd.Timedelta(days=1), today + pd.Timedelta(days=3)]  # missing +2
    df = pd.DataFrame({"Location_Id": "A", "Date": pd.to_datetime(dates)})
    with pytest.raises(AssertionError, match="A"):
        fp.assert_window_contiguous(df, today, forward_days=7)


def test_contiguity_allows_staggered_start_dates_across_timezones():
    # US regions can return a forecast that starts a calendar day behind a UTC/Europe
    # server; different coords may even start on different days. Each location's own
    # forward run is still consecutive, so this must NOT raise.
    today = pd.Timestamp("2026-06-13")
    a = pd.date_range("2026-06-13", periods=7)   # local "today" == anchor
    b = pd.date_range("2026-06-14", periods=7)   # this coord is one day ahead
    df = pd.DataFrame({
        "Location_Id": ["A"] * 7 + ["B"] * 7,
        "Date": a.append(b),
    })
    fp.assert_window_contiguous(df, today, forward_days=7)  # both runs consecutive -> ok


def test_contiguity_ignores_legacy_lookback_gaps():
    today = pd.Timestamp("2026-06-13")
    forward = pd.date_range(today, periods=7)
    legacy = pd.to_datetime(["2026-05-01", "2026-05-15"])  # gappy old history
    df = pd.DataFrame({"Location_Id": "A", "Date": forward.append(legacy)})
    fp.assert_window_contiguous(df, today, forward_days=7)  # must not raise


def test_forward_mask_selects_today_and_future_only():
    today = pd.Timestamp("2026-06-13")
    df = pd.DataFrame({
        "Location_Id": ["A"] * 4,
        "Date": pd.to_datetime(["2026-06-11", "2026-06-12", "2026-06-13", "2026-06-19"]),
    })
    mask = fp.forward_window_mask(df, today)
    assert mask.tolist() == [False, False, True, True]


def test_fetch_builds_forecast_request_and_counts_one_call(monkeypatch):
    captured = {}

    class _Resp:
        status_code = 200
        def json(self):
            return {"ok": True}

    def fake_get(url, params=None, timeout=None):
        captured["url"] = url
        captured["params"] = params
        return _Resp()

    monkeypatch.setattr(fp.requests, "get", fake_get)
    counter = fp.CallCounter()
    out = fp.fetch_weather_data(59.33, 18.07, api_key="K", counter=counter)
    assert out == {"ok": True}
    assert captured["url"] == fp.BASE_URL
    assert captured["params"]["days"] == fp.FORECAST_DAYS
    assert captured["params"]["aqi"] == "no"
    assert captured["params"]["alerts"] == "no"
    assert "dt" not in captured["params"]
    assert captured["params"]["q"] == "59.33,18.07"
    assert counter.count == 1


def test_prev_elevation_fill_uses_location_max():
    existing = pd.DataFrame({
        "Location_Id": ["A", "A", "B"],
        "Elevation (m)": [100.0, 150.0, 200.0],
    })
    new = pd.DataFrame({
        "Location_Id": ["A", "B", "C"],
        "Elevation (m)": [np.nan, np.nan, np.nan],
    })
    out = fp.replace_missing_elevation_from_previous_data(new.copy(), existing)
    assert out.loc[0, "Elevation (m)"] == 150.0   # A -> max(100,150)
    assert out.loc[1, "Elevation (m)"] == 200.0   # B
    assert pd.isna(out.loc[2, "Elevation (m)"])    # C absent -> stays NaN


def test_closest_elevation_fill_picks_nearest_known():
    df = pd.DataFrame({
        "Latitude":  [10.0, 50.0, 10.1],
        "Longitude": [10.0, 50.0, 10.0],
        "Elevation (m)": [100.0, 900.0, np.nan],
    })
    out = fp.replace_missing_elevation_with_closest(df.copy())
    assert out.loc[2, "Elevation (m)"] == 100.0   # nearest is row 0, not the far row 1


def test_apply_forward_scores_refreshes_future_preserves_past():
    combined = pd.DataFrame({
        "Location_Id": ["A", "A", "A"],
        "Date": pd.to_datetime(["2026-06-12", "2026-06-13", "2026-06-14"]),
        "x_score": [3.0, 99.0, pd.NA],   # past=3.0 (frozen), today=stale 99, future=NA
    })
    forward = pd.DataFrame({
        "Location_Id": ["A", "A"],
        "Date": pd.to_datetime(["2026-06-13", "2026-06-14"]),
        "x_score": [7.0, 8.0],            # fresh scores for today + future
    })
    out = fp.apply_forward_scores(combined, forward, ["x_score"]).sort_values("Date").reset_index(drop=True)
    assert out.loc[0, "x_score"] == 3.0   # frozen past untouched
    assert out.loc[1, "x_score"] == 7.0   # today refreshed
    assert out.loc[2, "x_score"] == 8.0   # future filled


def test_apply_forward_scores_rejects_duplicate_index():
    combined = pd.DataFrame({
        "Location_Id": ["A", "A"],
        "Date": pd.to_datetime(["2026-06-13", "2026-06-13"]),  # duplicate (loc,date)
        "x_score": [1.0, 2.0],
    })
    forward = combined.iloc[:1].copy()
    with pytest.raises(AssertionError, match="duplicate"):
        fp.apply_forward_scores(combined, forward, ["x_score"])


def test_streaming_parquet_replaces_tail_and_normalizes_schema(tmp_path):
    source = tmp_path / "source.parquet"
    output = tmp_path / "output.parquet"
    history = pd.DataFrame({
        "Location_Id": ["A"] * 5,
        "Date": pd.to_datetime([
            "2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01", "2026-04-02"
        ]),
        "value": [0.0, 1.0, 2.0, 3.0, 4.0],
        "retired_score": [9.0] * 5,
    })
    # Deliberately location/date ordered in one row group, like the legacy master.
    history.to_parquet(source, index=False, row_group_size=len(history))
    rebuilt_tail = pd.DataFrame({
        "Location_Id": ["A", "A"],
        "Date": pd.to_datetime(["2026-04-01", "2026-04-02"]),
        "value": [30.0, 40.0],
        "new_score": [7.0, 8.0],
    })

    fp._write_streaming_parquet(
        source,
        output,
        rebuilt_tail,
        split_date=pd.Timestamp("2026-04-01"),
        cutoff_date=pd.Timestamp("2026-01-15"),
    )

    got = pd.read_parquet(output).sort_values("Date").reset_index(drop=True)
    assert got["Date"].dt.strftime("%Y-%m-%d").tolist() == [
        "2026-02-01", "2026-03-01", "2026-04-01", "2026-04-02"
    ]
    assert got["value"].tolist() == [1.0, 2.0, 30.0, 40.0]
    assert "retired_score" not in got.columns
    assert got["new_score"].iloc[:2].isna().all()

    parquet = pq.ParquetFile(output)
    date_index = parquet.schema_arrow.get_field_index("Date")
    last_two = [
        parquet.metadata.row_group(i).column(date_index).statistics
        for i in range(parquet.num_row_groups - 2, parquet.num_row_groups)
    ]
    assert all(stats.min == stats.max for stats in last_two)


def test_recent_parquet_reader_returns_only_mutable_tail(tmp_path):
    source = tmp_path / "master.parquet"
    frame = pd.DataFrame({
        "Location_Id": ["A"] * 4,
        "Date": pd.to_datetime(["2026-03-30", "2026-03-31", "2026-04-01", "2026-04-02"]),
        "value": [1, 2, 3, 4],
    })
    frame.to_parquet(source, index=False, row_group_size=2)

    got = fp._read_recent_parquet(source, pd.Timestamp("2026-04-01"))

    assert pd.to_datetime(got["Date"]).dt.strftime("%Y-%m-%d").tolist() == [
        "2026-04-01", "2026-04-02"
    ]
