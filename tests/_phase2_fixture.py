"""Hermetic, deterministic inputs for the Phase 2 (coord-resolution lag) golden master.

Models the real pipeline invariant that matters for the refactor: every base point
that shares a fetched coord receives byte-identical weather AND static fields (they are
looked up per coord in _fetch_all). So here, rows are generated per (coord, date) and
replicated to that coord's base points; only Location_Id / base lat-lon differ.

Branches exercised by the two synthetic species:
  - sp_water: water_relevance + sea_relevance, wind_sensitive, climate_zones filter,
              season_months ramp, rain_first weather preference.
  - sp_curve: empirical season_curve path, no water relevance, not wind sensitive.
Plus: some coords carry NaN pH (exercises the mixed isna() score branch) and a zone
curve override for one climate zone.
"""
import numpy as np
import pandas as pd

import forecast_pipeline as fp

TODAY = pd.Timestamp("2026-06-13")
LAG_DAYS = 21
HIST_DAYS = 25          # history behind today (so 21-day lags are fully populated)
FWD_DAYS = fp.FORECAST_DAYS

# 3 fetched coords; 2 base points each -> dedup must collapse 6 base rows to 3 coords.
COORDS = [(60.000, 10.000), (60.000, 10.500), (61.000, 10.000)]
BASE_PER_COORD = [
    [("B0", 60.010, 10.010), ("B1", 59.990, 9.990)],
    [("B2", 60.010, 10.490), ("B3", 59.990, 10.510)],
    [("B4", 61.010, 10.010), ("B5", 60.990, 9.990)],
]
# Per-coord static fields (identical across that coord's base points, as in _fetch_all).
COORD_STATIC = [
    {"Elevation (m)": 300.0, "ph_level": 6.1, "dist_m_water": 100.0, "dist_m_sea": 8000.0, "climate_zone": "temperate"},
    {"Elevation (m)": 900.0, "ph_level": np.nan, "dist_m_water": 4000.0, "dist_m_sea": 200.0, "climate_zone": "boreal"},
    {"Elevation (m)": 1500.0, "ph_level": 7.3, "dist_m_water": 50.0, "dist_m_sea": 50.0, "climate_zone": "temperate"},
]


def species_params():
    return {
        "sp_water": {
            "optimal_temp": 14.0, "temp_sigma": 6.0,
            "optimal_alt": 800.0, "alt_sigma": 500.0,
            "optimal_humidity": 85.0, "humidity_sigma": 15.0,
            "optimal_pH": 6.0, "pH_sigma_near": 0.5, "pH_sigma_far": 1.5, "pH_range_near": (5.0, 7.0),
            "min_cumulative_rain": 25.0,
            "weather_preference": {"rain_first": True},
            "water_relevance": True, "sea_relevance": True,
            "wind_sensitive": True,
            "climate_zones": ["temperate", "boreal"],
            "season_months": [6, 7, 8, 9],
            "season_factor": 0.4,
        },
        "sp_curve": {
            "optimal_temp": 11.0, "temp_sigma": 5.0,
            "optimal_alt": 1200.0, "alt_sigma": 600.0,
            "optimal_humidity": 80.0, "humidity_sigma": 18.0,
            "optimal_pH": 6.5, "pH_sigma_near": 0.6, "pH_sigma_far": 1.4, "pH_range_near": (5.5, 7.5),
            "min_cumulative_rain": 15.0,
            "weather_preference": {"rain_first": False},
            "water_relevance": False, "sea_relevance": False,
            "wind_sensitive": False,
            "season_curve": {m: v for m, v in zip(range(1, 13),
                              [0.2, 0.2, 0.3, 0.5, 0.8, 1.0, 1.0, 0.9, 0.7, 0.5, 0.3, 0.2])},
        },
    }


def zone_curves():
    # Override the season multiplier for the 'boreal' zone, sp_curve only.
    return {"boreal": {"sp_curve": {m: float(v) for m, v in zip(range(1, 13),
                        [0.1, 0.1, 0.2, 0.4, 0.7, 1.0, 1.0, 0.8, 0.6, 0.4, 0.2, 0.1])}}}


def _weather_for(coord_idx, date_offset):
    """Deterministic per-(coord, day) weather; identical for that coord's base points."""
    rng = np.random.default_rng(1000 * coord_idx + (date_offset + 100))
    return {
        "Temperature (C) Max": float(rng.uniform(10, 20)),
        "Temperature (C) Min": float(rng.uniform(0, 8)),
        "Temperature (C)": float(rng.uniform(4, 16)),
        "Wind Speed (kph)": float(rng.uniform(2, 40)),
        "Pressure (hPa)": float(rng.uniform(995, 1025)),
        "TotalPrecipitation_mm": float(rng.gamma(1.2, 3.0)),
        "Humidity (%)": float(rng.uniform(55, 98)),
        "Description": "synthetic",
    }


def _row(loc, blat, blon, date, coord_idx, with_coord_key=False):
    w = _weather_for(coord_idx, (date - TODAY).days)
    st = COORD_STATIC[coord_idx]
    row = {
        "Location_Id": loc, "Latitude": blat, "Longitude": blon, "Date": date,
        **w, **st,
    }
    if with_coord_key:  # the actual fetched coord this base borrows weather from
        row["_coord_lat"], row["_coord_lon"] = COORDS[coord_idx]
    return row


def forward_df():
    """Mimics _join_to_base output for the forward fetch (has Wind Speed (kph), no m/s,
    and the internal _coord_lat/_coord_lon key identifying the shared fetched coord)."""
    rows = []
    for ci, bases in enumerate(BASE_PER_COORD):
        for loc, blat, blon in bases:
            for d in range(FWD_DAYS):
                rows.append(_row(loc, blat, blon, TODAY + pd.Timedelta(days=d), ci, with_coord_key=True))
    return pd.DataFrame(rows)


def history_df():
    """Frozen history at base resolution (masterfile schema: Wind Speed (m/s) + scores)."""
    rows = []
    for ci, bases in enumerate(BASE_PER_COORD):
        for loc, blat, blon in bases:
            for d in range(HIST_DAYS, 0, -1):
                rows.append(_row(loc, blat, blon, TODAY - pd.Timedelta(days=d), ci))
    df = pd.DataFrame(rows)
    df["Wind Speed (m/s)"] = df.pop("Wind Speed (kph)") / 3.6
    for sp in species_params():
        df[f"{sp}_score"] = 1.23  # arbitrary frozen score; must be left untouched
    return df


def config():
    return fp.RegionConfig(
        boundaries_env="b", coordinates_env="c", base_env="base", species_params_env="s",
        weather_data_env="w", static_info_env="st", season_curves_env="sc", zone_curves_env="zc",
        lat_range=(0, 0), lon_range=(0, 0), lag_days=LAG_DAYS,
    )


def score_columns():
    return [f"{sp}_score" for sp in species_params()]
