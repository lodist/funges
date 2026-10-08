import json
from pathlib import Path
import numpy as np
import pandas as pd
import pyarrow.parquet as pq
import pytest

import forecast_pipeline as fp  # backend/ is on sys.path via conftest.py
import _phase2_fixture as fx

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
    assert len({r["Location_Id"] for r in rows}) == 1
    assert r0["climate_zone"] == "temperate"


def test_parse_derives_radiation_mean_wind_rain_hours_and_snow():
    rows = fp.parse_forecast_days(FIXTURE, _static(), 59.330, 18.070, NDP)
    fday = FIXTURE["forecast"]["forecastday"][3]
    hours = fday["hour"]
    row = [r for r in rows if r["Date"] == fday["date"]][0]
    assert row["Solar Radiation (Wh/m2)"] == pytest.approx(sum(h["short_rad"] for h in hours))
    assert row["Wind Speed Mean (kph)"] == pytest.approx(np.mean([h["wind_kph"] for h in hours]))
    assert row["Rain Hours"] == sum(h["precip_mm"] >= 0.1 for h in hours)
    assert row["Snowfall (cm)"] == fday["day"]["totalsnow_cm"]


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


MEASURED_DAY = fx.TODAY - pd.Timedelta(days=6)


def _measured_rows(rain=42.0):
    """ERA5 rain rows for every fixture base point on MEASURED_DAY, as _join_to_base emits
    them: rain and rain hours only, every other weather field empty."""
    rows = fx.forward_df()
    rows = rows[rows["Date"] == fx.TODAY][["Location_Id", "Latitude", "Longitude",
                                          "_coord_lat", "_coord_lon"]].copy()
    rows["Date"] = MEASURED_DAY
    rows["TotalPrecipitation_mm"] = rain
    rows["Rain Hours"] = 5
    rows["Rain Measured"] = True
    return rows


def _fetched_with_measured_day():
    return pd.concat([fx.forward_df(), _measured_rows()], ignore_index=True)


def _merge(history, df, tmp_path):
    path = tmp_path / "history.parquet"
    history.to_parquet(path, index=False)
    out = fp._merge_and_score(fx.config(), df, fx.species_params(), fx.zone_curves(),
                              main_data_path=str(path))
    out["Date"] = pd.to_datetime(out["Date"])
    return out


def test_measured_rain_replaces_the_forecast_rain_and_nothing_else(tmp_path):
    history = fx.history_df()
    frozen = history[pd.to_datetime(history["Date"]) == MEASURED_DAY].set_index("Location_Id")
    out = _merge(history, _fetched_with_measured_day(), tmp_path)

    day = out[out["Date"] == MEASURED_DAY].set_index("Location_Id")
    assert len(day) == 6
    assert (day["TotalPrecipitation_mm"] == 42.0).all()
    assert (day["Rain Hours"] == 5).all()
    assert day["Rain Measured"].eq(True).all()
    # Stored temperature and humidity already match measurements: they stay.
    assert np.allclose(day["Temperature (C)"], frozen.loc[day.index, "Temperature (C)"])
    assert np.allclose(day["Humidity (%)"], frozen.loc[day.index, "Humidity (%)"])
    assert (day[fx.score_columns()] == 1.23).all().all()  # a frozen day is not rescored


def test_forward_scores_read_the_measured_rain(tmp_path, monkeypatch):
    seen = {}
    score = fp.calculate_mushroom_score

    def spy(df, species_params, zone_curves):
        seen["lags"] = df.loc[pd.to_datetime(df["Date"]) == fx.TODAY, "TotalPrecipitation_mm_6days_ago"]
        return score(df, species_params, zone_curves)

    monkeypatch.setattr(fp, "calculate_mushroom_score", spy)
    out = _merge(fx.history_df(), _fetched_with_measured_day(), tmp_path)
    assert (seen["lags"] == 42.0).all()
    assert out.loc[out["Date"] >= fx.TODAY, fx.score_columns()].notna().all().all()


def test_measured_rain_fills_a_day_the_master_lacks(tmp_path):
    history = fx.history_df()
    history = history[pd.to_datetime(history["Date"]) != MEASURED_DAY]
    out = _merge(history, _fetched_with_measured_day(), tmp_path)

    day = out[out["Date"] == MEASURED_DAY]
    assert len(day) == 6
    assert (day["TotalPrecipitation_mm"] == 42.0).all()
    assert day[fx.score_columns()].isna().all().all()


def test_weather_text_is_not_stored(tmp_path):
    # Nothing reads it, and as one string per row it cost the full-file readers about
    # 1 GB of memory per region; the existing history loses it on the next write.
    assert all("Description" not in r for r in fp.parse_forecast_days(FIXTURE, _static(), 59.330, 18.070, NDP))
    history = fx.history_df()
    assert "Description" in history.columns
    out = _merge(history, _fetched_with_measured_day(), tmp_path)
    assert "Description" not in out.columns


def test_merge_writes_the_new_weather_columns(tmp_path):
    out = _merge(fx.history_df(), _fetched_with_measured_day(), tmp_path)
    for col in ("Solar Radiation (Wh/m2)", "Wind Speed Mean (kph)", "Rain Hours",
                "Snowfall (cm)", "Rain Measured"):
        assert col in out.columns


def test_bounded_parquet_update_applies_the_measured_rain(tmp_path):
    path = tmp_path / "history.parquet"
    fx.history_df().to_parquet(path, index=False)
    fp.update_parquet_master(fx.config(), _fetched_with_measured_day(), fx.species_params(),
                             fx.zone_curves(), str(path))

    out = pd.read_parquet(path)
    out["Date"] = pd.to_datetime(out["Date"])
    day = out[out["Date"] == MEASURED_DAY]
    assert (day["TotalPrecipitation_mm"] == 42.0).all()
    assert (day[fx.score_columns()] == 1.23).all().all()
    assert out.loc[out["Date"] >= fx.TODAY, fx.score_columns()].notna().all().all()


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

    # Frozen groups must stay prunable: Date max below split_date.
    parquet = pq.ParquetFile(output)
    date_index = parquet.schema_arrow.get_field_index("Date")
    split = pd.Timestamp("2026-04-01")
    frozen = [parquet.metadata.row_group(i).column(date_index).statistics
              for i in range(parquet.num_row_groups)]
    frozen = [st for st in frozen if pd.Timestamp(st.max) < split]
    assert frozen, "no prunable frozen row group was written"
    assert all(pd.Timestamp(st.max) < split for st in frozen)


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


def test_all_na_tail_column_does_not_null_out_history(tmp_path):
    """A tail-only schema infers `null` here and nulls out every historical value."""
    source = tmp_path / "source.parquet"
    output = tmp_path / "output.parquet"
    pd.DataFrame({
        "Location_Id": ["A"] * 4,
        "Date": pd.to_datetime(["2026-02-01", "2026-03-01", "2026-04-01", "2026-04-02"]),
        "keeps_values": [1.5, 2.5, 3.5, 4.5],
    }).to_parquet(source, index=False)

    tail = pd.DataFrame({
        "Location_Id": ["A", "A"],
        "Date": pd.to_datetime(["2026-04-01", "2026-04-02"]),
        "keeps_values": [pd.NA, pd.NA],
    })

    fp._write_streaming_parquet(
        source, output, tail,
        split_date=pd.Timestamp("2026-04-01"),
        cutoff_date=pd.Timestamp("2026-01-01"),
    )

    got = pd.read_parquet(output).sort_values("Date").reset_index(drop=True)
    frozen = got[got["Date"] < pd.Timestamp("2026-04-01")]
    assert frozen["keeps_values"].tolist() == [1.5, 2.5], "history was nulled by the tail schema"


def test_frozen_history_is_written_in_coalesced_row_groups(tmp_path):
    """One group per decoded batch cost ~30% file size on the real master."""
    source = tmp_path / "source.parquet"
    output = tmp_path / "output.parquet"
    dates = pd.date_range("2026-01-01", periods=40)
    pd.DataFrame({
        "Location_Id": ["A"] * len(dates),
        "Date": dates,
        "value": range(len(dates)),
    }).to_parquet(source, index=False, row_group_size=2)  # 20 tiny source groups

    tail = pd.DataFrame({
        "Location_Id": ["A"], "Date": [dates[-1]], "value": [99],
    })
    fp._write_streaming_parquet(
        source, output, tail, split_date=dates[-1], cutoff_date=pd.Timestamp("2025-01-01"),
    )

    parquet = pq.ParquetFile(output)
    # 39 frozen rows coalesce into one group, plus one for the tail.
    assert parquet.num_row_groups == 2, f"got {parquet.num_row_groups} row groups"
    assert parquet.metadata.row_group(0).num_rows == 39


def test_narrower_tail_dtype_does_not_truncate_history(tmp_path):
    """The silent case: an integral tail infers int64 and truncates float history."""
    source = tmp_path / "source.parquet"
    output = tmp_path / "output.parquet"
    pd.DataFrame({
        "Location_Id": ["A"] * 4,
        "Date": pd.to_datetime(["2026-02-01", "2026-03-01", "2026-04-01", "2026-04-02"]),
        "score": [1.7, 2.9, 3.5, 4.5],
    }).to_parquet(source, index=False)

    tail = pd.DataFrame({
        "Location_Id": ["A", "A"],
        "Date": pd.to_datetime(["2026-04-01", "2026-04-02"]),
        "score": [3, 4],
    })

    fp._write_streaming_parquet(
        source, output, tail,
        split_date=pd.Timestamp("2026-04-01"),
        cutoff_date=pd.Timestamp("2026-01-01"),
    )

    got = pd.read_parquet(output).sort_values("Date").reset_index(drop=True)
    frozen = got[got["Date"] < pd.Timestamp("2026-04-01")]["score"].tolist()
    assert frozen == [1.7, 2.9], f"history truncated to {frozen}"
