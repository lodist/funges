"""Tests for the Phase 0 (cached base->coord key join) and Phase 1 (lag-window
slice) forecast-pipeline optimizations. Both must be BIT-IDENTICAL to the prior
behaviour for the rows that actually get rescored — these tests pin that down with
no network access.
"""

import numpy as np
import pandas as pd

from funges_backend import forecast_pipeline as fp


def _cfg(ndp=3, lag_days=21):
    return fp.RegionConfig(
        boundaries_env="B", coordinates_env="C", base_env="BASE",
        species_params_env="S", weather_data_env="W", static_info_env="ST",
        season_curves_env="SC", zone_curves_env="ZC",
        lat_range=(0, 0), lon_range=(0, 0), ndp=ndp, lag_days=lag_days,
    )


# Three fetched coords with distinct, identifiable precip per (coord, date).
COORDS = {0: (60.000, 10.000), 1: (60.000, 10.500), 2: (61.000, 10.000)}
DATES = ["2026-06-13", "2026-06-14"]


def _weather_long(include=(0, 1, 2)):
    rows = []
    for cid in include:
        lat, lon = COORDS[cid]
        for di, d in enumerate(DATES):
            rows.append({
                "Latitude": lat, "Longitude": lon, "Date": d,
                "Temperature (C) Max": 10.0, "Temperature (C) Min": 2.0,
                "Temperature (C)": 6.0, "Wind Speed (kph)": 9.0,
                "Pressure (hPa)": 1010.0,
                "TotalPrecipitation_mm": cid * 100.0 + di,   # unique signature
                "Humidity (%)": 80.0, "Description": "x",
                "dist_m_water": 1.0, "dist_m_sea": 2.0, "climate_zone": "z",
                "ph_level": 6.0, "Elevation (m)": 100.0,
            })
    return pd.DataFrame(rows)


def _write_base(tmp_path, rows):
    p = tmp_path / "base.csv"
    pd.DataFrame(rows).to_csv(p, index=False)
    return str(p)


# Base points placed nearest to C0 / C1 / C2 respectively.
BASE_PTS = [
    ("B0", 60.010, 10.010, 0),
    ("B1", 60.000, 10.490, 1),
    ("B2", 60.990, 10.000, 2),
]


def _precip_by_loc(out):
    o = out[out["Date"] == DATES[0]]
    return dict(zip(o["Location_Id"], o["TotalPrecipitation_mm"]))


def test_join_without_cache_maps_to_nearest_coord(tmp_path):
    base = _write_base(tmp_path, [
        {"Location_Id": lid, "Latitude": la, "Longitude": lo, "Elevation (m)": np.nan}
        for lid, la, lo, _ in BASE_PTS
    ])
    out = fp._join_to_base(_cfg(), _weather_long(), base)
    got = _precip_by_loc(out)
    assert got == {"B0": 0.0, "B1": 100.0, "B2": 200.0}  # nearest-coord signature, date 0


def test_cached_key_matches_kdtree_result(tmp_path):
    """A base carrying coord_lat/coord_lon = its exact nearest coord must yield the
    SAME join as the KDTree path (proves the fast path is equivalent)."""
    base = _write_base(tmp_path, [
        {"Location_Id": lid, "Latitude": la, "Longitude": lo, "Elevation (m)": np.nan,
         "coord_lat": COORDS[cid][0], "coord_lon": COORDS[cid][1]}
        for lid, la, lo, cid in BASE_PTS
    ])
    out = fp._join_to_base(_cfg(), _weather_long(), base)
    assert _precip_by_loc(out) == {"B0": 0.0, "B1": 100.0, "B2": 200.0}


def test_cached_key_is_authoritative_over_geometric_nearest(tmp_path):
    """The baked key is the source of truth: when present in this run, the join must
    follow it even if a different coord is geometrically closer. This fails on the
    pure-KDTree implementation and passes only once the cache is actually consulted."""
    # B0 is geometrically nearest C0 (=>0.0) but cached to C1 (present, =>100.0).
    base = _write_base(tmp_path, [
        {"Location_Id": "B0", "Latitude": 60.010, "Longitude": 10.010,
         "Elevation (m)": np.nan, "coord_lat": COORDS[1][0], "coord_lon": COORDS[1][1]},
    ])
    out = fp._join_to_base(_cfg(), _weather_long(), base)
    assert _precip_by_loc(out)["B0"] == 100.0  # follows the cache, not KDTree's C0


def test_cached_key_falls_back_when_assigned_coord_absent(tmp_path):
    """If a base's cached coord didn't fetch this run, it must fall back to the nearest
    PRESENT coord (no NaN weather), matching the old reroute-to-nearest behaviour."""
    # B0 cached to C2, but C2 is missing from weather_long this run.
    base = _write_base(tmp_path, [
        {"Location_Id": "B0", "Latitude": 60.010, "Longitude": 10.010,
         "Elevation (m)": np.nan, "coord_lat": COORDS[2][0], "coord_lon": COORDS[2][1]},
    ])
    out = fp._join_to_base(_cfg(), _weather_long(include=(0, 1)), base)
    got = _precip_by_loc(out)
    assert not pd.isna(got["B0"])
    assert got["B0"] == 0.0  # nearest present coord is C0


def test_join_emits_coord_key_matching_attached_weather(tmp_path):
    """_join_to_base must output _coord_lat/_coord_lon equal to the coord whose weather
    each base row received (so the downstream lag dedup groups correctly)."""
    base = _write_base(tmp_path, [
        {"Location_Id": lid, "Latitude": la, "Longitude": lo, "Elevation (m)": np.nan}
        for lid, la, lo, _ in BASE_PTS
    ])
    out = fp._join_to_base(_cfg(), _weather_long(), base)
    sig_to_coord = {cid * 100.0 + 0: COORDS[cid] for cid in COORDS}  # date-0 precip signature
    o = out[out["Date"] == DATES[0]]
    for _, r in o.iterrows():
        exp_lat, exp_lon = sig_to_coord[r["TotalPrecipitation_mm"]]
        assert (round(r["_coord_lat"], 3), round(r["_coord_lon"], 3)) == (exp_lat, exp_lon)


def test_join_coord_key_follows_reroute_when_baked_coord_absent(tmp_path):
    """When the baked coord didn't fetch, the row reroutes to the nearest present coord;
    the emitted _coord_lat/_coord_lon must reflect that present coord, not the stale bake."""
    base = _write_base(tmp_path, [
        {"Location_Id": "B0", "Latitude": 60.010, "Longitude": 10.010,
         "Elevation (m)": np.nan, "coord_lat": COORDS[2][0], "coord_lon": COORDS[2][1]},
    ])
    out = fp._join_to_base(_cfg(), _weather_long(include=(0, 1)), base)  # C2 absent
    r = out.iloc[0]
    assert (round(r["_coord_lat"], 3), round(r["_coord_lon"], 3)) == COORDS[0]  # rerouted to C0


def test_lag_slice_is_identical_for_forward_rows():
    """compute_lag_features on [today - lag_days ..] must give the same lag columns for
    forward rows (Date >= today) as computing on the full history."""
    today = pd.Timestamp("2026-06-13")
    dates = pd.date_range(today - pd.Timedelta(days=40), today + pd.Timedelta(days=6))
    rng = np.random.default_rng(7)
    df = pd.DataFrame({
        "Location_Id": "A",
        "Date": dates,
        "Temperature (C)": rng.normal(8, 3, len(dates)),
        "TotalPrecipitation_mm": rng.gamma(1.0, 2.0, len(dates)),
        "Pressure (hPa)": rng.normal(1010, 5, len(dates)),
        "Humidity (%)": rng.uniform(60, 95, len(dates)),
    })
    cols = ["Temperature (C)", "TotalPrecipitation_mm", "Pressure (hPa)", "Humidity (%)"]
    lag_days = 21

    full = fp.compute_lag_features(df.copy(), cols, days=lag_days)
    lag_start = today - pd.Timedelta(days=lag_days)
    sliced = fp.compute_lag_features(df[df["Date"] >= lag_start].copy(), cols, days=lag_days)

    lag_cols = [f"{c}_{d}days_ago" for c in cols for d in range(1, lag_days + 1)]
    fwd_full = full[full["Date"] >= today].sort_values("Date")[lag_cols].reset_index(drop=True)
    fwd_sliced = sliced[sliced["Date"] >= today].sort_values("Date")[lag_cols].reset_index(drop=True)
    pd.testing.assert_frame_equal(fwd_full, fwd_sliced)
