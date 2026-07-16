"""Shared rolling-forecast scoring pipeline for the regional scripts.

One WeatherAPI forecast.json call per coordinate returns up to 7 forecast days
(billed as ONE call). We emit one dated row per forecast day, so the master time
series gains [today .. today+6] each run. Overlapping future dates are replaced by
the fresher forecast on the next run; the day that rolls out of the window freezes.

Species/curve params, the coordinate grid, static geo attributes, and the rolling
weather/score master all live in Postgres (via `SpeciesRepository`, `BoundaryRepository`,
`CoordinateRepository`, `WeatherScoreRepository`) rather than R2/local files.
"""
import logging
import math
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime, timedelta

import numpy as np
import pandas as pd
import requests
from sqlalchemy import Engine

from funges_backend.db.engine import get_engine
from funges_backend.geo import CoordinateRepository
from funges_backend.seasonality import season_multiplier_for_species
from funges_backend.settings import get_weatherapi_settings
from funges_backend.species import SpeciesRepository
from funges_backend.weather_scores import WeatherScoreRepository

logger = logging.getLogger(__name__)

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
    """Per-Location_Id, the forward portion (Date >= today) must be a GAPLESS daily run;
    warn on gaps inside the legacy lookback [today-lookback..today-1].

    `today` must be the earliest forecast date actually fetched this run (coordinate-
    LOCAL), not the server clock: WeatherAPI returns each coord's local 7 days, so US
    regions legitimately start a calendar day behind a UTC/Europe server, and different
    coords in one region may even start on different days. We therefore verify each
    location's own forward run is consecutive (which is exactly requirement #2 — every
    Location_Id's date series stays daily-contiguous) rather than forcing a single shared
    window. `forward_days` is retained for call-site compatibility.
    """
    today = pd.Timestamp(today).normalize()
    d = df[["Location_Id", "Date"]].copy()
    d["Date"] = pd.to_datetime(d["Date"]).dt.normalize()

    fwd = d[d["Date"] >= today].drop_duplicates(["Location_Id", "Date"])
    g = fwd.groupby("Location_Id")["Date"]
    span_days = (g.max() - g.min()).dt.days + 1          # count if perfectly consecutive
    distinct = g.nunique()
    bad = span_days.index[span_days != distinct]          # a hole inside the forward run
    assert len(bad) == 0, (
        f"Forward date gaps for {len(bad)} location(s): {list(bad[:5])}"
    )

    look_start = today - pd.Timedelta(days=lookback)
    look_end = today - pd.Timedelta(days=1)
    look_expected = pd.date_range(look_start, look_end)
    in_look = d[(d["Date"] >= look_start) & (d["Date"] <= look_end)]
    look_cnt = in_look.groupby("Location_Id")["Date"].nunique()
    full_locs = set(look_cnt[look_cnt >= len(look_expected)].index)
    gappy = d["Location_Id"].nunique() - len(full_locs)
    if gappy:
        logger.warning(
            "%s location(s) have legacy gaps in the %s-day lookback; "
            "their lag features will be partially NaN (pre-existing history).", gappy, lookback,
        )


def forward_window_mask(df, today):
    """Boolean mask of rows to (re)score this run: every row with Date >= today.

    Frozen past rows keep their previously computed scores; the forward window is
    rescored each run because the forecast refines daily.
    """
    today = pd.Timestamp(today).normalize()
    return pd.to_datetime(df["Date"]).dt.normalize() >= today


class CallCounter:
    """Thread-safe counter for WeatherAPI HTTP requests (proves 1 call/coord)."""
    def __init__(self):
        self._lock = threading.Lock()
        self.count = 0

    def incr(self):
        with self._lock:
            self.count += 1


def fetch_weather_data(lat, lon, api_key, counter=None, retries=4):
    """One forecast.json call per coordinate -> up to FORECAST_DAYS days in ONE response.

    No dt= (history) parameter: this is a forward forecast, billed as a single call.
    """
    params = {
        "key": api_key,
        "q": f"{lat},{lon}",
        "days": FORECAST_DAYS,
        "aqi": "no",
        "alerts": "no",
    }
    for attempt in range(retries):
        try:
            if counter is not None:
                counter.incr()
            resp = requests.get(BASE_URL, params=params, timeout=(5, 12))
            if resp.status_code == 200:
                return resp.json()
            if resp.status_code == 429 and attempt < retries - 1:
                time.sleep(2 ** attempt)        # rate-limit backoff (higher concurrency)
                continue
            logger.warning("[%s,%s] bad status %s", lat, lon, resp.status_code)
            return None
        except requests.RequestException as e:
            if attempt < retries - 1:
                time.sleep(1)
                continue
            logger.warning("[%s,%s] request error after %s tries: %s", lat, lon, retries, e)
            return None


@dataclass
class RegionConfig:
    region: str
    lat_range: tuple
    lon_range: tuple
    lat_step: float = 0.060
    lon_step: float = 0.075
    ndp: int = 3
    lag_days: int = 21
    cutoff_days: int = 365
    # Performance: WeatherAPI calls are network-bound. 3 was extremely conservative;
    # raise substantially, tunable via env for rate-limit headroom.
    max_workers: int = int(os.getenv("FORECAST_MAX_WORKERS", "16"))


def compute_distance(lat1, lon1, lat2, lon2):
    lat1, lon1, lat2, lon2 = map(np.radians, [lat1, lon1, lat2, lon2])
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = np.sin(dlat/2)**2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon/2)**2
    c = 2 * np.arctan2(np.sqrt(a), np.sqrt(1-a))
    return 6371.01 * c  # km


def _latlon_to_unit_xyz(lat, lon):
    lat_r = np.radians(np.asarray(lat, dtype=float))
    lon_r = np.radians(np.asarray(lon, dtype=float))
    return np.column_stack([
        np.cos(lat_r) * np.cos(lon_r),
        np.cos(lat_r) * np.sin(lon_r),
        np.sin(lat_r),
    ])


def replace_missing_elevation_with_closest(df):
    known = df[df['Elevation (m)'].notna()]
    if known.empty:
        return df
    miss = df['Elevation (m)'].isna()
    if not miss.any():
        return df
    from scipy.spatial import cKDTree
    # Chord distance on the unit sphere is monotonic in great-circle distance, so the
    # nearest neighbour matches the original haversine nearest, but far cheaper.
    tree = cKDTree(_latlon_to_unit_xyz(known['Latitude'].to_numpy(), known['Longitude'].to_numpy()))
    _, idx = tree.query(_latlon_to_unit_xyz(df.loc[miss, 'Latitude'].to_numpy(), df.loc[miss, 'Longitude'].to_numpy()))
    df.loc[miss, 'Elevation (m)'] = known['Elevation (m)'].to_numpy()[idx]
    return df


def replace_missing_elevation_from_previous_data(new_df, existing_df):
    if existing_df is None or existing_df.empty:
        return new_df
    prev_elev = existing_df.groupby('Location_Id')['Elevation (m)'].max()
    na = new_df['Elevation (m)'].isna()
    if na.any():
        new_df.loc[na, 'Elevation (m)'] = new_df.loc[na, 'Location_Id'].map(prev_elev).values
    return new_df


def gaussian(x, mu, sig):
    return np.exp(-np.power(x - mu, 2.) / (2 * np.power(sig, 2.)))


def compute_lag_features(df, columns, days):
    df = df.sort_values(by=["Location_Id", "Date"], ascending=[True, True])
    # Lags are keyed on the calendar date, not on row position: a row's "N days ago"
    # value is taken from the row at exactly Date - N days for the same Location_Id
    # (NaN if that day is absent). This prevents missing days in the daily history
    # from silently stretching the lookback window. Duplicate (Location_Id, Date)
    # pairs collapse to their last value so the lookup stays uniquely indexed.
    lookups = {col: df.groupby(["Location_Id", "Date"])[col].last() for col in columns}
    locs = df["Location_Id"].to_numpy()
    for day in range(1, days + 1):
        target_idx = pd.MultiIndex.from_arrays(
            [locs, (df["Date"] - pd.Timedelta(days=day)).to_numpy()]
        )
        for col in columns:
            df[f"{col}_{day}days_ago"] = lookups[col].reindex(target_idx).to_numpy()
    return df


def altitude_score(x, optimal_alt=1150, alt_sigma=600):
    return gaussian(x, optimal_alt, alt_sigma)


def _weather_score_vectorized(df, precip_hist_cols, *, min_p, cum_thr, rain_first,
                              baseline_days, max_wet_eff, min_dry_eff, cum_gamma,
                              dl_start_pct, dl_floor, dl_gamma, drought_k, drought_mid,
                              drought_floor, no_wet_penalty, weather_eps):
    """Vectorized rain sub-score — bit-identical to the original per-row `_weather_row`
    (locked by tests/test_weather_score_vectorization.py against the verbatim reference
    in tools/weather_score_reference.py), but ~500x faster: it operates on the whole
    (N x lag_days) precip matrix at once instead of one Python call per row.
    """
    lag_days = len(precip_hist_cols)
    n = len(df)
    if lag_days:
        H = df[precip_hist_cols].to_numpy(float)
        H = np.where(np.isfinite(H), np.clip(H, 0.0, None), 0.0)
    else:
        H = np.zeros((n, 0), dtype=float)
    hist_days = H.shape[1]

    wet_mask = min_p <= H
    wet_count = wet_mask.sum(axis=1)
    dry_count = hist_days - wet_count
    req_dry = (min_dry_eff if hist_days >= baseline_days
               else math.ceil(min_dry_eff * (hist_days / baseline_days)))

    today_p = df['TotalPrecipitation_mm'].to_numpy(float)
    today_ok = np.isfinite(today_p) & (today_p >= min_p)
    day_ok = today_ok.astype(float)

    cum_mm = H.sum(axis=1) if hist_days else np.zeros(n)
    scale = (hist_days / baseline_days) if hist_days else 0.0
    adj_thr = max(cum_thr * scale, 1e-9)
    cum_frac = np.minimum(1.0, cum_mm / adj_thr)
    cum_frac_eff = cum_frac ** cum_gamma

    ratio = cum_mm / adj_thr
    flood_pen = np.where(ratio <= 4, 1.0, 1.0 / (1.0 + 1.25 * (ratio - 4)))

    wet_factor = np.where(
        wet_count == 0, 0.0,
        np.where(wet_count <= max_wet_eff, 1.0,
                 np.maximum(0.0, 1.0 - 0.15 * (wet_count - max_wet_eff))))

    raw = (0.20 * wet_factor
           + 0.15 * (dry_count >= req_dry).astype(float)
           + 0.05 * day_ok
           + 0.60 * (cum_frac_eff * flood_pen))

    if rain_first:
        if hist_days >= 10:
            wet_early = (H[:, 6:10] >= min_p).mean(axis=1)
            dry_recent = (H[:, 0:4] < min_p).mean(axis=1)
        elif hist_days >= 4:
            wet_early = (H[:, -4:] >= min_p).mean(axis=1)
            dry_recent = (H[:, 0:4] < min_p).mean(axis=1)
        else:
            wet_early = np.zeros(n)
            dry_recent = np.zeros(n)
        raw = np.minimum(1.0, raw + 0.25 * (wet_early * dry_recent))

    if hist_days:
        any_wet = wet_mask.any(axis=1)
        first_wet = np.argmax(wet_mask, axis=1)  # index of first wet day (0 if none)
        days_since_wet = np.where(any_wet, first_wet + 1, hist_days + 1).astype(float)
    else:
        days_since_wet = np.zeros(n)
    days_since_wet = days_since_wet + (~today_ok).astype(float)

    pos = np.minimum(1.0, days_since_wet / baseline_days)
    t = (pos - dl_start_pct) / max(1e-9, (1.0 - dl_start_pct))
    decay = 1.0 - (1.0 - dl_floor) * (t ** dl_gamma)
    raw = np.where(pos > dl_start_pct, raw * decay, raw)
    raw = np.minimum(1.0, raw)

    sig = 1.0 / (1.0 + np.exp(-drought_k * (cum_frac_eff - drought_mid)))
    drought_mult = drought_floor + (1.0 - drought_floor) * sig
    drought_mult = np.where(wet_count == 0, drought_mult * no_wet_penalty, drought_mult)

    return np.clip(raw * drought_mult, weather_eps, 1.0)


def _weighted_lag_gaussian(df, base_col, n_days, weights, mu, sigma):
    """Weighted-over-lags gaussian score, vectorized over all rows. Bit-identical to
    the original `sum(w * col.fillna(base).apply(gaussian))` (same left-fold order),
    but evaluates the gaussian on whole columns instead of per row.
    """
    base = df[base_col]
    score = np.zeros(len(df), dtype=float)
    for i, d in enumerate(range(1, n_days + 1)):
        col = f"{base_col}_{d}days_ago"
        series = df[col] if col in df.columns else base
        vals = series.fillna(base).to_numpy(float)
        score = score + weights[i] * gaussian(vals, mu, sigma)
    return score


def _ph_score_vectorized(ph_values, optimal_pH, pH_sigma_near, pH_sigma_far, pH_range_near):
    """Vectorized piecewise-sigma pH gaussian; NaN pH -> 0 (matches the original apply)."""
    ph = np.asarray(ph_values, dtype=float)
    isnan = np.isnan(ph)
    ph_safe = np.where(isnan, optimal_pH, ph)
    near = (ph_safe >= pH_range_near[0]) & (ph_safe <= pH_range_near[1])
    sig = np.where(near, pH_sigma_near, pH_sigma_far)
    score = np.exp(-((ph_safe - optimal_pH) ** 2) / (2 * sig ** 2))
    return np.where(isnan, 0.0, score)


def calculate_mushroom_score(df, species_params, zone_curves):
    wind_start, wind_max = 4.15, 25
    df['Wind_Penalty'] = df['Wind Speed (m/s)'].apply(
        lambda x: -1.5 if x >= wind_max else -1.5 * (x - wind_start) / (wind_max - wind_start) if x > wind_start else 0
    ).clip(-1.5, 0)

    precip_hist_cols = sorted(
        [c for c in df.columns if c.startswith('TotalPrecipitation_mm_') and c.endswith('days_ago')],
        key=lambda x: int(x.split('_')[-2].replace('days','').replace('day',''))
    )
    lag_days = len(precip_hist_cols)
    if 'TotalPrecipitation_mm' not in df.columns:
        df['TotalPrecipitation_mm'] = np.nan
    baseline_days = float(max(lag_days, 1))

    for specie, params in species_params.items():
        min_p = 1.5
        cum_thr = float(params.get('min_cumulative_rain', 20.0))
        rain_first = bool(params.get('weather_preference', {}).get('rain_first', False))

        _ct = max(0.0, min(cum_thr, 80.0))
        drought_k      = 4.0 + 0.06 * _ct
        drought_mid    = min(0.85, 0.65 + 0.0025 * _ct)
        drought_floor  = max(0.08, 0.18 - 0.0015 * _ct)
        no_wet_penalty = max(0.50, 0.70 - 0.002 * _ct)
        weather_eps    = 1e-5
        # Convex exponent on the cumulative-rain fraction: sub-threshold rain earns
        # proportionally less credit (0.75 of threshold -> 0.75**1.5 ~= 0.65, vs the old
        # near-linear 0.75), so marginal/drought weeks no longer read as "good". At and
        # above threshold (frac == 1.0) it is unchanged, so peak conditions still score high.
        cum_gamma      = 1.5

        dl_start_pct = min(0.85, 0.72 + 0.001 * _ct)
        dl_floor     = 0.05
        dl_gamma     = 2.0

        wet_day_mm_ref = np.clip(12.0 - 0.2 * cum_thr, 4.5, 12.0)
        max_wet_eff = int(np.clip(np.ceil(cum_thr / max(wet_day_mm_ref, 1e-9)), 1, max(1, int(0.55 * baseline_days))))
        min_dry_eff = int(np.clip(np.round(0.5 * (baseline_days - max_wet_eff)), 1, max(1, int(0.6 * baseline_days))))

        df[f'{specie}_Weather_Score'] = _weather_score_vectorized(
            df, precip_hist_cols,
            min_p=min_p, cum_thr=cum_thr, rain_first=rain_first,
            baseline_days=baseline_days, max_wet_eff=max_wet_eff, min_dry_eff=min_dry_eff,
            cum_gamma=cum_gamma, dl_start_pct=dl_start_pct, dl_floor=dl_floor,
            dl_gamma=dl_gamma, drought_k=drought_k, drought_mid=drought_mid,
            drought_floor=drought_floor, no_wet_penalty=no_wet_penalty,
            weather_eps=weather_eps)

    for specie, params in species_params.items():
        optimal_temp, temp_sigma = params["optimal_temp"], params["temp_sigma"]
        optimal_alt, alt_sigma = params["optimal_alt"], params["alt_sigma"]
        optimal_humidity, humidity_sigma = params["optimal_humidity"], params["humidity_sigma"]
        optimal_pH, pH_sigma_near, pH_sigma_far, pH_range_near = (
            params["optimal_pH"], params["pH_sigma_near"], params["pH_sigma_far"], params["pH_range_near"]
        )

        df[f'{specie}_Temp_Score'], df[f'{specie}_Humidity_Score'] = 0.0, 0.0

        temp_days = min(12, len([c for c in df.columns if c.startswith('Temperature (C)_') and c.endswith('days_ago')]))
        hum_days  = min(21, len([c for c in df.columns if c.startswith('Humidity (%)_') and c.endswith('days_ago')]))

        if temp_days > 0:
            dT = np.arange(1, temp_days + 1)
            temp_weights = 0.6 * np.exp(-0.5 * ((dT - 4) / 3.0)**2) + 0.4 * np.exp(-0.08 * dT)
            temp_weights /= temp_weights.sum()
            temp_score = _weighted_lag_gaussian(df, 'Temperature (C)', temp_days, temp_weights, optimal_temp, temp_sigma)
        else:
            temp_score = gaussian(df['Temperature (C)'].to_numpy(float), optimal_temp, temp_sigma)

        if hum_days > 0:
            dH = np.arange(1, hum_days + 1)
            hum_weights = 0.6 * np.exp(-0.5 * ((dH - 9) / 5.0)**2) + 0.4 * np.exp(-0.05 * dH)
            hum_weights /= hum_weights.sum()
            humidity_score = _weighted_lag_gaussian(df, 'Humidity (%)', hum_days, hum_weights, optimal_humidity, humidity_sigma)
        else:
            humidity_score = gaussian(df['Humidity (%)'].to_numpy(float), optimal_humidity, humidity_sigma)

        df[f'{specie}_Temp_Score'] = np.clip(temp_score, 0, 1)
        df[f'{specie}_Humidity_Score'] = np.clip(humidity_score, 0, 1)
        df[f'{specie}_Alt_Score'] = np.clip(
            altitude_score(df['Elevation (m)'].to_numpy(float), optimal_alt, alt_sigma), 0, 1)
        df[f'{specie}_PH_Score'] = _ph_score_vectorized(
            df['ph_level'].to_numpy(float), optimal_pH, pH_sigma_near, pH_sigma_far, pH_range_near)

        water_score, sea_score = 1.0, 1.0
        for key, dist_col in [("water", "dist_m_water"), ("sea", "dist_m_sea")]:
            if params.get(f"{key}_relevance", False):
                dist = df[dist_col]
                limit = 500
                decay_width = limit * 0.33
                decay_start, decay_end = limit, limit + decay_width
                score = np.where(
                    dist <= decay_start, 1.0,
                    np.where(dist >= decay_end, 0.0, 1.0 - ((dist - decay_start) / decay_width))
                )
                score = ((score * 0.8) + 0.2) ** 0.7
                if key == "water":
                    water_score = score
                else:
                    sea_score = score

        wr, sr = params.get("water_relevance"), params.get("sea_relevance")
        water_active = bool(wr or sr)
        eps = 1e-9
        water_factor = (
            2 * (water_score * sea_score) / np.clip(water_score + sea_score, eps, None)
            if wr and sr else water_score if wr else sea_score if sr else 1.0
        )

        def wgeom_mean_rows(components, weights, eps=eps):
            comps = np.clip(np.asarray(components, float), eps, 1.0)
            w = np.asarray(weights, float)
            return np.exp((w[:, None] * np.log(comps)).sum(axis=0) / max(w.sum(), eps))

        #weight of single scores (rain weighted above humidity: it is the stronger growth/fruiting trigger)
        wT, wH, wW, wA, wPH = 1.75, 1.25, 1.5, 0.75, 1.0
        wWater = 0.7 if water_active else 0.0

        n = len(df)
        if np.isscalar(water_factor):
            water_comp = np.full(n, float(water_factor), dtype=float)
        else:
            water_comp = np.asarray(water_factor, dtype=float).reshape(-1)
            if water_comp.size != n:
                water_comp = np.full(n, float(np.mean(water_comp)), dtype=float)

        if df['ph_level'].isna().any():
            comps_no_ph = np.vstack([
                df[f'{specie}_Temp_Score'].to_numpy(float),
                df[f'{specie}_Humidity_Score'].to_numpy(float),
                df[f'{specie}_Weather_Score'].to_numpy(float),
                df[f'{specie}_Alt_Score'].to_numpy(float),
                water_comp
            ])
            weights_no_ph = np.array([wT, wH, wW, wA, wWater], float)
            score_no_ph = 10 * wgeom_mean_rows(comps_no_ph, weights_no_ph)

            comps_ph = np.vstack([
                df[f'{specie}_Temp_Score'].to_numpy(float),
                df[f'{specie}_Humidity_Score'].to_numpy(float),
                df[f'{specie}_Weather_Score'].to_numpy(float),
                df[f'{specie}_Alt_Score'].to_numpy(float),
                df[f'{specie}_PH_Score'].to_numpy(float),
                water_comp
            ])
            weights_ph = np.array([wT, wH, wW, wA, wPH, wWater], float)
            score_ph = 10 * wgeom_mean_rows(comps_ph, weights_ph)

            df[f'{specie}_score'] = np.where(df['ph_level'].isna(), score_no_ph, score_ph)
        else:
            comps_ph = np.vstack([
                df[f'{specie}_Temp_Score'].to_numpy(float),
                df[f'{specie}_Humidity_Score'].to_numpy(float),
                df[f'{specie}_Weather_Score'].to_numpy(float),
                df[f'{specie}_Alt_Score'].to_numpy(float),
                df[f'{specie}_PH_Score'].to_numpy(float),
                water_comp
            ])
            weights_ph = np.array([wT, wH, wW, wA, wPH, wWater], float)
            df[f'{specie}_score'] = 10 * wgeom_mean_rows(comps_ph, weights_ph)

        df[f'{specie}_score'] = df[f'{specie}_score'].clip(0, 10)
        if params.get("wind_sensitive", False):
            df[f'{specie}_score'] = (df[f'{specie}_score'] + df['Wind_Penalty']).clip(0, 10)

        allowed_climates = params.get("climate_zones", [])
        if allowed_climates:
            df.loc[~df['climate_zone'].isin(allowed_climates), f'{specie}_score'] = 0

        df[f'{specie}_score'] *= season_multiplier_for_species(df, specie, params, zone_curves)

        df.drop(columns=[
            f'{specie}_Temp_Score',
            f'{specie}_Alt_Score',
            f'{specie}_Humidity_Score',
            f'{specie}_PH_Score'
        ], inplace=True)

    return df


# --- Repository <-> wide-DataFrame translation ------------------------------

# Wide pipeline column -> `weather_scores` column, everything but Location_Id/Date/scores.
_MASTERFILE_TO_DB = {
    "Latitude": "latitude",
    "Longitude": "longitude",
    "Elevation (m)": "elevation_m",
    "Pressure (hPa)": "pressure_hpa",
    "TotalPrecipitation_mm": "total_precipitation_mm",
    "Humidity (%)": "humidity_pct",
    "Wind Speed (m/s)": "wind_speed_ms",
    "Description": "description",
    "Temperature (C) Max": "temperature_c_max",
    "Temperature (C) Min": "temperature_c_min",
    "Temperature (C)": "temperature_c",
    "dist_m_water": "dist_m_water",
    "dist_m_sea": "dist_m_sea",
    "climate_zone": "climate_zone",
    "ph_level": "ph_level",
}
_DB_TO_MASTERFILE = {v: k for k, v in _MASTERFILE_TO_DB.items()}


def _clean(value):
    """None for missing/NaN, else the value unchanged -- pandas NaN is not a valid
    value for the nullable Postgres columns these rows are written to."""
    return None if pd.isna(value) else value


def _to_weather_score_rows(df: pd.DataFrame) -> list[dict]:
    """Convert wide pipeline rows (Location_Id/Date/... columns) into `weather_scores`
    row dicts, ready for `WeatherScoreRepository.upsert_forecast_rows`."""
    rows = []
    for record in df.to_dict("records"):
        row = {"location_id": record["Location_Id"], "date": pd.Timestamp(record["Date"]).date()}
        for src_col, dest_col in _MASTERFILE_TO_DB.items():
            row[dest_col] = _clean(record.get(src_col))
        rows.append(row)
    return rows


def _rows_to_dataframe(rows: list[dict]) -> pd.DataFrame:
    """Inverse of `_to_weather_score_rows`, for rows read back from the repository
    (minus `scores`, which the scoring step re-derives)."""
    columns = ["Location_Id", "Date", *_MASTERFILE_TO_DB]
    if not rows:
        return pd.DataFrame(columns=columns)
    records = [
        {"Location_Id": row["location_id"], "Date": pd.Timestamp(row["date"]),
         **{wide: row.get(db) for db, wide in _DB_TO_MASTERFILE.items()}}
        for row in rows
    ]
    return pd.DataFrame(records, columns=columns)


def rows_to_scored_dataframe(rows: list[dict]) -> pd.DataFrame:
    """Reconstruct the wide weather+score DataFrame the map-layer scripts expect
    (Location_Id/Date/weather columns plus one `{species}_score` column per scored
    species) from `WeatherScoreRepository` rows -- replaces reading the per-region
    weather/score master parquet/CSV directly."""
    df = _rows_to_dataframe(rows)
    if not rows:
        return df
    all_species = sorted({s for row in rows for s in (row.get("scores") or {})})
    for s in all_species:
        df[f"{s}_score"] = [(row.get("scores") or {}).get(s) for row in rows]
    return df


def apply_forward_scores(combined_df, forward, score_cols):
    """Write freshly-computed forward-window scores back onto the full series,
    leaving frozen past rows' existing scores untouched.

    Relies on (Location_Id, Date) being unique in combined_df (guaranteed by
    merge_master's keep='last' dedup) so the MultiIndex assignment is unambiguous.
    """
    base = combined_df.set_index(["Location_Id", "Date"])
    assert not base.index.has_duplicates, (
        "combined_df has duplicate (Location_Id, Date) rows; merge_master dedup did not run"
    )
    fwd = forward.set_index(["Location_Id", "Date"])
    for col in score_cols:
        if col not in base.columns:
            base[col] = pd.NA
        if col in fwd.columns:
            base.loc[fwd.index, col] = fwd[col].values
    return base.reset_index()


def _merge_and_score(config, df, species_params, zone_curves, weather_repo: WeatherScoreRepository):
    """Upsert this run's freshly-fetched rows, then rescore the forward window,
    against `WeatherScoreRepository` (replaces the old merge_master/file-rewrite
    with targeted Postgres upserts -- see `weather_scores/repository.py`)."""
    # Anchor "today" to the EARLIEST forecast date actually fetched (coordinate-local),
    # not the server clock: forecast.json returns each coord's local 7 days, so US
    # regions legitimately start a day behind a UTC/Europe runner. Using the server date
    # would mis-align the forward window and the contiguity guarantee for those regions.
    new_dates = pd.to_datetime(df["Date"])
    today = new_dates.min().normalize() if new_dates.notna().any() else pd.Timestamp(datetime.now().date())

    if "Wind Speed (m/s)" not in df.columns and "Wind Speed (kph)" in df.columns:
        df["Wind Speed (m/s)"] = df["Wind Speed (kph)"] / 3.6

    df = df[np.isfinite(df["Latitude"]) & np.isfinite(df["Longitude"])]
    df = df[df["Location_Id"] != ""]

    weather_repo.upsert_forecast_rows(_to_weather_score_rows(df))

    location_ids = sorted(df["Location_Id"].unique())
    # Only the forward window (Date >= today) is rescored, and a forward row's deepest
    # lag reaches back exactly lag_days, so only [today - lag_days ..] needs fetching:
    # frozen older rows are never rescored and need no lag features.
    lag_start = (today - pd.Timedelta(days=config.lag_days)).date()
    history_rows = weather_repo.get_rows_for_locations(location_ids, start_date=lag_start)
    combined_df = _rows_to_dataframe(history_rows)
    combined_df["Date"] = pd.to_datetime(combined_df["Date"])

    assert_window_contiguous(combined_df, today, forward_days=FORECAST_DAYS, lookback=config.lag_days)

    combined_df = combined_df.sort_values(["Location_Id", "Date"])
    lag_columns = ["Temperature (C)", "TotalPrecipitation_mm", "Pressure (hPa)", "Humidity (%)"]
    lagged = compute_lag_features(combined_df, lag_columns, days=config.lag_days)

    mask = forward_window_mask(lagged, today)
    forward = lagged[mask].copy()
    logger.info(
        "Scoring %s forward rows (Date >= %s) across %s locations",
        len(forward), today.date(), forward["Location_Id"].nunique(),
    )
    forward = calculate_mushroom_score(forward, species_params, zone_curves)

    score_cols = [f"{s}_score" for s in species_params]
    for col in score_cols:
        if col in forward.columns:
            forward[col] = forward[col].mask(forward[col] > 9.5, 10).round(2)

    updates = [
        {
            "location_id": record["Location_Id"],
            "date": pd.Timestamp(record["Date"]).date(),
            "scores": {s: float(record[f"{s}_score"]) for s in species_params if pd.notna(record.get(f"{s}_score"))},
        }
        for record in forward.to_dict("records")
    ]
    weather_repo.write_forward_scores(updates)

    cutoff_date = (datetime.now() - timedelta(days=config.cutoff_days)).date()
    weather_repo.delete_rows_older_than(cutoff_date, lat_range=config.lat_range, lon_range=config.lon_range)


# --- Orchestration -----------------------------------------------------------

def run_pipeline(config: RegionConfig, *, engine: Engine | None = None) -> None:
    """Fetch this run's forecasts and rescore the forward window for one region,
    reading/writing exclusively through the species/geo/weather-score repositories."""
    logger.info("Script started at %s", datetime.now())
    engine = engine or get_engine()
    species_repo = SpeciesRepository(engine)
    coordinate_repo = CoordinateRepository(engine)
    weather_repo = WeatherScoreRepository(engine)

    weatherapi_key = get_weatherapi_settings().weatherapi_key
    species_params = species_repo.get_all_species_params()
    zone_curves = species_repo.get_all_zone_curves()

    coordinates = coordinate_repo.get_coordinates(config.region)
    if len(coordinates) == 0:
        coordinates = coordinate_repo.generate_grid(
            config.region, config.lat_range, config.lon_range, config.lat_step, config.lon_step,
        )
    logger.info("Final number of coordinates: %s", len(coordinates))

    counter = CallCounter()
    weather_long = _fetch_all(config, coordinates, coordinate_repo, weatherapi_key, counter)
    logger.info("API calls made: %s for %s coordinates", counter.count, len(coordinates))

    _merge_and_score(config, weather_long, species_params, zone_curves, weather_repo)
    logger.info("Script ended at %s", datetime.now())


def _fetch_all(config: RegionConfig, coordinates, coordinate_repo: CoordinateRepository, api_key, counter):
    ndp = config.ndp

    def _static_for(lat_r, lon_r):
        attrs = coordinate_repo.get_static_attributes(lat_r, lon_r)
        return {
            "Altitude": attrs["altitude"],
            "dist_m_water": attrs["dist_m_water"],
            "dist_m_sea": attrs["dist_m_sea"],
            "climate_zone": attrs["climate_zone"],
            "ph_level": attrs["ph_level"],
        }

    def _process(coord):
        lat, lon = map(float, coord)
        lat_r, lon_r = round(lat, ndp), round(lon, ndp)
        weather = fetch_weather_data(lat_r, lon_r, api_key=api_key, counter=counter)
        if not weather:
            return None
        return parse_forecast_days(weather, _static_for(lat_r, lon_r), lat_r, lon_r, ndp)

    logger.info("Started API calls at %s (max_workers=%s)", datetime.now(), config.max_workers)
    rows = []
    with ThreadPoolExecutor(max_workers=config.max_workers) as ex:
        futures = [ex.submit(_process, c) for c in coordinates]
        for processed, f in enumerate(as_completed(futures), start=1):
            try:
                r = f.result()
                if r:
                    rows.extend(r)
            except Exception as e:
                logger.warning("Skipping failed/stuck coordinate: %s", e)
            if processed % 500 == 0:
                logger.info("%s coordinates processed...", processed)
    weather_long = pd.DataFrame(rows)
    logger.info("Length of weather_long (coords x days): %s", len(weather_long))
    return weather_long
