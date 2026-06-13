"""Shared rolling-forecast scoring pipeline for the regional scripts.

One WeatherAPI forecast.json call per coordinate returns up to 7 forecast days
(billed as ONE call). We emit one dated row per forecast day, so the master time
series gains [today .. today+6] each run. Overlapping future dates are replaced by
the fresher forecast on the next run; the day that rolls out of the window freezes.
"""
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime, timedelta
from io import StringIO, BytesIO
from pathlib import Path
from urllib.parse import urlparse
import math
import os
import json
import time
import threading

import boto3
import numpy as np
import pandas as pd
import requests

BASE_URL = "https://api.weatherapi.com/v1/forecast.json"
FORECAST_DAYS = 7


def parse_forecast_days(weather_json, static_fields, lat_r, lon_r, ndp):
    """Return ONE row per forecast day from a single forecast.json response.

    static_fields: dict with Altitude, dist_m_water, dist_m_sea, climate_zone, ph_level
    (looked up once per coord; identical across the coord's days).
    """
    forecast = (weather_json or {}).get("forecast", {}).get("forecastday", []) or []
    place = (weather_json or {}).get("location", {}).get("name", "NA")
    loc_key = f"{lat_r:.{ndp}f}_{lon_r:.{ndp}f}"
    location_id = f"{place}_{loc_key}"

    rows = []
    for fday in forecast:
        day = fday.get("day", {}) or {}
        hours = fday.get("hour", []) or []
        pressure_mb = None
        if hours:
            vals = [h.get("pressure_mb") for h in hours if h.get("pressure_mb") is not None]
            if vals:
                pressure_mb = float(np.mean(vals))
        rows.append({
            "Date": fday.get("date"),
            "Location_Id": location_id,
            "Latitude": lat_r,
            "Longitude": lon_r,
            "Elevation (m)": static_fields.get("Altitude"),
            "dist_m_water": static_fields.get("dist_m_water"),
            "dist_m_sea": static_fields.get("dist_m_sea"),
            "climate_zone": static_fields.get("climate_zone"),
            "Temperature (C) Max": day.get("maxtemp_c"),
            "Temperature (C) Min": day.get("mintemp_c"),
            "Temperature (C)": day.get("avgtemp_c"),
            "Wind Speed (kph)": day.get("maxwind_kph"),
            "Pressure (hPa)": pressure_mb,
            "Humidity (%)": day.get("avghumidity"),
            "Description": (day.get("condition") or {}).get("text"),
            "TotalPrecipitation_mm": day.get("totalprecip_mm", 0),
            "ph_level": static_fields.get("ph_level"),
        })
    return rows


def merge_master(existing_df, new_df):
    """Concat new AFTER existing, then keep the LAST row per (Location_Id, Date).

    New (fresher) forecast rows therefore overwrite overlapping existing dates,
    while frozen past rows (absent from new_df) are left untouched.
    """
    combined = pd.concat([existing_df, new_df], ignore_index=True)
    combined["Date"] = pd.to_datetime(combined["Date"])
    combined = combined.drop_duplicates(subset=["Location_Id", "Date"], keep="last")
    return combined.reset_index(drop=True)


def assert_window_contiguous(df, today, forward_days=FORECAST_DAYS, lookback=21):
    """Hard-assert the forward window [today..today+forward_days-1] is gapless per
    Location_Id; warn on gaps inside the legacy lag lookback [today-lookback..today-1].
    """
    today = pd.Timestamp(today).normalize()
    d = df[["Location_Id", "Date"]].copy()
    d["Date"] = pd.to_datetime(d["Date"]).dt.normalize()

    fwd_end = today + pd.Timedelta(days=forward_days - 1)
    expected_fwd = pd.date_range(today, fwd_end)
    bad = []
    for loc, g in d.groupby("Location_Id"):
        have = set(g["Date"])
        missing = [ts for ts in expected_fwd if ts not in have]
        if missing:
            bad.append((loc, [m.strftime("%Y-%m-%d") for m in missing]))
    assert not bad, f"Forward-window date gaps for {len(bad)} location(s): {bad[:5]}"

    # Non-fatal lookback diagnostic.
    look_start = today - pd.Timedelta(days=lookback)
    look_expected = pd.date_range(look_start, today - pd.Timedelta(days=1))
    gappy = 0
    for loc, g in d.groupby("Location_Id"):
        have = set(g["Date"])
        if any(ts not in have for ts in look_expected):
            gappy += 1
    if gappy:
        print(f"[warn] {gappy} location(s) have legacy gaps in the {lookback}-day lookback; "
              f"their lag features will be partially NaN (pre-existing history).")


def forward_window_mask(df, today):
    """Boolean mask of rows to (re)score this run: every row with Date >= today.

    Frozen past rows keep their previously computed scores; the forward window is
    rescored each run because the forecast refines daily.
    """
    today = pd.Timestamp(today).normalize()
    return pd.to_datetime(df["Date"]).dt.normalize() >= today
