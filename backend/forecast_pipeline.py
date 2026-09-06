"""Shared rolling-forecast scoring pipeline for the regional scripts.

One WeatherAPI forecast.json call per coordinate returns up to 7 forecast days
(billed as ONE call). We emit one dated row per forecast day, so the master time
series gains [today .. today+6] each run. Overlapping future dates are replaced by
the fresher forecast on the next run; the day that rolls out of the window freezes.
"""
from concurrent.futures import ThreadPoolExecutor, as_completed
from contextlib import contextmanager
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
import tempfile

import boto3
import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.parquet as pq
import requests
from shapely.ops import unary_union
from shapely.geometry import shape, Point

sys.path.insert(0, str(Path(__file__).resolve().parent))  # backend/ for seasonality
from seasonality import normalize_curve, season_gate_for_species, season_multiplier_for_species
from species_registry import get_species_params

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
    region: str
    boundaries_env: str
    coordinates_env: str
    base_env: str
    weather_data_env: str
    static_info_env: str
    season_curves_env: str
    zone_curves_env: str
    lat_range: tuple
    lon_range: tuple
    lat_step: float = 0.060
    lon_step: float = 0.075
    ndp: int = 3
    # Rain/soil moisture has a materially longer memory than temperature. The
    # scoring helpers still cap temperature at 12 days and humidity at 21 days.
    lag_days: int = 42
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


def _r2_client():
    return boto3.client(
        's3',
        endpoint_url=get_required_env("R2_ENDPOINT_URL"),
        aws_access_key_id=get_required_env("R2_ACCESS_KEY_ID"),
        aws_secret_access_key=get_required_env("R2_SECRET_ACCESS_KEY")
    )


def _r2_key(url):
    return urlparse(url).path.lstrip('/')


@contextmanager
def _local_parquet_source(path):
    """Yield a seekable local parquet path without holding a remote object in RAM."""
    if not is_remote_path(path):
        yield Path(path)
        return

    fd, temp_name = tempfile.mkstemp(suffix=".parquet")
    os.close(fd)
    try:
        _r2_client().download_file(
            get_required_env("R2_BUCKET_NAME"), _r2_key(path), temp_name
        )
        yield Path(temp_name)
    finally:
        Path(temp_name).unlink(missing_ok=True)


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


def _arrow_date_mask(table, *, after=None, before=None):
    """Build a date mask after normalizing parquet date-like values to timestamps."""
    dates = pc.cast(table["Date"], pa.timestamp("ns"))
    mask = pc.is_valid(dates)
    if after is not None:
        mask = pc.and_(mask, pc.greater(dates, pa.scalar(pd.Timestamp(after).to_datetime64())))
    if before is not None:
        mask = pc.and_(mask, pc.less(dates, pa.scalar(pd.Timestamp(before).to_datetime64())))
    return mask


def _row_group_may_overlap(parquet_file, row_group, *, after=None, before=None):
    """Use Date statistics to avoid decoding row groups outside the requested range."""
    date_index = parquet_file.schema_arrow.get_field_index("Date")
    if date_index < 0:
        raise ValueError("Master parquet has no Date column")
    stats = parquet_file.metadata.row_group(row_group).column(date_index).statistics
    if stats is None or not stats.has_min_max:
        return True
    minimum, maximum = pd.Timestamp(stats.min), pd.Timestamp(stats.max)
    if after is not None and maximum <= pd.Timestamp(after):
        return False
    if before is not None and minimum >= pd.Timestamp(before):
        return False
    return True


def _read_recent_parquet(path, split_date):
    """Read only the mutable lag/forecast tail into pandas, pruning frozen row
    groups by their Date statistics."""
    parquet_file = pq.ParquetFile(path)
    pieces = []
    lower_bound = pd.Timestamp(split_date) - pd.Timedelta(nanoseconds=1)
    for row_group in range(parquet_file.num_row_groups):
        if not _row_group_may_overlap(
                parquet_file, row_group, after=lower_bound):
            continue
        for batch in parquet_file.iter_batches(
                row_groups=[row_group], batch_size=131_072):
            table = pa.Table.from_batches([batch])
            selected = table.filter(_arrow_date_mask(table, after=lower_bound))
            if len(selected):
                pieces.append(selected)
    if not pieces:
        return parquet_file.schema_arrow.empty_table().to_pandas()
    combined = pa.concat_tables(pieces)
    pieces.clear()
    return combined.to_pandas(split_blocks=True, self_destruct=True)


def _table_with_schema(table, schema):
    """Add/drop/cast streamed columns to the newly scored master schema."""
    arrays = []
    for field in schema:
        if field.name not in table.column_names:
            arrays.append(pa.nulls(len(table), type=field.type))
            continue
        column = table[field.name]
        if column.type != field.type:
            column = pc.cast(column, field.type, safe=False)
        arrays.append(column)
    return pa.Table.from_arrays(arrays, schema=schema)


# Per-date groups instead cost 38% file size: one dictionary of all ~101k ids each.
ROW_GROUP_ROWS = 1_000_000


def _resolve_output_schema(source_path, tail):
    """Columns from the tail, types unified with the source: a tail-only schema
    truncates history when a column happens to infer as int64 (1.7 -> 1)."""
    tail_schema = pa.Schema.from_pandas(tail, preserve_index=False)
    if source_path is None:
        return tail_schema
    source_schema = pq.ParquetFile(source_path).schema_arrow
    fields = []
    for field in tail_schema:
        index = source_schema.get_field_index(field.name)
        if index < 0 or source_schema.field(index).type == field.type:
            fields.append(field)
            continue
        unified = pa.unify_schemas(
            [pa.schema([source_schema.field(index)]), pa.schema([field])],
            promote_options="permissive",
        )
        fields.append(unified.field(0))
    return pa.schema(fields)


def _write_streaming_parquet(source_path, output_path, updated_tail, split_date,
                             cutoff_date):
    """Write frozen history batchwise, then append the rebuilt mutable tail."""
    tail = updated_tail.sort_values(["Location_Id", "Date"]).reset_index(drop=True)
    schema = _resolve_output_schema(source_path, tail)

    with pq.ParquetWriter(output_path, schema, compression="snappy") as writer:
        if source_path is not None:
            pending, pending_rows = [], 0

            def flush_frozen():
                nonlocal pending, pending_rows
                if pending_rows:
                    writer.write_table(pa.concat_tables(pending),
                                       row_group_size=ROW_GROUP_ROWS)
                pending, pending_rows = [], 0

            parquet_file = pq.ParquetFile(source_path)
            for row_group in range(parquet_file.num_row_groups):
                if not _row_group_may_overlap(
                        parquet_file, row_group, after=cutoff_date, before=split_date):
                    continue
                for batch in parquet_file.iter_batches(
                        row_groups=[row_group], batch_size=131_072):
                    table = pa.Table.from_batches([batch])
                    table = table.filter(_arrow_date_mask(
                        table, after=cutoff_date, before=split_date))
                    if len(table):
                        pending.append(_table_with_schema(table, schema))
                        pending_rows += len(table)
                        if pending_rows >= ROW_GROUP_ROWS:
                            flush_frozen()
            flush_frozen()

        # Sliced: one Arrow copy of the whole tail is a multi-GB allocation.
        for start in range(0, len(tail), ROW_GROUP_ROWS):
            chunk = tail.iloc[start:start + ROW_GROUP_ROWS]
            writer.write_table(
                pa.Table.from_pandas(chunk, schema=schema, preserve_index=False),
                row_group_size=ROW_GROUP_ROWS,
            )


def _publish_parquet_file(local_path, destination):
    """Publish a completed local parquet without materializing its bytes in Python."""
    if is_remote_path(destination):
        _r2_client().upload_file(
            str(local_path), get_required_env("R2_BUCKET_NAME"), _r2_key(destination),
            ExtraArgs={"ContentType": "application/octet-stream"},
        )
        print(f"Uploaded to R2: {destination}")
    else:
        os.replace(local_path, destination)


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


def humidity_suitability(x, saturation, sigma):
    """Score humidity as a deficit curve with no penalty above saturation.

    Below the species threshold this is the same Gaussian used previously.
    At or above the threshold, additional humidity remains fully suitable.
    """
    values = np.asarray(x, dtype=float)
    deficit = np.minimum(values - saturation, 0.0)
    return np.exp(-np.power(deficit, 2.0) / (2 * np.power(sigma, 2.0)))


def compute_lag_features(df, columns, days, target=None):
    """`target`, if given, is the subset the lag columns are attached to; the values
    are still looked up across all of `df`, so those rows are unchanged."""
    df = df.sort_values(by=["Location_Id", "Date"], ascending=[True, True])
    # Lags are keyed on the calendar date, not on row position: a row's "N days ago"
    # value is taken from the row at exactly Date - N days for the same Location_Id
    # (NaN if that day is absent). This prevents missing days in the daily history
    # from silently stretching the lookback window. Duplicate (Location_Id, Date)
    # pairs collapse to their last value so the lookup stays uniquely indexed.
    lookups = {col: df.groupby(["Location_Id", "Date"])[col].last() for col in columns}
    out = df if target is None else target.sort_values(
        by=["Location_Id", "Date"], ascending=[True, True]).copy()
    locs = out["Location_Id"].to_numpy()
    for day in range(1, days + 1):
        target_idx = pd.MultiIndex.from_arrays(
            [locs, (out["Date"] - pd.Timedelta(days=day)).to_numpy()]
        )
        for col in columns:
            out[f"{col}_{day}days_ago"] = lookups[col].reindex(target_idx).to_numpy()
    return out


def compute_lag_features_by_coord(df, columns, days, coord_lat="_coord_lat", coord_lon="_coord_lon",
                                  target=None):
    """Same lag columns as compute_lag_features, but computed ONCE per (coord, Date)
    and broadcast to every base point of that coord — not once per base point.

    Valid because the lag columns are weather fields, which _fetch_all attaches per
    fetched coord, so they are identical across a coord's base points. The per-coord
    representative therefore equals each base point's own value, making the result
    bit-identical to the per-base computation while doing ~base/coord times less work.

    Every row must carry a non-null coord key; callers fall back to compute_lag_features
    when that does not hold. `target` behaves as in compute_lag_features.
    """
    key = df[coord_lat].astype(str) + "_" + df[coord_lon].astype(str)
    coord_series = df.assign(_coord_key=key)[["_coord_key", "Date"] + columns]
    coord_series = (coord_series.drop_duplicates(["_coord_key", "Date"], keep="last")
                                .rename(columns={"_coord_key": "Location_Id"}))
    coord_lagged = compute_lag_features(coord_series, columns, days)

    lag_cols = [f"{c}_{d}days_ago" for c in columns for d in range(1, days + 1)]
    coord_lagged = coord_lagged.rename(columns={"Location_Id": "_coord_key"})[["_coord_key", "Date"] + lag_cols]

    if target is None:
        dst, dst_key = df, key
    else:
        dst = target
        dst_key = target[coord_lat].astype(str) + "_" + target[coord_lon].astype(str)
    out = dst.assign(_coord_key=dst_key).merge(coord_lagged, on=["_coord_key", "Date"], how="left")
    return out.drop(columns=["_coord_key", coord_lat, coord_lon])


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


def _lag_matrix(df, base_col, days):
    """Return lag values ordered from yesterday backwards."""
    values = []
    for day in range(1, days + 1):
        col = f"{base_col}_{day}days_ago"
        if col in df.columns:
            values.append(pd.to_numeric(df[col], errors="coerce").to_numpy(float))
        else:
            values.append(np.full(len(df), np.nan, dtype=float))
    return np.column_stack(values) if values else np.empty((len(df), 0), dtype=float)


def _moisture_memory_score(df, *, cumulative_rain_target, rain_first):
    """Estimate available moisture over 7, 21 and 42-day horizons."""
    windows = (7, 21, 42)
    max_days = max(windows)
    rain = np.nan_to_num(_lag_matrix(df, "TotalPrecipitation_mm", max_days), nan=0.0)
    rain = np.clip(rain, 0.0, None)
    temp = _lag_matrix(df, "Temperature (C)", max_days)
    humidity = _lag_matrix(df, "Humidity (%)", max_days)
    wind = _lag_matrix(df, "Wind Speed (m/s)", max_days)

    # Missing historical weather uses neutral values rather than inventing drought.
    temp = np.where(np.isfinite(temp), temp, 10.0)
    humidity = np.where(np.isfinite(humidity), humidity, 70.0)
    wind = np.where(np.isfinite(wind), wind, 3.0)
    drying = (
        0.08 * np.maximum(temp - 10.0, 0.0)
        + 0.025 * np.maximum(70.0 - humidity, 0.0)
        + 0.12 * np.maximum(wind - 3.0, 0.0)
    )
    drying = np.clip(drying, 0.0, 4.0)

    target = max(float(cumulative_rain_target), 1.0)
    ratios = []
    for days in windows:
        # Longer horizons represent stored soil moisture and need less than a
        # linear multiple of the old 21-day rainfall threshold.
        horizon_target = target * (days / 21.0) ** 0.75
        balance = rain[:, :days].sum(axis=1) - 0.35 * drying[:, :days].sum(axis=1)
        ratios.append(np.clip(np.maximum(balance, 0.0) / horizon_target, 0.0, 1.0))
    ratios = np.vstack(ratios)

    weighted = np.average(ratios, axis=0, weights=np.array([0.30, 0.45, 0.25]))
    moisture = 0.65 * weighted + 0.35 * ratios.max(axis=0)

    if rain_first:
        trigger = np.clip(
            rain[:, 4:12].sum(axis=1) / max(target * 0.35, 1.0), 0.0, 1.0
        )
        recent_dry = np.clip(
            1.0 - rain[:, :4].sum(axis=1) / max(target * 0.15, 1.0), 0.0, 1.0
        )
        moisture = moisture + 0.12 * trigger * recent_dry

    return np.clip(moisture, 0.02, 1.0)


def _lagged_wind_factor(df, days=7, start=4.15, severe=12.0, floor=0.82):
    """Capped multiplicative wind effect based on prior days, never same-day wind."""
    history = _lag_matrix(df, "Wind Speed (m/s)", days)
    observed = np.isfinite(history)
    observed_count = observed.sum(axis=1)
    mean_wind = np.divide(
        np.nansum(history, axis=1),
        observed_count,
        out=np.full(len(df), start, dtype=float),
        where=observed_count > 0,
    )
    severity = np.clip((mean_wind - start) / max(severe - start, 1e-9), 0.0, 1.0)
    return np.clip(1.0 - (1.0 - floor) * severity, floor, 1.0)


def _hybrid_component_mean_rows(components, weights, geometric_share=1.0):
    """Weighted geometric mean of the components, with an optional arithmetic blend.

    The 0.02 component floor below is what stopped a drought-vetoed row collapsing to
    ~0.9/10: the previous code clipped at 1e-9, so a 1e-5 weather component survived the
    log. That floor is the fix. Blending in an arithmetic term on top (geometric_share
    < 1) lifts every score another ~25% at the veto end, which measurably raised
    out-of-season false positives while adding ~0.005 of season AUC -- so it defaults off.
    Left as a knob because it is the natural place to soften a veto if that is ever wanted.
    """
    comps = np.clip(np.asarray(components, float), 0.02, 1.0)
    weights = np.asarray(weights, float)
    active = weights > 0
    comps = comps[active]
    weights = weights[active]
    weight_sum = max(weights.sum(), 1e-9)
    geometric = np.exp(
        (weights[:, None] * np.log(comps)).sum(axis=0) / weight_sum
    )
    arithmetic = (weights[:, None] * comps).sum(axis=0) / weight_sum
    return geometric_share * geometric + (1.0 - geometric_share) * arithmetic


def spatial_smooth_scores(df, score_cols, *, neighbours=5, radius_km=30.0):
    """Smooth scores locally per date and attach coverage/disagreement confidence."""
    from scipy.spatial import cKDTree

    out = df.copy()
    earth_radius_km = 6371.0088
    for score_col in score_cols:
        out[f"{score_col[:-6]}_confidence"] = np.nan

    for _, index in out.groupby(pd.to_datetime(out["Date"]).dt.normalize()).groups.items():
        idx = np.asarray(list(index))
        lat = pd.to_numeric(out.loc[idx, "Latitude"], errors="coerce").to_numpy(float)
        lon = pd.to_numeric(out.loc[idx, "Longitude"], errors="coerce").to_numpy(float)
        valid_coord = np.isfinite(lat) & np.isfinite(lon)
        if not valid_coord.any():
            continue
        valid_idx = idx[valid_coord]
        xyz = _latlon_to_unit_xyz(lat[valid_coord], lon[valid_coord])
        k = min(neighbours, len(valid_idx))
        chord_dist, near = cKDTree(xyz).query(xyz, k=k)
        chord_dist = np.asarray(chord_dist).reshape(len(valid_idx), k)
        near = np.asarray(near).reshape(len(valid_idx), k)
        distances = 2.0 * earth_radius_km * np.arcsin(
            np.clip(chord_dist / 2.0, 0.0, 1.0)
        )
        in_radius = distances <= radius_km
        spatial_weights = np.exp(-((distances / 15.0) ** 2)) * in_radius

        for score_col in score_cols:
            values = pd.to_numeric(
                out.loc[valid_idx, score_col], errors="coerce"
            ).to_numpy(float)
            neighbour_values = values[near]
            usable = in_radius & np.isfinite(neighbour_values)
            weights = spatial_weights * usable
            weight_sum = weights.sum(axis=1)
            smoothed = np.divide(
                np.nansum(weights * neighbour_values, axis=1),
                weight_sum,
                out=values.copy(),
                where=weight_sum > 0,
            )
            out.loc[valid_idx, score_col] = smoothed

            count = usable.sum(axis=1)
            expected = max(1, min(neighbours, len(valid_idx)))
            coverage = count / expected
            mean_distance = np.divide(
                (distances * usable).sum(axis=1),
                count,
                out=np.full(len(valid_idx), radius_km),
                where=count > 0,
            )
            centred = neighbour_values - smoothed[:, None]
            variance = np.divide(
                np.nansum(weights * centred**2, axis=1),
                weight_sum,
                out=np.full(len(valid_idx), 4.0),
                where=weight_sum > 0,
            )
            agreement = np.exp(-np.sqrt(np.maximum(variance, 0.0)) / 2.0)
            confidence = coverage * np.exp(-mean_distance / radius_km) * agreement
            out.loc[valid_idx, f"{score_col[:-6]}_confidence"] = np.clip(
                confidence, 0.0, 1.0
            )
    return out


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


def _weighted_lag_humidity(df, base_col, n_days, weights, saturation, sigma):
    """Weighted lag score using the one-sided humidity deficit curve."""
    base = df[base_col]
    score = np.zeros(len(df), dtype=float)
    for i, d in enumerate(range(1, n_days + 1)):
        col = f"{base_col}_{d}days_ago"
        series = df[col] if col in df.columns else base
        vals = series.fillna(base).to_numpy(float)
        score = score + weights[i] * humidity_suitability(vals, saturation, sigma)
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
    if 'TotalPrecipitation_mm' not in df.columns:
        df['TotalPrecipitation_mm'] = np.nan
    wind_factor = _lagged_wind_factor(df)

    for specie, params in species_params.items():
        cum_thr = float(params.get('min_cumulative_rain', 20.0))
        rain_first = bool(params.get('weather_preference', {}).get('rain_first', False))
        df[f'{specie}_Weather_Score'] = _moisture_memory_score(
            df, cumulative_rain_target=cum_thr, rain_first=rain_first)

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
            humidity_score = _weighted_lag_humidity(
                df, 'Humidity (%)', hum_days, hum_weights, optimal_humidity, humidity_sigma)
        else:
            humidity_score = humidity_suitability(
                df['Humidity (%)'].to_numpy(float), optimal_humidity, humidity_sigma)

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

        #weight of single scores (rain weighted above humidity: it is the stronger growth/fruiting trigger)
        wT, wH, wW, wA, wPH = 1.75, 1.0, 1.5, 0.75, 1.0
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
            score_no_ph = 10 * _hybrid_component_mean_rows(comps_no_ph, weights_no_ph)

            comps_ph = np.vstack([
                df[f'{specie}_Temp_Score'].to_numpy(float),
                df[f'{specie}_Humidity_Score'].to_numpy(float),
                df[f'{specie}_Weather_Score'].to_numpy(float),
                df[f'{specie}_Alt_Score'].to_numpy(float),
                df[f'{specie}_PH_Score'].to_numpy(float),
                water_comp
            ])
            weights_ph = np.array([wT, wH, wW, wA, wPH, wWater], float)
            score_ph = 10 * _hybrid_component_mean_rows(comps_ph, weights_ph)

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
            df[f'{specie}_score'] = 10 * _hybrid_component_mean_rows(comps_ph, weights_ph)

        df[f'{specie}_score'] = df[f'{specie}_score'].clip(0, 10)
        if params.get("wind_sensitive", False):
            df[f'{specie}_score'] = (df[f'{specie}_score'] * wind_factor).clip(0, 10)

        allowed_climates = params.get("climate_zones", [])
        if allowed_climates:
            df.loc[~df['climate_zone'].isin(allowed_climates), f'{specie}_score'] = 0

        # Two separate jobs. The multiplier tilts the score across the season; the gate is
        # allowed to reach zero, which is the only way the model can say "not this month".
        df[f'{specie}_score'] *= season_multiplier_for_species(df, specie, params, zone_curves)
        df[f'{specie}_score'] *= season_gate_for_species(df, specie, params, zone_curves)

        df.drop(columns=[
            f'{specie}_Temp_Score',
            f'{specie}_Alt_Score',
            f'{specie}_Humidity_Score',
            f'{specie}_PH_Score'
        ], inplace=True)

    return df


# --- Loader helpers (wrap original top-of-script blocks) -------------------

def _load_species_and_curves(config):
    species_params = get_species_params(config.region)

    _curves_path = get_required_env(config.season_curves_env)
    try:
        _raw = r2_fetch(_curves_path).decode("utf-8") if is_remote_path(_curves_path) else Path(_curves_path).read_text(encoding="utf-8")
        _curves = json.loads(_raw)
        for _sp, _p in species_params.items():
            if _sp in _curves:
                _p["season_curve"] = normalize_curve(_curves[_sp])
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
                str(_z): {str(_sp): normalize_curve(_c) for _sp, _c in _spmap.items()}
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
    main_data_path = get_required_env(config.weather_data_env)
    static_info_path = get_required_env(config.static_info_env)

    species_params, zone_curves = _load_species_and_curves(config)
    static_map = _load_static_map(static_info_path, config.ndp)
    coordinates = _load_or_build_coords(config, coordinates_file_path, geojson_path)
    print(f"Final number of coordinates: {len(coordinates)}")

    counter = CallCounter()
    weather_long = _fetch_all(config, coordinates, static_map, api_key, counter)
    print(f"API calls made: {counter.count} for {len(coordinates)} coordinates")

    df = _join_to_base(config, weather_long, base_file_path)
    if str(main_data_path).endswith('.parquet'):
        update_parquet_master(config, df, species_params, zone_curves, main_data_path)
    else:
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
    """Map each base output point to its fetched coord, then expand to that coord's
    7 daily weather rows (a single vectorized merge).

    Fast path: if the base file carries baked `coord_lat`/`coord_lon` columns (the
    nearest fetched coord, precomputed once at build time via tools/bake_base_coord_keys.py),
    the assignment is a plain key merge — no per-run nearest-neighbour search. Any base
    row whose baked coord did NOT fetch this run (or any base lacking the columns) falls
    back to a KDTree query against the coords actually present, preserving the old
    reroute-to-nearest behaviour.
    """
    base_df = read_df_from_source(base_file_path).copy()
    ndp = config.ndp

    coord_keys = weather_long[["Latitude", "Longitude"]].drop_duplicates().reset_index(drop=True)
    coord_keys["coord_id"] = np.arange(len(coord_keys))
    weather_long = weather_long.merge(coord_keys, on=["Latitude", "Longitude"], how="left")

    base_df["coord_id"] = np.nan
    if {"coord_lat", "coord_lon"}.issubset(base_df.columns):
        key_to_id = (coord_keys.assign(
                        _clat=coord_keys["Latitude"].round(ndp),
                        _clon=coord_keys["Longitude"].round(ndp))
                     .drop_duplicates(["_clat", "_clon"])
                     .set_index(["_clat", "_clon"])["coord_id"])
        baked = pd.MultiIndex.from_arrays(
            [base_df["coord_lat"].round(ndp), base_df["coord_lon"].round(ndp)])
        base_df["coord_id"] = key_to_id.reindex(baked).to_numpy()

    missing = base_df["coord_id"].isna()
    if missing.any():
        from scipy.spatial import cKDTree
        tree = cKDTree(coord_keys[["Latitude", "Longitude"]].to_numpy())
        _, idx = tree.query(base_df.loc[missing, ["Latitude", "Longitude"]].to_numpy())
        base_df.loc[missing, "coord_id"] = coord_keys["coord_id"].to_numpy()[idx]
    base_df["coord_id"] = base_df["coord_id"].astype(int)

    # Emit the ACTUAL assigned coord (not the baked input, which may have been rerouted
    # for a missing fetch) so downstream lag dedup groups rows by the coord whose weather
    # they actually received. compute_lag_features_by_coord consumes these.
    cid = base_df["coord_id"].to_numpy()
    base_df["_coord_lat"] = coord_keys["Latitude"].to_numpy()[cid]
    base_df["_coord_lon"] = coord_keys["Longitude"].to_numpy()[cid]

    weather_cols = [
        "coord_id", "Date",
        "Temperature (C) Max", "Temperature (C) Min", "Temperature (C)",
        "Wind Speed (kph)", "Pressure (hPa)", "TotalPrecipitation_mm", "Humidity (%)",
        "Description", "dist_m_water", "dist_m_sea", "climate_zone", "ph_level",
        "Elevation (m)",
    ]
    drop_cols = [c for c in weather_cols if c in base_df.columns and c != "coord_id"]
    drop_cols += [c for c in ("coord_lat", "coord_lon") if c in base_df.columns]
    base_keep = base_df.drop(columns=drop_cols)
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


def _merge_and_score(config, df, species_params, zone_curves, main_data_path,
                     *, existing_df=None, existing_exists=None, cutoff_date=None):
    # Anchor "today" to the EARLIEST forecast date actually fetched (coordinate-local),
    # not the server clock: forecast.json returns each coord's local 7 days, so US
    # regions legitimately start a day behind a UTC/Europe runner. Using the server date
    # would mis-align the forward window and the contiguity guarantee for those regions.
    new_dates = pd.to_datetime(df["Date"])
    if new_dates.notna().any():
        today = new_dates.min().normalize()
    else:
        today = pd.Timestamp(datetime.now().date())

    # NOTE: the Date=today override is intentionally GONE — dates are the real forecast dates.
    if "Wind Speed (m/s)" not in df.columns and "Wind Speed (kph)" in df.columns:
        df["Wind Speed (m/s)"] = df["Wind Speed (kph)"] / 3.6

    for specie in species_params:
        col = f"{specie}_score"
        if col not in df.columns:
            df[col] = pd.NA

    if existing_exists is None:
        existing_exists = remote_file_exists(main_data_path)
    if existing_exists:
        if existing_df is None:
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
    lag_columns = ["Temperature (C)", "TotalPrecipitation_mm", "Pressure (hPa)",
                   "Humidity (%)", "Wind Speed (m/s)"]
    # Only the forward window (Date >= today) is rescored, and a forward row's deepest
    # lag reaches back exactly lag_days. So lag only [today - lag_days .. ]: frozen older
    # rows are never rescored and need no lag features. Bit-identical for forward rows
    # (every (loc, date-N) they reference is inside this slice), but far less data to
    # reindex when the master holds a year of history at base resolution.
    lag_start = today - pd.Timedelta(days=config.lag_days)
    lag_slice = combined_df[pd.to_datetime(combined_df["Date"]).dt.normalize() >= lag_start].copy()

    # Phase 2: weather (hence its lags) is identical across the base points that share a
    # fetched coord, so lag ONCE per coord and broadcast instead of once per base point.
    # The coord key (_coord_lat/_coord_lon) is carried from _join_to_base; history rows
    # (from the prior master) lack it, so re-derive it per base point via the current run's
    # Location_Id -> coord map. If any in-window row still has no coord key (un-baked base /
    # legacy), fall back to the per-base path, which is the original behaviour.
    if {"_coord_lat", "_coord_lon"}.issubset(df.columns):
        loc_to_coord = (df[["Location_Id", "_coord_lat", "_coord_lon"]]
                        .dropna(subset=["_coord_lat", "_coord_lon"])
                        .drop_duplicates("Location_Id").set_index("Location_Id"))
        lag_slice["_coord_lat"] = lag_slice["Location_Id"].map(loc_to_coord["_coord_lat"])
        lag_slice["_coord_lon"] = lag_slice["Location_Id"].map(loc_to_coord["_coord_lon"])
        can_dedup = lag_slice["_coord_lat"].notna().all() and lag_slice["_coord_lon"].notna().all()
    else:
        can_dedup = False

    # Lookups span the slice; the lag columns land only on the rows rescored below.
    fwd_mask = forward_window_mask(lag_slice, today)
    if can_dedup and len(lag_slice):
        forward = compute_lag_features_by_coord(
            lag_slice, lag_columns, days=config.lag_days, target=lag_slice[fwd_mask])
    else:
        _hist = lag_slice.drop(
            columns=[c for c in ("_coord_lat", "_coord_lon") if c in lag_slice.columns])
        forward = compute_lag_features(
            _hist, lag_columns, days=config.lag_days, target=_hist[fwd_mask])
        del _hist
    del lag_slice
    print(f"Scoring {len(forward)} forward rows (Date >= {today.date()}) "
          f"across {forward['Location_Id'].nunique()} locations")
    forward = calculate_mushroom_score(forward, species_params, zone_curves)

    score_cols = [f"{s}_score" for s in species_params]
    forward = spatial_smooth_scores(forward, score_cols)
    # Neighbour smoothing may cross a climate-zone boundary, but an explicit
    # species climate exclusion remains a hard constraint.
    for species, params in species_params.items():
        allowed_climates = params.get("climate_zones", [])
        if allowed_climates:
            forward.loc[
                ~forward["climate_zone"].isin(allowed_climates), f"{species}_score"
            ] = 0.0
    confidence_cols = [f"{s}_confidence" for s in species_params]
    updated_df = apply_forward_scores(combined_df, forward, score_cols + confidence_cols)

    if cutoff_date is None:
        cutoff_date = datetime.now() - timedelta(days=config.cutoff_days)
    updated_df = updated_df[updated_df["Date"] > cutoff_date]

    valid_score_columns = {f"{s}_score" for s in species_params}
    species_score_columns = [c for c in updated_df.columns if c.endswith("_score") and c in valid_score_columns]
    updated_df[species_score_columns] = updated_df[species_score_columns].mask(
        updated_df[species_score_columns] > 9.5, 10).round(2)
    confidence_columns = [c for c in confidence_cols if c in updated_df.columns]
    updated_df[confidence_columns] = updated_df[confidence_columns].round(3)

    masterfile_columns = [
        "Location_Id", "Date", "Latitude", "Longitude", "Elevation (m)",
        "Pressure (hPa)", "TotalPrecipitation_mm", "Humidity (%)", "Wind Speed (m/s)",
        "Description", "Temperature (C) Max", "Temperature (C) Min", "Temperature (C)",
        "dist_m_water", "dist_m_sea", "climate_zone", "ph_level",
    ]
    updated_df = updated_df.reindex(
        columns=masterfile_columns + species_score_columns + confidence_columns)
    return updated_df


def update_parquet_master(config, df, species_params, zone_curves, main_data_path):
    """Replace the mutable tail of a parquet master. Only ``lag_days`` of existing
    rows enter pandas; frozen history is streamed through in Arrow batches."""
    new_dates = pd.to_datetime(df["Date"])
    today = (new_dates.min().normalize() if new_dates.notna().any()
             else pd.Timestamp(datetime.now().date()))
    split_date = today - pd.Timedelta(days=config.lag_days)
    cutoff_date = pd.Timestamp(datetime.now() - timedelta(days=config.cutoff_days))
    exists = remote_file_exists(main_data_path)

    fd, output_name = tempfile.mkstemp(suffix=".parquet")
    os.close(fd)
    output_path = Path(output_name)
    try:
        if exists:
            with _local_parquet_source(main_data_path) as source_path:
                recent = _read_recent_parquet(source_path, split_date)
                updated_tail = _merge_and_score(
                    config, df, species_params, zone_curves, main_data_path,
                    existing_df=recent, existing_exists=True, cutoff_date=cutoff_date,
                )
                _write_streaming_parquet(
                    source_path, output_path, updated_tail, split_date, cutoff_date,
                )
        else:
            updated_tail = _merge_and_score(
                config, df, species_params, zone_curves, main_data_path,
                existing_exists=False, cutoff_date=cutoff_date,
            )
            _write_streaming_parquet(
                None, output_path, updated_tail, split_date, cutoff_date,
            )
        _publish_parquet_file(output_path, main_data_path)
    finally:
        output_path.unlink(missing_ok=True)
