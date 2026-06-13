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
import sys
import json
import time
import threading

import boto3
import numpy as np
import pandas as pd
import requests
from shapely.ops import unary_union
from shapely.geometry import shape, Point

sys.path.insert(0, str(Path(__file__).resolve().parent))  # backend/ for seasonality
from seasonality import season_multiplier_for_species

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
    in_fwd = d[(d["Date"] >= today) & (d["Date"] <= fwd_end)]
    fwd_cnt = in_fwd.groupby("Location_Id")["Date"].nunique()
    bad = fwd_cnt[fwd_cnt < len(expected_fwd)]
    assert bad.empty, (
        f"Forward-window date gaps for {len(bad)} location(s): {bad.index[:5].tolist()}"
    )

    look_start = today - pd.Timedelta(days=lookback)
    look_end = today - pd.Timedelta(days=1)
    look_expected = pd.date_range(look_start, look_end)
    in_look = d[(d["Date"] >= look_start) & (d["Date"] <= look_end)]
    look_cnt = in_look.groupby("Location_Id")["Date"].nunique()
    full_locs = set(look_cnt[look_cnt >= len(look_expected)].index)
    gappy = d["Location_Id"].nunique() - len(full_locs)
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
            print(f"[{lat},{lon}] bad status {resp.status_code}")
            return None
        except requests.RequestException as e:
            if attempt < retries - 1:
                time.sleep(1)
                continue
            print(f"[{lat},{lon}] request error after {retries} tries: {e}")
            return None


@dataclass
class RegionConfig:
    boundaries_env: str
    coordinates_env: str
    base_env: str
    species_params_env: str
    weather_data_env: str
    static_info_env: str
    season_curves_env: str
    zone_curves_env: str
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


NDP = 3  # module-level default used by moved helpers


# --- Moved VERBATIM from NE_Scoring.py -------------------------------------

def load_dotenv(dotenv_path):
    if not dotenv_path.exists():
        return
    for raw_line in dotenv_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def get_required_env(*names):
    for name in names:
        value = os.getenv(name)
        if value is not None and str(value).strip() != "":
            return value
    raise RuntimeError(f"Missing required environment variable. Checked: {', '.join(names)}")


def is_remote_path(path):
    return str(path).startswith(("http://", "https://"))


def r2_fetch(url):
    """Fetch a file from R2 via authenticated boto3."""
    key = urlparse(url).path.lstrip('/')
    client = boto3.client(
        's3',
        endpoint_url=get_required_env("R2_ENDPOINT_URL"),
        aws_access_key_id=get_required_env("R2_ACCESS_KEY_ID"),
        aws_secret_access_key=get_required_env("R2_SECRET_ACCESS_KEY")
    )
    return client.get_object(Bucket=get_required_env("R2_BUCKET_NAME"), Key=key)["Body"].read()


def read_df_from_source(path):
    if is_remote_path(path):
        raw = r2_fetch(path)
        if str(path).endswith('.parquet'):
            return pd.read_parquet(BytesIO(raw))
        return pd.read_csv(StringIO(raw.decode('utf-8')))
    if str(path).endswith('.parquet'):
        return pd.read_parquet(path)
    return pd.read_csv(path)


def _round_pair(lat: float, lon: float):
    return (round(float(lat), NDP), round(float(lon), NDP))


def _dedupe_and_sort_latlon(latlon_iterable):
    rounded = {_round_pair(lat, lon) for (lat, lon) in latlon_iterable}
    return np.array(sorted(rounded), dtype=float)


def _save_coords(path: str, coords: np.ndarray):
    payload = [[f"{lat:.{NDP}f}", f"{lon:.{NDP}f}"] for lat, lon in coords]
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, indent=4)
        f.write("\n")


def _load_coords_any(path: str):
    if is_remote_path(path):
        raw = json.loads(r2_fetch(path))
    else:
        with open(path, 'r', encoding='utf-8') as f:
            raw = json.load(f)
    return np.array([(float(lat), float(lon)) for lat, lon in raw], dtype=float)


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


def load_df_from_file(file_path):
    return read_df_from_source(file_path)


def save_df_to_file(df, file_path):
    buf = BytesIO()
    if str(file_path).endswith('.parquet'):
        df.to_parquet(buf, index=False)
        content_type = 'application/octet-stream'
    else:
        buf.write(df.to_csv(index=False).encode('utf-8'))
        content_type = 'text/csv'
    data = buf.getvalue()
    if is_remote_path(file_path):
        key = urlparse(file_path).path.lstrip('/')
        client = boto3.client(
            's3',
            endpoint_url=get_required_env("R2_ENDPOINT_URL"),
            aws_access_key_id=get_required_env("R2_ACCESS_KEY_ID"),
            aws_secret_access_key=get_required_env("R2_SECRET_ACCESS_KEY")
        )
        client.put_object(Bucket=get_required_env("R2_BUCKET_NAME"), Key=key, Body=data, ContentType=content_type)
        print(f"Uploaded to R2: {file_path}")
    else:
        Path(file_path).write_bytes(data)


def remote_file_exists(file_path):
    if not is_remote_path(file_path):
        return os.path.exists(file_path)
    try:
        key = urlparse(file_path).path.lstrip('/')
        client = boto3.client(
            's3',
            endpoint_url=get_required_env("R2_ENDPOINT_URL"),
            aws_access_key_id=get_required_env("R2_ACCESS_KEY_ID"),
            aws_secret_access_key=get_required_env("R2_SECRET_ACCESS_KEY")
        )
        client.head_object(Bucket=get_required_env("R2_BUCKET_NAME"), Key=key)
        return True
    except Exception:
        return False


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
    in tools/vectorize_weather_poc.py), but ~500x faster: it operates on the whole
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

    wet_mask = H >= min_p
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

        def wgeom_mean_rows(components, weights):
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


# --- Loader helpers (wrap original top-of-script blocks) -------------------

def _load_species_and_curves(config, species_params_path):
    if is_remote_path(species_params_path):
        code = r2_fetch(species_params_path)
    else:
        with open(species_params_path, "r", encoding="utf-8") as f:
            code = f.read()
    ns = {}
    exec(code, ns)
    species_params = ns["species_params"]

    _curves_path = get_required_env(config.season_curves_env)
    try:
        _raw = r2_fetch(_curves_path).decode("utf-8") if is_remote_path(_curves_path) else Path(_curves_path).read_text(encoding="utf-8")
        _curves = json.loads(_raw)
        for _sp, _p in species_params.items():
            if _sp in _curves:
                _p["season_curve"] = {int(k): float(v) for k, v in _curves[_sp].items()}
        print(f"Loaded empirical season curves for {sum('season_curve' in p for p in species_params.values())} species.")
    except Exception as _e:
        print(f"[warn] could not load season curves from {_curves_path}: {_e}; falling back to season_months")

    _zone_curves_path = os.getenv(config.zone_curves_env)
    zone_curves = {}
    if _zone_curves_path:
        try:
            _zraw = (r2_fetch(_zone_curves_path).decode("utf-8")
                     if is_remote_path(_zone_curves_path)
                     else Path(_zone_curves_path).read_text(encoding="utf-8"))
            _zone_raw = json.loads(_zraw)
            zone_curves = {
                str(_z): {str(_sp): {int(k): float(v) for k, v in _c.items()}
                          for _sp, _c in _spmap.items()}
                for _z, _spmap in _zone_raw.items()
            }
            print(f"Loaded zone season curves for {len(zone_curves)} climate zones.")
        except Exception as _e:
            print(f"[warn] could not load zone curves from {_zone_curves_path}: {_e}; falling back to region/season_months")
    return species_params, zone_curves


def _load_static_map(static_info_path, ndp):
    static_df = read_df_from_source(static_info_path)
    static_df['Latitude'] = static_df['Latitude'].astype(float)
    static_df['Longitude'] = static_df['Longitude'].astype(float)
    static_df['_latr'] = static_df['Latitude'].round(ndp)
    static_df['_lonr'] = static_df['Longitude'].round(ndp)
    static_df = static_df.drop_duplicates(subset=['_latr', '_lonr'], keep='first')
    return static_df.set_index(['_latr', '_lonr'])[
        ['Altitude', 'dist_m_water', 'dist_m_sea', 'climate_zone', 'ph_level']
    ]


def _load_or_build_coords(config, coordinates_file_path, geojson_path):
    lat_start, lat_end = config.lat_range
    lon_start, lon_end = config.lon_range
    lat_step = config.lat_step
    lon_step = config.lon_step
    ndp = config.ndp

    if is_remote_path(coordinates_file_path) or os.path.exists(coordinates_file_path):
        coords_in = _load_coords_any(coordinates_file_path)
        coordinates = _dedupe_and_sort_latlon(coords_in)
        print(f"Loaded (and normalized) {len(coordinates)} coordinates from source.")
    else:
        if is_remote_path(geojson_path):
            g = json.loads(r2_fetch(geojson_path))
        else:
            with open(geojson_path, 'r', encoding='utf-8') as f:
                g = json.load(f)

        country_shapes = [shape(feat['geometry']) for feat in g.get('features', [])]
        combined_boundary = unary_union(country_shapes)

        lats = np.arange(lat_start, lat_end, lat_step)
        lons = np.arange(lon_start, lon_end, lon_step)
        lon_grid, lat_grid = np.meshgrid(lons, lats)
        grid_points = np.column_stack([lon_grid.ravel(), lat_grid.ravel()])  # [lon, lat]
        print(f"Original number of coordinates (pre-mask): {len(grid_points)}")

        filtered_lonlat = [
            tuple(Point(coord).coords[0])  # (lon, lat)
            for coord in grid_points
            if Point(coord).within(combined_boundary)
        ]
        latlon = [(lat, lon) for (lon, lat) in filtered_lonlat]
        coordinates = _dedupe_and_sort_latlon(latlon)
        _save_coords(coordinates_file_path, coordinates)
        print(f"Saved {len(coordinates)} rounded & deduped coordinates to the file.")
    return coordinates


# --- Orchestration ---------------------------------------------------------

def run_pipeline(config: RegionConfig):
    print(f"Script started at {datetime.now()}")
    _root = Path(__file__).resolve().parent.parent
    load_dotenv(_root / ".env")
    load_dotenv(_root / ".env.secret")

    api_key = get_required_env("WEATHERAPI_KEY")
    geojson_path = get_required_env(config.boundaries_env)
    coordinates_file_path = get_required_env(config.coordinates_env)
    base_file_path = get_required_env(config.base_env)
    species_params_path = get_required_env(config.species_params_env)
    main_data_path = get_required_env(config.weather_data_env)
    static_info_path = get_required_env(config.static_info_env)

    species_params, zone_curves = _load_species_and_curves(config, species_params_path)
    static_map = _load_static_map(static_info_path, config.ndp)
    coordinates = _load_or_build_coords(config, coordinates_file_path, geojson_path)
    print(f"Final number of coordinates: {len(coordinates)}")

    counter = CallCounter()
    weather_long = _fetch_all(config, coordinates, static_map, api_key, counter)
    print(f"API calls made: {counter.count} for {len(coordinates)} coordinates")

    df = _join_to_base(config, weather_long, base_file_path)
    df = _merge_and_score(config, df, species_params, zone_curves, main_data_path)
    save_df_to_file(df, main_data_path)
    print(f"Script ended at {datetime.now()}")


def _fetch_all(config, coordinates, static_map, api_key, counter):
    ndp = config.ndp

    def _static_for(lat_r, lon_r):
        try:
            srow = static_map.loc[(lat_r, lon_r)]
            if isinstance(srow, pd.DataFrame):
                srow = srow.iloc[0]
            return {
                "Altitude": float(srow["Altitude"]) if pd.notna(srow["Altitude"]) else None,
                "dist_m_water": float(srow["dist_m_water"]) if pd.notna(srow["dist_m_water"]) else None,
                "dist_m_sea": float(srow["dist_m_sea"]) if pd.notna(srow["dist_m_sea"]) else None,
                "climate_zone": srow["climate_zone"],
                "ph_level": float(srow["ph_level"]) if pd.notna(srow["ph_level"]) else None,
            }
        except KeyError:
            return {"Altitude": None, "dist_m_water": None, "dist_m_sea": None,
                    "climate_zone": None, "ph_level": None}

    def _process(coord):
        lat, lon = map(float, coord)
        lat_r, lon_r = round(lat, ndp), round(lon, ndp)
        weather = fetch_weather_data(lat_r, lon_r, api_key=api_key, counter=counter)
        if not weather:
            return None
        return parse_forecast_days(weather, _static_for(lat_r, lon_r), lat_r, lon_r, ndp)

    print(f"Started API calls at {datetime.now()} (max_workers={config.max_workers})")
    rows = []
    with ThreadPoolExecutor(max_workers=config.max_workers) as ex:
        futures = [ex.submit(_process, c) for c in coordinates]
        processed = 0
        for f in as_completed(futures):
            try:
                r = f.result()
                if r:
                    rows.extend(r)
            except Exception as e:
                print(f"[Warning] Skipping failed/stuck coordinate: {e}")
            processed += 1
            if processed % 500 == 0:
                print(f"{processed} coordinates processed...")
    weather_long = pd.DataFrame(rows)
    print(f"Length of weather_long (coords x days): {len(weather_long)}")
    return weather_long


def _join_to_base(config, weather_long, base_file_path):
    """Map each base output point to its nearest fetched coord ONCE, then expand to
    that coord's 7 daily weather rows. Tree is built on the N unique coords (not 7xN),
    and the date expansion is a single vectorized merge.
    """
    from scipy.spatial import cKDTree

    base_df = read_df_from_source(base_file_path)

    coord_keys = weather_long[["Latitude", "Longitude"]].drop_duplicates().reset_index(drop=True)
    coord_keys["coord_id"] = np.arange(len(coord_keys))
    weather_long = weather_long.merge(coord_keys, on=["Latitude", "Longitude"], how="left")

    tree = cKDTree(coord_keys[["Latitude", "Longitude"]].to_numpy())
    _, idx = tree.query(base_df[["Latitude", "Longitude"]].to_numpy())
    base_df = base_df.copy()
    base_df["coord_id"] = coord_keys["coord_id"].to_numpy()[idx]

    weather_cols = [
        "coord_id", "Date",
        "Temperature (C) Max", "Temperature (C) Min", "Temperature (C)",
        "Wind Speed (kph)", "Pressure (hPa)", "TotalPrecipitation_mm", "Humidity (%)",
        "Description", "dist_m_water", "dist_m_sea", "climate_zone", "ph_level",
        "Elevation (m)",
    ]
    base_keep = base_df.drop(columns=[c for c in weather_cols if c in base_df.columns and c != "coord_id"])
    out = base_keep.merge(weather_long[weather_cols], on="coord_id", how="left")
    out = out.drop(columns=["coord_id"])
    print(f"Length after base join (base x days): {len(out)}")
    return out


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


def _merge_and_score(config, df, species_params, zone_curves, main_data_path):
    today = pd.Timestamp(datetime.now().date())

    # NOTE: the Date=today override is intentionally GONE — dates are the real forecast dates.
    if "Wind Speed (m/s)" not in df.columns and "Wind Speed (kph)" in df.columns:
        df["Wind Speed (m/s)"] = df["Wind Speed (kph)"] / 3.6

    for specie in species_params:
        col = f"{specie}_score"
        if col not in df.columns:
            df[col] = pd.NA

    if remote_file_exists(main_data_path):
        existing_df = load_df_from_file(main_data_path)
        existing_df["Date"] = pd.to_datetime(existing_df["Date"])
        for col in existing_df.columns:
            if col not in df.columns:
                df[col] = pd.NA
        existing_cols = list(existing_df.columns)
        new_cols = [c for c in df.columns if c not in existing_cols]
        df = df[existing_cols + new_cols]
        df = replace_missing_elevation_from_previous_data(df, existing_df)
        df = replace_missing_elevation_with_closest(df)
        combined_df = merge_master(existing_df, df)
    else:
        df = replace_missing_elevation_with_closest(df)
        combined_df = df.copy()
        combined_df["Date"] = pd.to_datetime(combined_df["Date"])
        combined_df = combined_df.drop_duplicates(subset=["Location_Id", "Date"], keep="last").reset_index(drop=True)

    combined_df = combined_df[np.isfinite(combined_df["Latitude"]) & np.isfinite(combined_df["Longitude"])]
    combined_df = combined_df[combined_df["Location_Id"] != ""]

    assert_window_contiguous(combined_df, today, forward_days=FORECAST_DAYS, lookback=config.lag_days)

    combined_df = combined_df.sort_values(["Location_Id", "Date"])
    lag_columns = ["Temperature (C)", "TotalPrecipitation_mm", "Pressure (hPa)", "Humidity (%)"]
    lagged = compute_lag_features(combined_df.copy(), lag_columns, days=config.lag_days)

    mask = forward_window_mask(lagged, today)
    forward = lagged[mask].copy()
    print(f"Scoring {len(forward)} forward rows (Date >= {today.date()}) "
          f"across {forward['Location_Id'].nunique()} locations")
    forward = calculate_mushroom_score(forward, species_params, zone_curves)

    score_cols = [f"{s}_score" for s in species_params]
    updated_df = apply_forward_scores(combined_df, forward, score_cols)

    cutoff_date = datetime.now() - timedelta(days=config.cutoff_days)
    updated_df = updated_df[updated_df["Date"] > cutoff_date]

    valid_score_columns = {f"{s}_score" for s in species_params}
    species_score_columns = [c for c in updated_df.columns if c.endswith("_score") and c in valid_score_columns]
    updated_df[species_score_columns] = updated_df[species_score_columns].mask(
        updated_df[species_score_columns] > 9.5, 10).round(2)

    masterfile_columns = [
        "Location_Id", "Date", "Latitude", "Longitude", "Elevation (m)",
        "Pressure (hPa)", "TotalPrecipitation_mm", "Humidity (%)", "Wind Speed (m/s)",
        "Description", "Temperature (C) Max", "Temperature (C) Min", "Temperature (C)",
        "dist_m_water", "dist_m_sea", "climate_zone", "ph_level",
    ]
    updated_df = updated_df.reindex(columns=masterfile_columns + species_score_columns)
    return updated_df
