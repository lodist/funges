from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
from io import StringIO, BytesIO
from urllib.parse import urlparse
import os, json, time, math
from pathlib import Path
import boto3
import requests
import numpy as np
import pandas as pd
from shapely.ops import unary_union
from shapely.geometry import shape, Point
from scipy.spatial import cKDTree

print(f"Script started at {datetime.now()}")

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

_ROOT = Path(__file__).resolve().parents[3]
load_dotenv(_ROOT / ".env")
load_dotenv(_ROOT / ".env.secret")

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

geojson_path          = get_required_env("USW_BOUNDARIES_DATA")
coordinates_file_path = get_required_env("USW_UNIQUE_COORDINATES")
base_file_path        = get_required_env("USW_BASE_DATA")
species_params_path   = get_required_env("USW_SPECIES_PARAMS")
main_data_path        = get_required_env("USW_WEATHER_DATA")
static_info_path      = get_required_env("US_STATIC_INFO")

NDP = 3  # decimals to keep (≈100–120 m)

lat_start, lat_end = 33.0, 49.5
lon_start, lon_end = -125.5, -81.5
lat_step = 0.060
lon_step = 0.075

# WeatherAPI
base_url = "https://api.weatherapi.com/v1/history.json"
# base_url = "https://api.weatherapi.com/v1/forecast.json"
api_key  = get_required_env("WEATHERAPI_KEY")

# LOAD species_params (exec)
if is_remote_path(species_params_path):
    code = r2_fetch(species_params_path)
else:
    with open(species_params_path, "r", encoding="utf-8") as f:
        code = f.read()
species_params = {}
exec(code, globals())

# STATIC INFO (pre-index for O(1) lookup)
static_df = read_df_from_source(static_info_path)
static_df['Latitude']  = static_df['Latitude'].astype(float)
static_df['Longitude'] = static_df['Longitude'].astype(float)

static_df['_latr'] = static_df['Latitude'].round(NDP)
static_df['_lonr'] = static_df['Longitude'].round(NDP)

# Keep same behavior as values[0] by dropping duplicate keys and keeping first
static_df = static_df.drop_duplicates(subset=['_latr', '_lonr'], keep='first')

static_map = static_df.set_index(['_latr', '_lonr'])[
    ['Altitude', 'dist_m_water', 'dist_m_sea', 'climate_zone', 'ph_level']
]

# COORDS UTIL
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

# LOAD OR BUILD COORDS
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

print(f"Final number of coordinates: {len(coordinates)}")


# WEATHER FETCH
def fetch_weather_data(lat, lon, retries=4):
    date_str = (datetime.today() - timedelta(days=1)).strftime("%Y-%m-%d")
    params = {"key": api_key, "q": f"{lat},{lon}", "dt": date_str}

    for attempt in range(retries):
        try:
            resp = requests.get(base_url, params=params, timeout=(5, 12))
            if resp.status_code == 200:
                return resp.json()
            print(f"[{lat},{lon}] bad status {resp.status_code}")
            return None
        except requests.RequestException as e:
            if attempt < retries - 1:
                time.sleep(1)
                continue
            print(f"[{lat},{lon}] request error after {retries} tries: {e}")
            return None

def process_coordinate(coord):
    lat, lon = map(float, coord)
    lat_r, lon_r = round(lat, NDP), round(lon, NDP)

    weather = fetch_weather_data(lat_r, lon_r)
    if not weather:
        return None

    # static lookup
    try:
        srow = static_map.loc[(lat_r, lon_r)]
        if isinstance(srow, pd.DataFrame):  # duplicate index -> multiple rows
            srow = srow.iloc[0]

        elevation, dist_m_water, dist_m_sea, climate_zone, ph_level = (
            float(srow['Altitude'])      if pd.notna(srow['Altitude'])      else None,
            float(srow['dist_m_water'])  if pd.notna(srow['dist_m_water'])  else None,
            float(srow['dist_m_sea'])    if pd.notna(srow['dist_m_sea'])    else None,
            srow['climate_zone'],
            float(srow['ph_level'])      if pd.notna(srow['ph_level'])      else None,
        )
    except KeyError:
        elevation = dist_m_water = dist_m_sea = climate_zone = ph_level = None

    forecast = weather.get('forecast', {}).get('forecastday', [{}])[0]
    day = forecast.get('day', {}) or {}
    hours = forecast.get('hour', []) or []

    pressure_mb = None
    if hours:
        vals = [h.get('pressure_mb') for h in hours if h.get('pressure_mb') is not None]
        if vals:
            pressure_mb = float(np.mean(vals))

    place = weather.get('location', {}).get('name', 'NA')
    loc_key = f"{lat_r:.{NDP}f}_{lon_r:.{NDP}f}"

    return {
        'Date': forecast.get('date'),
        'Location_Id': f"{place}_{loc_key}",
        'Latitude': lat_r,
        'Longitude': lon_r,
        'Elevation (m)': elevation,
        'dist_m_water': dist_m_water,
        'dist_m_sea': dist_m_sea,
        'climate_zone': climate_zone,
        'Temperature (C) Max': day.get('maxtemp_c'),
        'Temperature (C) Min': day.get('mintemp_c'),
        'Temperature (C)': day.get('avgtemp_c'),
        'Wind Speed (kph)': day.get('maxwind_kph'),
        'Pressure (hPa)': pressure_mb,
        'Humidity (%)': day.get('avghumidity'),
        'Description': (day.get('condition') or {}).get('text'),
        'TotalPrecipitation_mm': day.get('totalprecip_mm', 0),
        'ph_level': ph_level
    }

print(f"Started API calls at {datetime.now()}")

rows = []
with ThreadPoolExecutor(max_workers=3) as ex:
    futures = [ex.submit(process_coordinate, coord) for coord in coordinates]
    processed = 0
    for f in as_completed(futures):
        try:
            r = f.result()
            if r is not None:
                rows.append(r)
        except Exception as e:
            print(f"[Warning] Skipping failed/stuck coordinate: {e}")
        processed += 1
        if processed % 100 == 0:
            print(f"{processed} coordinates processed...")

weather_df = pd.DataFrame(rows)
print(f"Length of weather_df: {len(weather_df)}")

# BASE LOGIC
base_df = read_df_from_source(base_file_path)

weather_columns = [
    'Temperature (C) Max', 'Temperature (C) Min', 'Temperature (C)',
    'Wind Speed (kph)', 'Pressure (hPa)', 'TotalPrecipitation_mm', 'Humidity (%)', 'Description',
    'dist_m_water', 'dist_m_sea', 'climate_zone', 'ph_level', 'Elevation (m)'
]

weather_coords = weather_df[['Latitude', 'Longitude']].to_numpy()
tree = cKDTree(weather_coords)

base_coords = base_df[['Latitude', 'Longitude']].to_numpy()
distances, indices = tree.query(base_coords)

matched_weather = weather_df.iloc[indices].reset_index(drop=True)
for col in weather_columns:
    base_df[col] = matched_weather[col].values

weather_df = base_df  # final enriched DF

# ELEVATION FILL
def compute_distance(lat1, lon1, lat2, lon2):
    lat1, lon1, lat2, lon2 = map(np.radians, [lat1, lon1, lat2, lon2])
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = np.sin(dlat/2)**2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon/2)**2
    c = 2 * np.arctan2(np.sqrt(a), np.sqrt(1-a))
    return 6371.01 * c  # km

def replace_missing_elevation_with_closest(df):
    known = df[df['Elevation (m)'].notna()]
    if known.empty: 
        return df
    for idx, row in df[df['Elevation (m)'].isna()].iterrows():
        d = known.apply(
            lambda x: compute_distance(row['Latitude'], row['Longitude'], x['Latitude'], x['Longitude']),
            axis=1
        )
        df.at[idx, 'Elevation (m)'] = known.at[d.idxmin(), 'Elevation (m)']
    return df

def replace_missing_elevation_from_previous_data(new_df, existing_df):
    if existing_df is None or existing_df.empty:
        return new_df
    for idx in new_df[new_df['Elevation (m)'].isna()].index:
        prev = existing_df.loc[
            existing_df['Location_Id'] == new_df.at[idx, 'Location_Id'],
            'Elevation (m)'
        ].max()
        new_df.at[idx, 'Elevation (m)'] = prev
    return new_df

df = weather_df

# Overwrite Date to "today"
current_date = datetime.now().date()
df['Date'] = current_date

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

if remote_file_exists(main_data_path):
    existing_df = load_df_from_file(main_data_path)
    print("Existing DataFrame Columns:", list(existing_df.columns))

    if 'Wind Speed (m/s)' not in df.columns and 'Wind Speed (kph)' in df.columns:
        df['Wind Speed (m/s)'] = df['Wind Speed (kph)'] / 3.6
        print("Converted 'Wind Speed (kph)' to 'Wind Speed (m/s)'.")

    for specie in species_params:
        col = f"{specie}_score"
        if col not in df.columns:
            df[col] = pd.NA

    for col in existing_df.columns:
        if col not in df.columns:
            df[col] = pd.NA

    existing_cols = list(existing_df.columns)
    new_cols = [c for c in df.columns if c not in existing_cols]
    df = df[existing_cols + new_cols]

    df = replace_missing_elevation_from_previous_data(df, existing_df)
    df = replace_missing_elevation_with_closest(df)

    combined_df = pd.concat([existing_df, df], ignore_index=True)
    print("DataFrames successfully concatenated.")
else:
    print("File does not exist. Proceeding with the new DataFrame only.")
    if 'Wind Speed (m/s)' not in df.columns and 'Wind Speed (kph)' in df.columns:
        df['Wind Speed (m/s)'] = df['Wind Speed (kph)'] / 3.6
        print("Converted 'Wind Speed (kph)' to 'Wind Speed (m/s)'.")

    for specie in species_params:
        col = f"{specie}_score"
        if col not in df.columns:
            df[col] = pd.NA

    combined_df = df

combined_df = combined_df[np.isfinite(combined_df['Latitude']) & np.isfinite(combined_df['Longitude'])]

# SCORING
def gaussian(x, mu, sig):
    return np.exp(-np.power(x - mu, 2.) / (2 * np.power(sig, 2.)))

def compute_lag_features(df, columns, days):
    df = df.sort_values(by=["Location_Id", "Date"], ascending=[True, True])
    for day in range(1, days + 1):
        for col in columns:
            df[f"{col}_{day}days_ago"] = df.groupby("Location_Id")[col].shift(day)
    return df

def altitude_score(x, optimal_alt=1150, alt_sigma=600):
    return gaussian(x, optimal_alt, alt_sigma)

df = combined_df
df['Date'] = pd.to_datetime(df['Date'])
df = df.sort_values(by=['Location_Id', 'Date'], ascending=[True, False])
df_original = df.copy()

lag_columns = ['Temperature (C)', 'TotalPrecipitation_mm', 'Pressure (hPa)', 'Humidity (%)']
df = compute_lag_features(df, lag_columns, days=21)

def calculate_mushroom_score(df, species_params):
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

        dl_start_pct = min(0.85, 0.72 + 0.001 * _ct)
        dl_floor     = 0.05
        dl_gamma     = 2.0

        wet_day_mm_ref = np.clip(12.0 - 0.2 * cum_thr, 4.5, 12.0)
        max_wet_eff = int(np.clip(np.ceil(cum_thr / max(wet_day_mm_ref, 1e-9)), 1, max(1, int(0.55 * baseline_days))))
        min_dry_eff = int(np.clip(np.round(0.5 * (baseline_days - max_wet_eff)), 1, max(1, int(0.6 * baseline_days))))

        def _weather_row(r):
            if lag_days == 0:
                hist = np.empty(0, dtype=float)
            else:
                arr = r[precip_hist_cols].to_numpy(float)
                hist = np.where(np.isfinite(arr), np.clip(arr, 0.0, None), 0.0)

            hist_days = hist.size
            wet_mask  = (hist >= min_p)
            wet_count = int(wet_mask.sum())
            dry_count = int(hist_days - wet_count)
            req_dry   = (min_dry_eff if hist_days >= baseline_days else math.ceil(min_dry_eff * (hist_days / baseline_days)))

            today_p = r['TotalPrecipitation_mm']
            day_ok  = 1.0 if (np.isfinite(today_p) and (today_p >= min_p)) else 0.0

            if cum_thr <= 0:
                cum_frac = 1.0
            else:
                scale = (hist_days / baseline_days) if hist_days > 0 else 0.0
                adj_thr = max(cum_thr * scale, 1e-9)
                cum_frac = float(min(1.0, (float(hist.sum()) if hist_days else 0.0) / adj_thr))

            if wet_count == 0:
                wet_factor = 0.0
            elif wet_count <= max_wet_eff:
                wet_factor = 1.0
            else:
                wet_factor = max(0.0, 1.0 - 0.15 * (wet_count - max_wet_eff))

            cum_mm  = float(hist.sum()) if hist_days else 0.0
            scale   = (hist_days / baseline_days) if hist_days else 0.0
            adj_thr = max(cum_thr * scale, 1e-9)
            cum_frac = min(1.0, cum_mm / adj_thr)

            ratio = cum_mm / adj_thr
            flood_pen = 1.0 if ratio <= 4 else 1.0 / (1.0 + 1.25 * (ratio - 4))

            raw = (
                0.20 * wet_factor +
                0.15 * (dry_count >= req_dry) +
                0.05 * day_ok +
                0.60 * (cum_frac * flood_pen)
            )

            if rain_first:
                if hist_days >= 10:
                    wet_early  = (hist[6:10] >= min_p).mean()
                    dry_recent = (hist[0:4] <  min_p).mean()
                elif hist_days >= 4:
                    wet_early  = (hist[-4:] >= min_p).mean()
                    dry_recent = (hist[0:4]  <  min_p).mean()
                else:
                    wet_early = dry_recent = 0.0
                raw = min(1.0, raw + 0.25 * float(wet_early * dry_recent))

            if hist_days:
                days_since_wet = (int(np.where(wet_mask)[0][0]) + 1) if wet_mask.any() else (hist_days + 1)
            else:
                days_since_wet = 0
            if not (np.isfinite(today_p) and today_p >= min_p):
                days_since_wet += 1

            pos = min(1.0, float(days_since_wet) / baseline_days)
            if pos > dl_start_pct:
                t = (pos - dl_start_pct) / max(1e-9, (1.0 - dl_start_pct))
                raw *= (1.0 - (1.0 - dl_floor) * (t ** dl_gamma))
            raw = min(1.0, raw)

            sig = 1.0 / (1.0 + np.exp(-drought_k * (cum_frac - drought_mid)))
            drought_mult = drought_floor + (1.0 - drought_floor) * sig
            if wet_count == 0:
                drought_mult *= no_wet_penalty

            return float(np.clip(raw * drought_mult, weather_eps, 1.0))

        df[f'{specie}_Weather_Score'] = df.apply(_weather_row, axis=1)

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
            temp_score = sum(
                w * df.get(f'Temperature (C)_{d}days_ago', df['Temperature (C)'])
                    .fillna(df['Temperature (C)'])
                    .apply(lambda x: gaussian(x, optimal_temp, temp_sigma))
                for d, w in enumerate(temp_weights, start=1)
            )
        else:
            temp_score = df['Temperature (C)'].apply(lambda x: gaussian(x, optimal_temp, temp_sigma))

        if hum_days > 0:
            dH = np.arange(1, hum_days + 1)
            hum_weights = 0.6 * np.exp(-0.5 * ((dH - 9) / 5.0)**2) + 0.4 * np.exp(-0.05 * dH)
            hum_weights /= hum_weights.sum()
            humidity_score = sum(
                w * df.get(f'Humidity (%)_{d}days_ago', df['Humidity (%)'])
                    .fillna(df['Humidity (%)'])
                    .apply(lambda x: gaussian(x, optimal_humidity, humidity_sigma))
                for d, w in enumerate(hum_weights, start=1)
            )
        else:
            humidity_score = df['Humidity (%)'].apply(lambda x: gaussian(x, optimal_humidity, humidity_sigma))

        df[f'{specie}_Temp_Score'], df[f'{specie}_Humidity_Score'] = temp_score.clip(0, 1), humidity_score.clip(0, 1)
        df[f'{specie}_Alt_Score'] = df['Elevation (m)'].apply(lambda x: altitude_score(x, optimal_alt, alt_sigma)).clip(0, 1)

        df[f'{specie}_PH_Score'] = df['ph_level'].apply(
            lambda x: np.exp(-((x - optimal_pH) ** 2) / (2 * (pH_sigma_near if pH_range_near[0] <= x <= pH_range_near[1] else pH_sigma_far) ** 2))
            if not np.isnan(x) else 0
        )

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

        #weight of single scores
        wT, wH, wW, wA, wPH = 1.75, 1.5, 1.25, 0.75, 1.0
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

        if "season_months" in params:
            ramp_days = 31
            allowed_months = set(params["season_months"])
            in_season = df['Date'].dt.month.isin(allowed_months)
            day_of_year = df['Date'].dt.dayofyear
            valid_days = np.concatenate([
                pd.date_range(f'2021-{m:02d}-01', f'2021-{m:02d}-{pd.Period(f"2021-{m:02d}").days_in_month}')
                  .dayofyear.to_numpy()
                for m in sorted(allowed_months)
            ])
            dist = np.minimum(
                np.abs(day_of_year.values[:, None] - valid_days[None, :]),
                365 - np.abs(day_of_year.values[:, None] - valid_days[None, :])
            ).min(axis=1)
            factor = params.get("season_factor", 0.5)
            df[f'{specie}_score'] *= np.where(in_season, 1, np.clip(1 - (1 - factor) * dist / ramp_days, factor, 1))

        df.drop(columns=[
            f'{specie}_Temp_Score',
            f'{specie}_Alt_Score',
            f'{specie}_Humidity_Score',
            f'{specie}_PH_Score'
        ], inplace=True)

    return df

latest_idx = df.groupby('Location_Id')['Date'].idxmax()
latest_df = df.loc[latest_idx, :]
latest_df = calculate_mushroom_score(latest_df, species_params)

df_original.set_index(['Location_Id', 'Date'], inplace=True)
latest_df.set_index(['Location_Id', 'Date'], inplace=True)
df_original = df_original.drop(latest_df.index)

for col in latest_df.columns:
    if col.endswith('_score') and col not in df_original.columns:
        df_original[col] = pd.NA

updated_df = pd.concat([df_original, latest_df]).reset_index()

print(f'len of dataset before: {len(updated_df)}')
updated_df = updated_df[updated_df['Location_Id'] != '']
print(f'len of dataset after: {len(updated_df)}')

cutoff_date = datetime.now() - timedelta(days=35)
updated_df = updated_df[updated_df['Date'] > cutoff_date]

species_score_columns = [c for c in updated_df.columns if c.endswith('_score')]
updated_df[species_score_columns] = updated_df[species_score_columns].mask(updated_df[species_score_columns] > 9.5, 10).round(2)

masterfile_columns = [
    'Location_Id', 'Date', 'Latitude', 'Longitude', 'Elevation (m)',
    'Pressure (hPa)', 'TotalPrecipitation_mm', 'Humidity (%)', 'Wind Speed (m/s)',
    'Description', 'Temperature (C) Max', 'Temperature (C) Min', 'Temperature (C)',
    'dist_m_water', 'dist_m_sea', 'climate_zone', 'ph_level'
]

columns_order = masterfile_columns + species_score_columns
updated_df = updated_df.reindex(columns=columns_order)

save_df_to_file(updated_df, main_data_path)

print(f"Script ended at {datetime.now()}")