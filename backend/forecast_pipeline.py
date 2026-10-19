"""Shared rolling-forecast scoring pipeline for the regional scripts.

One WeatherAPI forecast.json call per coordinate returns up to 7 forecast days
(billed as ONE call). We emit one dated row per forecast day, so the master time
series gains [today .. today+6] each run. Overlapping future dates are replaced by
the fresher forecast on the next run; the day that rolls out of the window freezes.

A frozen day is its day-0 forecast, whose rain correlated only 0.71 with ERA5 reanalysis
(60 coords, 1-3 Oct 2026). Once ERA5 publishes a day, about five days later, era5_rain
writes its rain over that day, at no WeatherAPI cost.
"""
from concurrent.futures import ThreadPoolExecutor, as_completed
from contextlib import contextmanager
from dataclasses import dataclass, replace
from datetime import datetime, timedelta
from io import StringIO, BytesIO
from pathlib import Path
from urllib.parse import urlparse
import faulthandler
import gc
import gzip
import hashlib
import math
import os
import sys
import json
import time
import threading
import tempfile

try:  # before pandas/pyarrow: pyarrow 17 bundles an old msvcp140.dll that crashes LightGBM 4.7
    import lightgbm as lgb
except ImportError:  # no GBM then: the linear fits and hand-set settings still score
    lgb = None
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
import era5_normals
import era5_rain
import hourly_weather
import huerta
import process_priority
from range_prior import host_prior, load_host_cover, load_range_priors, range_prior_for_species
from seasonality import normalize_curve, season_gate_for_species, season_multiplier_for_species
from species_registry import get_composites, get_region_boundaries, get_species_params

BASE_URL = "https://api.weatherapi.com/v1/forecast.json"
FORECAST_DAYS = 7
RAIN_HOUR_MM = 0.1


def _hourly(hours, field):
    return [h[field] for h in hours if h.get(field) is not None]


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
        pressure = _hourly(hours, "pressure_mb")
        wind = _hourly(hours, "wind_kph")
        precip = _hourly(hours, "precip_mm")
        radiation = _hourly(hours, "short_rad")  # a day's energy only adds up over all its hours
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
            "Wind Speed Mean (kph)": float(np.mean(wind)) if wind else None,
            "Pressure (hPa)": float(np.mean(pressure)) if pressure else None,
            "Humidity (%)": day.get("avghumidity"),
            "TotalPrecipitation_mm": day.get("totalprecip_mm", 0),
            "Rain Hours": sum(p >= RAIN_HOUR_MM for p in precip) if precip else None,
            "Snowfall (cm)": day.get("totalsnow_cm"),
            "Solar Radiation (Wh/m2)": (float(sum(radiation))
                                        if hours and len(radiation) == len(hours) else None),
            "ph_level": static_fields.get("ph_level"),
        })
    return rows


def merge_master(existing_df, new_df):
    """Concat new AFTER existing, then keep the LAST row per (Location_Id, Date).

    New (fresher) forecast rows therefore overwrite overlapping existing dates,
    while frozen past rows (absent from new_df) are left untouched.
    """
    return _keep_last(pd.concat([existing_df, new_df], ignore_index=True))


def _keep_last(combined):
    """merge_master's second half: the last row per (Location_Id, Date), renumbered. The same
    as drop_duplicates(keep="last").reset_index(drop=True) without reset_index's full copy;
    _merge_and_score calls it after letting go of the inputs, so they are freed first."""
    combined["Date"] = pd.to_datetime(combined["Date"])
    duplicated = combined.duplicated(subset=["Location_Id", "Date"], keep="last").to_numpy()
    if duplicated.any():
        combined = combined[~duplicated]
    combined.index = pd.RangeIndex(len(combined))
    return combined


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
    cutoff_days: int = 3 * 365
    # Performance: WeatherAPI calls are network-bound. 3 was extremely conservative;
    # raise substantially, tunable via env for rate-limit headroom.
    max_workers: int = int(os.getenv("FORECAST_MAX_WORKERS", "16"))
    range_priors_env: str = ""
    host_cover_env: str = ""


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


def _read_recent_parquet(path, split_date, *, before=None, columns=None):
    """Read only the mutable lag/forecast tail into pandas, pruning frozen row
    groups by their Date statistics. `before` and `columns` read a narrower window:
    the lag history, rows before the tail with only the columns read from them."""
    parquet_file = pq.ParquetFile(path)
    if columns is not None:
        columns = [c for c in columns if c in parquet_file.schema_arrow.names]
    pieces = []
    lower_bound = pd.Timestamp(split_date) - pd.Timedelta(nanoseconds=1)
    for row_group in range(parquet_file.num_row_groups):
        if not _row_group_may_overlap(
                parquet_file, row_group, after=lower_bound, before=before):
            continue
        for batch in parquet_file.iter_batches(
                row_groups=[row_group], batch_size=131_072, columns=columns):
            table = pa.Table.from_batches([batch])
            selected = table.filter(_arrow_date_mask(table, after=lower_bound, before=before))
            if len(selected):
                pieces.append(selected)
    if not pieces:
        schema = parquet_file.schema_arrow
        if columns is not None:
            schema = pa.schema([schema.field(c) for c in columns])
        return schema.empty_table().to_pandas()
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
    keys = pd.MultiIndex.from_frame(updated_tail[["Location_Id", "Date"]])
    if keys.is_unique and keys.is_monotonic_increasing:
        # Sorted already, as _merge_and_score leaves it: sorting and renumbering were two
        # full copies of the tail for the same rows in the same order.
        tail = updated_tail.copy(deep=False)
        tail.index = pd.RangeIndex(len(tail))
    else:
        tail = updated_tail.sort_values(["Location_Id", "Date"]).reset_index(drop=True)
    del keys
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
    # One lookup table for every column, one position lookup per day for all of them,
    # and the lag columns added in one go: 8 groupbys, 336 reindexes and 336 column
    # inserts before, the same values (tests/test_lag_features_equal.py).
    lookup = df.groupby(["Location_Id", "Date"])[columns].last()
    values = {col: lookup[col].to_numpy() for col in columns}
    out = df if target is None else target.sort_values(
        by=["Location_Id", "Date"], ascending=[True, True]).copy()
    locs = out["Location_Id"].to_numpy()
    lags = {}
    for day in range(1, days + 1):
        where = lookup.index.get_indexer(pd.MultiIndex.from_arrays(
            [locs, (out["Date"] - pd.Timedelta(days=day)).to_numpy()]
        ))
        for col in columns:
            lags[f"{col}_{day}days_ago"] = pd.api.extensions.take(values[col], where, allow_fill=True)
    if out.index.is_unique and not any(c in out.columns for c in lags):
        return pd.concat([out, pd.DataFrame(lags, index=out.index)], axis=1)
    for col, lagged in lags.items():   # the old one-by-one path, for frames it can't concat to
        out[col] = lagged
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
    # Lagged only on the dates the target has (the forecast days): the other days of the
    # 42-day window are looked up, never broadcast. Same values for ~1/7 of the rows.
    coord_target = None if target is None else coord_series[coord_series["Date"].isin(target["Date"].unique())]
    coord_lagged = compute_lag_features(coord_series, columns, days, target=coord_target)

    lag_cols = [f"{c}_{d}days_ago" for c in columns for d in range(1, days + 1)]
    coord_lagged = coord_lagged.rename(columns={"Location_Id": "_coord_key"})[["_coord_key", "Date"] + lag_cols]

    if target is None:
        dst, dst_key = df, key
    else:
        dst = target
        dst_key = target[coord_lat].astype(str) + "_" + target[coord_lon].astype(str)
    # The left merge it replaces, by position: a merge then a drop copied the whole wide
    # frame twice (tests/test_lag_features_equal.py holds it to the merge's result).
    where = pd.MultiIndex.from_frame(coord_lagged[["_coord_key", "Date"]]).get_indexer(
        pd.MultiIndex.from_arrays([dst_key.to_numpy(), dst["Date"].to_numpy()]))
    source = coord_lagged[lag_cols]
    if all(dtype == np.float64 for dtype in source.dtypes):
        # Straight into one block (the weather lags are all floats): a dict of columns was
        # consolidated into one, and concat copied it again.
        block = source.to_numpy()[where]
        block[where < 0] = np.nan
        lagged = pd.DataFrame(block, columns=lag_cols, copy=False)
    else:
        lagged = pd.DataFrame({c: pd.api.extensions.take(source[c].to_numpy(), where, allow_fill=True)
                               for c in lag_cols})
    out = dst.drop(columns=[coord_lat, coord_lon])
    out.index = pd.RangeIndex(len(out))
    return pd.concat([out, lagged], axis=1, copy=False)


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


MOISTURE_DAYS = 42


def _moisture_inputs(df):
    """The rain and drying matrices (rows x 42 days back) the moisture score reads. They are the
    same for every species, so calculate_mushroom_score builds them once: built per species they
    were ~0.7 GB of fresh memory each time on half a million rows."""
    rain = np.nan_to_num(_lag_matrix(df, "TotalPrecipitation_mm", MOISTURE_DAYS), nan=0.0)
    rain = np.clip(rain, 0.0, None)
    temp = _lag_matrix(df, "Temperature (C)", MOISTURE_DAYS)
    humidity = _lag_matrix(df, "Humidity (%)", MOISTURE_DAYS)
    wind = _lag_matrix(df, "Wind Speed (m/s)", MOISTURE_DAYS)

    # Missing historical weather uses neutral values rather than inventing drought.
    temp = np.where(np.isfinite(temp), temp, 10.0)
    humidity = np.where(np.isfinite(humidity), humidity, 70.0)
    wind = np.where(np.isfinite(wind), wind, 3.0)
    drying = (
        0.08 * np.maximum(temp - 10.0, 0.0)
        + 0.025 * np.maximum(70.0 - humidity, 0.0)
        + 0.12 * np.maximum(wind - 3.0, 0.0)
    )
    return rain, np.clip(drying, 0.0, 4.0)


def _moisture_memory_score(df, *, cumulative_rain_target, rain_first, delay=0, inputs=None):
    """Estimate available moisture over 7, 21 and 42-day horizons. `delay` (a species'
    rain_delay_days) moves them all that many days back, so rain counts only once it is that old:
    boletes fruit 14-19 days after rain, not within the week. The 42 days the lags reach stay the
    limit, so the longest window shrinks and its rain target with it. `inputs` is
    _moisture_inputs(df), when the caller has it already."""
    windows = (7, 21, 42)
    max_days = max(windows)
    rain, drying = _moisture_inputs(df) if inputs is None else inputs
    rain, drying = rain[:, delay:], drying[:, delay:]

    target = max(float(cumulative_rain_target), 1.0)
    ratios = []
    for days in windows:
        days = min(days, max_days - delay)
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
    """Smooth scores locally per date. (A per-species confidence from coverage and agreement
    was written beside them until Oct 2026: nothing read it, and it was ~6 GB of South Europe's
    master in the nightly upload's memory.)"""
    from scipy.spatial import cKDTree

    earth_radius_km = 6371.0088
    # The score columns, smoothed as arrays and set back whole on a shallow copy: a deep copy of
    # the frame first was ~2.5 GB on US West, for columns that never change here.
    scores = {c: pd.to_numeric(df[c], errors="coerce").to_numpy(float).copy() for c in score_cols}
    lat_all = pd.to_numeric(df["Latitude"], errors="coerce").to_numpy(float)
    lon_all = pd.to_numeric(df["Longitude"], errors="coerce").to_numpy(float)

    for rows in df.groupby(pd.to_datetime(df["Date"]).dt.normalize()).indices.values():
        lat, lon = lat_all[rows], lon_all[rows]
        valid_coord = np.isfinite(lat) & np.isfinite(lon)
        if not valid_coord.any():
            continue
        valid_rows = rows[valid_coord]
        xyz = _latlon_to_unit_xyz(lat[valid_coord], lon[valid_coord])
        k = min(neighbours, len(valid_rows))
        chord_dist, near = cKDTree(xyz).query(xyz, k=k)
        chord_dist = np.asarray(chord_dist).reshape(len(valid_rows), k)
        near = np.asarray(near).reshape(len(valid_rows), k)
        distances = 2.0 * earth_radius_km * np.arcsin(
            np.clip(chord_dist / 2.0, 0.0, 1.0)
        )
        in_radius = distances <= radius_km
        spatial_weights = np.exp(-((distances / 15.0) ** 2)) * in_radius

        for score_col in score_cols:
            values = scores[score_col][valid_rows]
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
            scores[score_col][valid_rows] = smoothed
    out = df.copy(deep=False)
    for score_col, values in scores.items():
        out[score_col] = values
    return out


def _filled_lags(df, base_col, n_days):
    """Each day's lag column with its gaps filled from the row's own value, as the weighted lag
    scores read them; the same for every species, so built once per scoring run."""
    base = df[base_col]
    out = []
    for d in range(1, n_days + 1):
        col = f"{base_col}_{d}days_ago"
        series = df[col] if col in df.columns else base
        out.append(series.fillna(base).to_numpy(float))
    return out


def _weighted_lag_gaussian(df, base_col, n_days, weights, mu, sigma, filled=None):
    """Weighted-over-lags gaussian score, vectorized over all rows. Bit-identical to
    the original `sum(w * col.fillna(base).apply(gaussian))` (same left-fold order),
    but evaluates the gaussian on whole columns instead of per row. `filled` is
    _filled_lags(df, base_col, n_days), when the caller has it already.
    """
    filled = _filled_lags(df, base_col, n_days) if filled is None else filled
    score = np.zeros(len(df), dtype=float)
    for i in range(n_days):
        score = score + weights[i] * gaussian(filled[i], mu, sigma)
    return score


def _weighted_lag_humidity(df, base_col, n_days, weights, saturation, sigma, filled=None):
    """Weighted lag score using the one-sided humidity deficit curve."""
    filled = _filled_lags(df, base_col, n_days) if filled is None else filled
    score = np.zeros(len(df), dtype=float)
    for i in range(n_days):
        score = score + weights[i] * humidity_suitability(filled[i], saturation, sigma)
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


# --- Fitted fruiting response (#291) ---------------------------------------------------
# tools/fit_fruiting.py fits a conditional logit on these features: ERA5 weather at every
# GBIF find since 2016 against the same place 14 and 21 days either side. Where its index
# ranked find days better than the hand-set weather part in more held-out years than chance
# would give, generated/fruiting_fit.json carries the coefficients, and the index replaces
# that species' weather part in that region. tests/test_fruiting.py checks these features
# match the training table's exactly. No sunshine: it is stored only since 8 October 2026,
# its gap to ERA5 is unmeasured, and leaving it out cost the fit nothing.
FRUITING_FIT_PATH = Path(__file__).resolve().parent / "generated" / "fruiting_fit.json"
FRUITING_RAIN_WINDOWS = {"rain_1_3": (1, 3), "rain_4_7": (4, 7), "rain_8_14": (8, 14),
                         "rain_15_21": (15, 21), "rain_22_28": (22, 28), "rain_15_28": (15, 28),
                         "rain_29_42": (29, 42)}
# How long a soaking takes to show depends on warmth: porcini finds peak 16 days after rain
# where the time of year's normal is 13 C or more, 23-25 days where it is cooler (14 Oct 2026,
# 23,000 EU finds). Each window from a week back is also read times warmth, the place's ERA5
# normal mean temperature for the day less WARMTH_BASE_C, so a warm place leans on the second
# and third weeks and a cold one on the fourth to sixth. Porcini in South Europe timed its
# finds better than with one lag everywhere in 10 of 11 held-out years.
FRUITING_WARM_WINDOWS = ["rain_8_14", "rain_15_21", "rain_22_28", "rain_29_42"]
WARMTH_BASE_C = 12.0
FRUITING_FEATURES = ["rain_0", "rain_1_3", "rain_4_7", "rain_8_14", "rain_15_21", "rain_22_28", "rain_29_42",
                     "dry_days", "temp", "temp_sq", "tmin_drop", "frost", "humidity", "humidity_early",
                     *(f"{name}_x_warmth" for name in FRUITING_WARM_WINDOWS)]
# The window features the shipped GBMs were trained on. The GBM reads the daily lags and the
# normals itself, so it keeps one 15-28 window and no warmth terms.
FRUITING_GBM_BASE = ["rain_0", "rain_1_3", "rain_4_7", "rain_8_14", "rain_15_28", "rain_29_42", "dry_days",
                     "temp", "temp_sq", "tmin_drop", "frost", "humidity", "humidity_early"]
FRUITING_LAG_COLUMNS = ["Temperature (C) Min"]
LAG_COLUMNS = ["Temperature (C)", "TotalPrecipitation_mm", "Pressure (hPa)", "Humidity (%)", "Wind Speed (m/s)"]
# What the lag window's older days are read for (update_parquet_master): their keys, the row
# filter's coordinates, the elevation fill and the lagged weather.
LAG_HISTORY_COLUMNS = ["Location_Id", "Date", "Latitude", "Longitude", "Elevation (m)",
                       *LAG_COLUMNS, *FRUITING_LAG_COLUMNS]
DRY_DAYS_CAP = 43          # no 5 mm day within the 42 days the lags reach
RAIN_MAX_MM_DAY = 300.0    # the US parquets carry impossible days (2415 mm); ERA5 never does


# The GBM reads each day itself rather than window sums: rain d0-42 (log1p), mean and
# minimum temperature d1-14, humidity d1-21. tests/test_fruiting_gbm.py checks they match
# tools/build_training_table.daily_lags exactly.
FRUITING_GBM_LAGS = {"rain": ("TotalPrecipitation_mm", range(0, 43)),
                     "tmean": ("Temperature (C)", range(1, 15)),
                     "tmin": ("Temperature (C) Min", range(1, 15)),
                     "rh": ("Humidity (%)", range(1, 22))}


# Then the find cell's ERA5 normals for the month, its latitude and the day of year: constant
# within a training stratum, so in the nightly scoring they are the run's, on every day scored.
FRUITING_GBM_STATIC = ["norm_rain", "norm_tmean", "norm_rh", "lat", "find_doy"]
FRUITING_GBM_REGIONS = ["NE", "SE", "USE", "USW"]
FRUITING_GBM_PATH = Path(__file__).resolve().parent / "generated" / "fruiting_gbm.json"


def fruiting_gbm_lags(df):
    """Each row's daily lags from the frame's "<column>_<k>days_ago" columns."""
    out = {}
    for name, (column, days) in FRUITING_GBM_LAGS.items():
        for k in days:
            name_k = column if k == 0 else f"{column}_{k}days_ago"
            values = df[name_k].to_numpy(float) if name_k in df else np.full(len(df), np.nan)
            out[f"{name}_d{k}"] = np.log1p(np.clip(values, 0, RAIN_MAX_MM_DAY)) if name == "rain" else values
    return pd.DataFrame(out, index=df.index)


def fruiting_raw_features(df):
    """Each row's raw features from the frame's lag columns, defined as in
    tools/build_training_table.features: a window over days d-far..d-near, NaN if any
    of them is missing; days since 5 mm counts back from yesterday."""
    rain = np.clip(_lag_matrix(df, "TotalPrecipitation_mm", 42), 0, RAIN_MAX_MM_DAY)
    temp = _lag_matrix(df, "Temperature (C)", 7)
    tmin = _lag_matrix(df, "Temperature (C) Min", 14)
    humidity = _lag_matrix(df, "Humidity (%)", 21)
    wet = rain >= 5.0
    out = pd.DataFrame({
        "rain_0": np.clip(df["TotalPrecipitation_mm"].to_numpy(float), 0, RAIN_MAX_MM_DAY),
        **{name: rain[:, near - 1:far].sum(axis=1) for name, (near, far) in FRUITING_RAIN_WINDOWS.items()},
        "days_since_rain5": np.where(wet.any(axis=1), wet.argmax(axis=1) + 1, DRY_DAYS_CAP),
        "temp_1_7": temp.mean(axis=1),
        "tmin_1_3": tmin[:, :3].mean(axis=1),
        "tmin_8_14": tmin[:, 7:14].mean(axis=1),
        "frost_days_1_14": np.where(np.isnan(tmin).any(axis=1), np.nan, (tmin < 0).sum(axis=1)),
        "humidity_1_7": humidity[:, :7].mean(axis=1),
        "humidity_8_21": humidity[:, 7:21].mean(axis=1),
    }, index=df.index)
    out["tmin_drop"] = out["tmin_1_3"] - out["tmin_8_14"]
    return out


FRUITING_GBM_FEATURES = [*FRUITING_GBM_BASE,
                         *(f"{name}_d{k}" for name, (_, days) in FRUITING_GBM_LAGS.items() for k in days),
                         *FRUITING_GBM_STATIC, "region"]


# Humidity and temperature as departures from the place's normal for the time of year (the
# window's middle day, era5_normals 2016-2025). The fit learns only from days at one place,
# where absolute values and departures give the same coefficients, but read as absolute values
# a drier or warmer climate lowered every day there, which no test checked (central Apennines
# in a wet autumn 7.5, the Alps 9). Feature -> (normal, days back to the window's middle).
FRUITING_RELATIVE = {"temp": ("tmean", 4), "humidity": ("rh", 4), "humidity_early": ("rh", 14)}


def fruiting_relative(design, grid, lats, lons, dates):
    """The linear fit's humidity and temperature as departures from the place's normals, the
    temperature optimum's term against the normal's own. Off the normals grid they are unknown
    and count as average. The GBM reads the normals as inputs instead.

    The warmth terms likewise read each window's rain against the place's normal rain for it.
    Read as absolute rain times warmth they ranked the places of shaggy mane in the US, morel and
    oyster mushroom 0.02-0.06 worse (warm wet places rose whatever the day); against the normal,
    a place at its normal rain gets 0 from them, warm or cold. The fit is unchanged: within a
    find's stratum the normal is the same on every day, so it cancels."""
    out = design.copy()
    lats, lons = np.asarray(lats, float), np.asarray(lons, float)
    dates = pd.DatetimeIndex(pd.to_datetime(dates))
    for name, (normal, back) in FRUITING_RELATIVE.items():
        n = era5_normals.on_days(grid, lats, lons, dates - pd.Timedelta(days=back))[f"norm_{normal}"]
        out[name] = design[name].to_numpy(float) - n
        if name == "temp":
            out["temp_sq"] = design["temp_sq"].to_numpy(float) - (n - 12.0) ** 2 / 10.0
    warm_terms = [w for w in FRUITING_WARM_WINDOWS if f"{w}_x_warmth" in design]
    if warm_terms:
        warmth = fruiting_warmth(grid, lats, lons, dates)
        for w in warm_terms:
            near, far = FRUITING_RAIN_WINDOWS[w]
            normal = era5_normals.on_days(grid, lats, lons, dates - pd.Timedelta(days=(near + far) // 2))["norm_rain"]
            out[f"{w}_x_warmth"] = (design[w].to_numpy(float) - np.log1p(normal * (far - near + 1))) * warmth
    return out


def fruiting_warmth(grid, lats, lons, dates):
    """The place's ERA5 normal mean temperature for the day less WARMTH_BASE_C; NaN off the grid."""
    return era5_normals.on_days(grid, np.asarray(lats, float), np.asarray(lons, float),
                                pd.DatetimeIndex(pd.to_datetime(dates)))["norm_tmean"] - WARMTH_BASE_C


def fruiting_design(raw, warmth=None, names=FRUITING_FEATURES):
    """Raw features -> the fit's columns (`names`). Rain on a log scale: the 30th mm matters less
    than the 3rd. Without `warmth` the warmth terms are unknown (NaN), so they count as average."""
    out = pd.DataFrame({name: np.log1p(raw[name]) for name in ["rain_0", *FRUITING_RAIN_WINDOWS]})
    out["dry_days"] = np.log1p(raw["days_since_rain5"].fillna(DRY_DAYS_CAP).clip(upper=DRY_DAYS_CAP))
    out["temp"] = raw["temp_1_7"]
    out["temp_sq"] = (raw["temp_1_7"] - 12.0) ** 2 / 10.0   # lets an optimum emerge
    out["tmin_drop"] = raw["tmin_drop"]
    out["frost"] = raw["frost_days_1_14"]
    out["humidity"] = raw["humidity_1_7"]
    out["humidity_early"] = raw["humidity_8_21"]
    warm = np.full(len(out), np.nan) if warmth is None else np.asarray(warmth, float)
    for name in FRUITING_WARM_WINDOWS:
        out[f"{name}_x_warmth"] = out[name].to_numpy(float) * warm
    return out[names]


def fruiting_weather_part(df, model):
    """The fitted index, put on the hand-set weather part's own scale. model["map"] holds one
    map per calendar month, pairing quantiles of the index with the same quantiles of the
    hand-set part at that time of year, so a score keeps its range, threshold and seasonal
    level and only its order changes; a day blends the two months either side of it. The
    fit learned on ERA5, whose humidity reads higher than the stored WeatherAPI values, so
    model["humidity_from_stored"] = (a, b) puts stored humidity on ERA5's level first. A
    feature the row lacks counts as average."""
    warmth = None
    if model.get("normals") is not None:
        warmth = fruiting_warmth(model["normals"], df["Latitude"], df["Longitude"], df["Date"])
    design = fruiting_design(fruiting_raw_features(df), warmth)
    a, b = model.get("humidity_from_stored", (0.0, 1.0))
    design[["humidity", "humidity_early"]] = a + b * design[["humidity", "humidity_early"]]
    if model.get("normals") is not None:
        design = fruiting_relative(design, model["normals"], df["Latitude"], df["Longitude"], df["Date"])
    z = (design.to_numpy(float) - np.asarray(model["means"])) / np.asarray(model["sds"])
    eta = np.nan_to_num(z, nan=0.0) @ np.asarray(model["beta"], float)
    return _monthly_map(eta, df["Date"], model["map"])


def _monthly_map(index, dates, maps):
    """The index on the hand-set weather part's scale: one map per calendar month, a day
    blending the two months either side of it."""
    months = (pd.to_datetime(dates).dt.dayofyear.to_numpy() - 15.0) / (365.25 / 12)  # 0 = mid-January
    before = np.floor(months).astype(int)
    weight = months - before
    out = np.empty(len(index))
    for month in np.unique(before):
        rows = before == month
        part = [np.interp(index[rows], m["eta"], m["weather_part"]) for m in (maps[month % 12], maps[(month + 1) % 12])]
        out[rows] = (1 - weight[rows]) * part[0] + weight[rows] * part[1]
    return out


def fruiting_gbm_features(df, model):
    """The GBM's inputs per row, in FRUITING_GBM_FEATURES order. Stored inputs are put on
    ERA5's level first (model["corrections"]: column -> a, b), as the GBM learned on ERA5.
    Normals and day of year are those of model["anchor"], the run's date."""
    light = {}
    for column in ("TotalPrecipitation_mm", "Temperature (C)", "Temperature (C) Min", "Humidity (%)"):
        a, b = model["corrections"].get(column, (0.0, 1.0))
        for name in [column, *(f"{column}_{k}days_ago" for k in range(1, 43))]:
            if name in df:
                light[name] = a + b * pd.to_numeric(df[name], errors="coerce").to_numpy(float)
    light = pd.DataFrame(light, index=df.index)
    if "TotalPrecipitation_mm" not in light:
        light["TotalPrecipitation_mm"] = np.nan
    anchor = pd.Timestamp(model["anchor"])
    lats, lons = df["Latitude"].to_numpy(float), df["Longitude"].to_numpy(float)
    normals = era5_normals.lookup(model["normals"], lats, lons, np.full(len(df), anchor.month))
    return np.column_stack([
        fruiting_design(fruiting_raw_features(light), names=FRUITING_GBM_BASE).to_numpy(float),
        fruiting_gbm_lags(light).to_numpy(float),
        normals["norm_rain"], normals["norm_tmean"], normals["norm_rh"],
        np.round(lats / era5_normals.STEP) * era5_normals.STEP,
        np.full(len(df), anchor.dayofyear, float),
        np.full(len(df), model["region_code"], float)])


def fruiting_gbm_weather_part(features, df, model):
    """The GBM's raw score through its monthly maps onto the hand-set weather part's scale."""
    return _monthly_map(model["booster"].predict(features, raw_score=True), df["Date"], model["map"])


def attach_fruiting_models(species_params, region, path=FRUITING_FIT_PATH):
    """Give each species the region's fitted model, where generated/fruiting_fit.json has one."""
    if not Path(path).exists():
        return
    fit = json.loads(Path(path).read_text(encoding="utf-8"))
    if fit.get("features") != FRUITING_FEATURES:
        print(f"[warn] {path}: features differ from this code's; hand-set weather parts used")
        return
    normals = None
    for specie, params in species_params.items():
        model = fit.get("models", {}).get(specie, {}).get(region)
        if model:
            params["fruiting"] = {"means": fit["means"], "sds": fit["sds"],
                                  "humidity_from_stored": fit["humidity_from_stored"][region], **model}
            if fit.get("relative_to_normal"):
                normals = era5_normals.load(region) if normals is None else normals
                params["fruiting"]["normals"] = normals


def attach_fruiting_gbm(species_params, region, today, path=FRUITING_GBM_PATH, fetch=None):
    """Give each species the region's GBM, where generated/fruiting_gbm.json ships one; it
    replaces that species' linear fit. The models live on R2 (each training run in its own
    folder, checked against the sha256 recorded here); one that cannot be fetched or fails its
    checksum leaves the species on its linear fit. `today` anchors normals and day of year."""
    if lgb is None or not Path(path).exists():
        return
    spec = json.loads(Path(path).read_text(encoding="utf-8"))
    if spec.get("features") != FRUITING_GBM_FEATURES:
        print(f"[warn] {path}: features differ from this code's; GBM not used")
        return
    fetch = fetch or r2_fetch
    normals = None
    for specie, params in species_params.items():
        model = spec.get("models", {}).get(specie, {})
        if region not in model.get("regions", {}):
            continue
        try:
            data = fetch(model["file"])
            if hashlib.sha256(data).hexdigest() != model["sha256"]:
                raise ValueError("checksum differs")
            booster = lgb.Booster(model_str=gzip.decompress(data).decode())
        except Exception as error:
            print(f"[warn] GBM for {specie} not loaded ({error}); its linear fit stays")
            continue
        if normals is None:
            normals = era5_normals.load(region)
        params.pop("fruiting", None)
        params["fruiting_gbm"] = {
            "booster": booster, "map": model["regions"][region]["map"],
            "corrections": spec["inputs_from_stored"][region],
            "region_code": FRUITING_GBM_REGIONS.index(region), "anchor": pd.Timestamp(today),
            "normals": normals}


PHENOLOGY_PATH = Path(__file__).resolve().parent / "generated" / "phenology.json"


def attach_phenology(species_params, region, path=None, fetch=None):
    """The learned plant seasons (tools/fit_phenology.py) for the region's species that ship
    one: a weekly grid per continent, on R2 and checked against the sha256 recorded here. A
    file that cannot be fetched or fails its checksum leaves those species on their months."""
    path = Path(path or PHENOLOGY_PATH)
    if not path.exists():
        return
    entry = json.loads(path.read_text(encoding="utf-8"))["continents"].get(era5_normals.CONTINENT[region])
    if not entry or not set(entry["species"]) & set(species_params):
        return
    try:
        data = (fetch or r2_fetch)(entry["file"])
        if hashlib.sha256(data).hexdigest() != entry["sha256"]:
            raise ValueError("checksum differs")
        with np.load(BytesIO(data)) as z:
            grid = {name: z[name] for name in z.files}
    except Exception as error:
        print(f"[warn] learned plant seasons not loaded ({error}); their months stay")
        return
    for k, specie in enumerate(grid["species"].tolist()):
        if specie in species_params:
            species_params[specie]["phenology"] = {"lat": grid["lat"], "lon": grid["lon"], "ratio": grid["ratio"][k]}


LOCAL_SEASON_PATH = Path(__file__).resolve().parent / "generated" / "local_season.json"


def attach_local_season(species_params, region, path=None, fetch=None):
    """The mushrooms' local season curves (tools/build_local_season.py) for the region's species
    that ship one: a monthly grid per continent, on R2 and checked against the sha256 recorded
    here. A file that cannot be fetched or fails its checksum leaves the region and zone curves."""
    path = Path(path or LOCAL_SEASON_PATH)
    if not path.exists():
        return
    entry = json.loads(path.read_text(encoding="utf-8"))["continents"].get(era5_normals.CONTINENT[region])
    shipped = set(entry.get("regions", {}).get(region, [])) & set(species_params) if entry else set()
    if not shipped:
        return
    try:
        data = (fetch or r2_fetch)(entry["file"])
        if hashlib.sha256(data).hexdigest() != entry["sha256"]:
            raise ValueError("checksum differs")
        with np.load(BytesIO(data)) as z:
            grid = {name: z[name] for name in z.files}
    except Exception as error:
        print(f"[warn] local season curves not loaded ({error}); the region and zone curves stay")
        return
    for k, specie in enumerate(grid["species"].tolist()):
        if specie in shipped:
            species_params[specie]["local_season"] = {"lat": grid["lat"], "lon": grid["lon"], "ratio": grid["ratio"][k]}


HABITAT_PATH = Path(__file__).resolve().parent / "generated" / "habitat_factor.json"


def attach_habitat(species_params, region, path=None, fetch=None):
    """The learned habitat factor (tools/fit_habitat.py) for the region's species that ship
    one: per location, on R2 and checked against the sha256 recorded here. A file that cannot
    be fetched or fails its checksum leaves the scores without it."""
    path = Path(path or HABITAT_PATH)
    if not path.exists():
        return
    entry = json.loads(path.read_text(encoding="utf-8")).get("regions", {}).get(region)
    if not entry or not set(entry["species"]) & set(species_params):
        return
    try:
        data = (fetch or r2_fetch)(entry["file"])
        if hashlib.sha256(data).hexdigest() != entry["sha256"]:
            raise ValueError("checksum differs")
        with np.load(BytesIO(data)) as z:
            ids, species, factor = z["ids"], [str(s) for s in z["species"]], z["factor"]
    except Exception as error:
        print(f"[warn] habitat factor not loaded ({error}); scores go without it")
        return
    index = pd.Index(ids)
    for column, specie in enumerate(species):
        if specie in species_params:
            species_params[specie]["habitat"] = {"index": index, "factor": factor[:, column] / 255.0}


def calculate_mushroom_score(df, species_params, zone_curves):
    if 'TotalPrecipitation_mm' not in df.columns:
        df['TotalPrecipitation_mm'] = np.nan
    wind_factor = _lagged_wind_factor(df)
    gbm_features = None

    # What every species reads alike, built once: per species it was ~44 rebuilds of the same
    # 42-day matrices and lag columns, the run's memory churn.
    moisture = _moisture_inputs(df)
    for specie, params in species_params.items():
        cum_thr = float(params.get('min_cumulative_rain', 20.0))
        rain_first = bool(params.get('weather_preference', {}).get('rain_first', False))
        df[f'{specie}_Weather_Score'] = _moisture_memory_score(
            df, cumulative_rain_target=cum_thr, rain_first=rain_first,
            delay=int(params.get('rain_delay_days', 0)), inputs=moisture)
    del moisture

    temp_days = min(12, len([c for c in df.columns if c.startswith('Temperature (C)_') and c.endswith('days_ago')]))
    hum_days = min(21, len([c for c in df.columns if c.startswith('Humidity (%)_') and c.endswith('days_ago')]))
    temp_lags = _filled_lags(df, 'Temperature (C)', temp_days) if temp_days > 0 else None
    hum_lags = _filled_lags(df, 'Humidity (%)', hum_days) if hum_days > 0 else None

    for specie, params in species_params.items():
        optimal_temp, temp_sigma = params["optimal_temp"], params["temp_sigma"]
        optimal_alt, alt_sigma = params["optimal_alt"], params["alt_sigma"]
        optimal_humidity, humidity_sigma = params["optimal_humidity"], params["humidity_sigma"]
        optimal_pH, pH_sigma_near, pH_sigma_far, pH_range_near = (
            params["optimal_pH"], params["pH_sigma_near"], params["pH_sigma_far"], params["pH_range_near"]
        )

        if temp_days > 0:
            dT = np.arange(1, temp_days + 1)
            temp_weights = 0.6 * np.exp(-0.5 * ((dT - 4) / 3.0)**2) + 0.4 * np.exp(-0.08 * dT)
            temp_weights /= temp_weights.sum()
            temp_score = _weighted_lag_gaussian(df, 'Temperature (C)', temp_days, temp_weights,
                                                optimal_temp, temp_sigma, filled=temp_lags)
        else:
            temp_score = gaussian(df['Temperature (C)'].to_numpy(float), optimal_temp, temp_sigma)

        if hum_days > 0:
            dH = np.arange(1, hum_days + 1)
            hum_weights = 0.6 * np.exp(-0.5 * ((dH - 9) / 5.0)**2) + 0.4 * np.exp(-0.05 * dH)
            hum_weights /= hum_weights.sum()
            humidity_score = _weighted_lag_humidity(
                df, 'Humidity (%)', hum_days, hum_weights, optimal_humidity, humidity_sigma, filled=hum_lags)
        else:
            humidity_score = humidity_suitability(
                df['Humidity (%)'].to_numpy(float), optimal_humidity, humidity_sigma)

        # The parts stay arrays: as columns of this ~400-column frame, dropping them copied the
        # whole frame once per species.
        temp_part = np.clip(temp_score, 0, 1)
        humidity_part = np.clip(humidity_score, 0, 1)
        weather_part = df[f'{specie}_Weather_Score'].to_numpy(float)
        # All three weather components take the fitted part, so their weighted
        # geometric mean is that part and the static components weigh as before.
        if params.get("fruiting_gbm"):
            if gbm_features is None:   # the same for every species of a region run
                gbm_features = fruiting_gbm_features(df, params["fruiting_gbm"])
            fitted = fruiting_gbm_weather_part(gbm_features, df, params["fruiting_gbm"])
        elif params.get("fruiting"):
            fitted = fruiting_weather_part(df, params["fruiting"])
        if params.get("fruiting_gbm") or params.get("fruiting"):
            df[f'{specie}_Weather_Score'] = fitted
            temp_part = humidity_part = weather_part = df[f'{specie}_Weather_Score'].to_numpy(float)
        alt_part = np.clip(altitude_score(df['Elevation (m)'].to_numpy(float), optimal_alt, alt_sigma), 0, 1)
        ph_part = _ph_score_vectorized(
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

        # Weight of each sub-score. Rain sits above humidity because it is what makes
        # fungi fruit. Plants whose flowers, fruit or nuts do not wait for rain set a
        # lower `rain_weight`: against 2026 sightings in the forageable stage, 0 scored
        # them higher and told their places from random ones better than 1.5 did. Any part
        # can be set the same way; 0 drops a part that ranks a plant's places the wrong way
        # (tools/fit_plant_settings.py --parts).
        wT = float(params.get("temp_weight", 1.75))
        wH = float(params.get("humidity_weight", 1.0))
        wA = float(params.get("alt_weight", 0.75))
        wPH = float(params.get("ph_weight", 1.0))
        wW = float(params.get("rain_weight", 1.5))
        wWater = 0.7 if water_active else 0.0

        n = len(df)
        if np.isscalar(water_factor):
            water_comp = np.full(n, float(water_factor), dtype=float)
        else:
            water_comp = np.asarray(water_factor, dtype=float).reshape(-1)
            if water_comp.size != n:
                water_comp = np.full(n, float(np.mean(water_comp)), dtype=float)

        if df['ph_level'].isna().any():
            comps_no_ph = np.vstack([temp_part, humidity_part, weather_part, alt_part, water_comp])
            weights_no_ph = np.array([wT, wH, wW, wA, wWater], float)
            score_no_ph = 10 * _hybrid_component_mean_rows(comps_no_ph, weights_no_ph)

            comps_ph = np.vstack([temp_part, humidity_part, weather_part, alt_part, ph_part, water_comp])
            weights_ph = np.array([wT, wH, wW, wA, wPH, wWater], float)
            score_ph = 10 * _hybrid_component_mean_rows(comps_ph, weights_ph)

            df[f'{specie}_score'] = np.where(df['ph_level'].isna(), score_no_ph, score_ph)
        else:
            comps_ph = np.vstack([temp_part, humidity_part, weather_part, alt_part, ph_part, water_comp])
            weights_ph = np.array([wT, wH, wW, wA, wPH, wWater], float)
            df[f'{specie}_score'] = 10 * _hybrid_component_mean_rows(comps_ph, weights_ph)

        df[f'{specie}_score'] = df[f'{specie}_score'].clip(0, 10)
        if params.get("wind_sensitive", False):
            df[f'{specie}_score'] = (df[f'{specie}_score'] * wind_factor).clip(0, 10)

        # Whether the species can grow here at all: where it is observed and, for
        # mycorrhizal fungi, whether its host trees are around. It replaced the
        # climate-zone allow-lists, whose rectangle-drawn zones cut the map in lines.
        df[f'{specie}_score'] *= range_prior_for_species(df, params)

        # Two separate jobs. The multiplier tilts the score across the season; the gate is
        # allowed to reach zero, which is the only way the model can say "not this month".
        df[f'{specie}_score'] *= season_multiplier_for_species(df, specie, params, zone_curves)
        df[f'{specie}_score'] *= season_gate_for_species(df, specie, params, zone_curves)

    return df


# A species scored in both regions of a continent jumped where their place lists meet: wild
# mint on 12 Oct 2026 read 9.3 in Kentucky, on US West's list, and 4.3 next door in Indiana, on
# US East's; shaggy mane drew Missouri's and Tennessee's borders, its two regions' fitted models
# disagreeing. Across a band around the split (species_registry.infer_region) each region's
# model (settings, season curves, fitted models, habitat factor: tools/fit_habitat.py lists each
# region's for its neighbour's places too) fades into the other's, so a place takes its own
# side's and the line goes. In the US the band runs 105-95 W around the app's split at 100 W, so
# Missouri, Kentucky and Tennessee, on US West's list, take US East's model like their
# neighbours. Europe's lists meet along the Dutch, Belgian, Danish and Polish borders (North
# Europe from 49.5 N, South Europe up to 54.8 N), far from infer_region's 47 N, where a band
# would move Germany, Poland and Czechia onto North Europe's model, trained without their
# finds; there the band follows the lists themselves, BAND_KM either side of where they meet.
SETTINGS_BAND = 5.0                            # US: half-width in degrees of longitude, 105-95 W
BAND_KM = 75.0                                 # Europe: half-width either side of where the lists meet
NEIGHBOUR_REGION = {"NE": "SE", "SE": "NE", "USE": "USW", "USW": "USE"}
BLEND_CHUNK = 100_000                          # rows rescored at a time, to bound the memory


def _nearest_km(points, lat, lon):
    """Great-circle km from each (lat, lon) to the nearest of `points`, an array of (lat, lon)."""
    from scipy.spatial import cKDTree

    def xyz(la, lo):
        la, lo = np.radians(la), np.radians(lo)
        return np.column_stack([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)])
    chord, _ = cKDTree(xyz(points[:, 0], points[:, 1])).query(xyz(lat, lon))
    return 2 * 6371.0 * np.arcsin(np.clip(chord / 2, 0, 1))


def own_settings_weight(region, lat, lon, lists=None):
    """Per row, the share of the region's own model against its neighbour's: 1 on its side of
    the band, 0 on the other, linear across it; a half each where they meet. In Europe `lists`
    is (the region's place coordinates, the neighbour's), and the band follows them."""
    if region in ("USE", "USW"):
        split = get_region_boundaries()["uswMaxLongitude"]
        east = np.clip((lon - split + SETTINGS_BAND) / (2 * SETTINGS_BAND), 0, 1)
        return east if region == "USE" else 1 - east
    own, theirs = lists
    return np.clip(0.5 + (_nearest_km(theirs, lat, lon) - _nearest_km(own, lat, lon)) / (2 * BAND_KM), 0, 1)


def blend_neighbour_settings(df, species_params, config, neighbour=None):
    """Rescore the rows leaning to the neighbour region with its model, for every species both
    regions score, and mix the two scores by own_settings_weight. `neighbour` is the neighbour's
    (species_params, zone_curves); loaded as the region's own are when not given."""
    other = NEIGHBOUR_REGION[config.region]
    lists = None
    if config.region in ("NE", "SE"):
        lists = tuple(_load_coords_any(get_required_env(f"{r}_UNIQUE_COORDINATES")) for r in (config.region, other))
    w = own_settings_weight(config.region, df["Latitude"].to_numpy(float), df["Longitude"].to_numpy(float), lists)
    rows = np.flatnonzero(w < 1)
    if not len(rows):
        return df
    if neighbour is None:
        print(f"{other}'s model, for the places leaning to it:")
        neighbour = _load_species_and_curves(replace(config, region=other, season_curves_env=f"{other}_SEASON_CURVES"))
    theirs, their_zone_curves = neighbour
    both = [s for s in species_params if s in theirs]
    inputs = [i for i, c in enumerate(df.columns) if not c.endswith(("_score", "_Score", "_confidence"))]
    cols = [df.columns.get_loc(f"{s}_score") for s in both]
    for part in np.array_split(rows, -(-len(rows) // BLEND_CHUNK)):
        scored = calculate_mushroom_score(df.iloc[part, inputs].copy(), {s: theirs[s] for s in both}, their_zone_curves)
        mine = df.iloc[part, cols].to_numpy(float)
        df.iloc[part, cols] = w[part, None] * mine + (1 - w[part, None]) * scored[[f"{s}_score" for s in both]].to_numpy(float)
    print(f"Scores blended with {other}'s on {len(rows)} rows for {len(both)} species")
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

    _priors_path = os.getenv(config.range_priors_env) if config.range_priors_env else None
    if _priors_path:
        try:
            _priors = load_range_priors(
                r2_fetch(_priors_path) if is_remote_path(_priors_path) else Path(_priors_path).read_bytes())
            for _sp, _p in species_params.items():
                if _sp in _priors:
                    _p["range_prior"] = _priors[_sp]
            print(f"Loaded range priors for {sum('range_prior' in p for p in species_params.values())} species.")
        except Exception as _e:
            print(f"[warn] could not load range priors from {_priors_path}: {_e}; scoring without them")

    _cover_path = os.getenv(config.host_cover_env) if config.host_cover_env else None
    if _cover_path:
        try:
            _cover = load_host_cover(
                r2_fetch(_cover_path) if is_remote_path(_cover_path) else Path(_cover_path).read_bytes())
            for _p in species_params.values():
                if _p.get("hosts"):
                    _p["host_prior"] = host_prior(_cover, _p["hosts"])
            print(f"Loaded host cover for {sum('host_prior' in p for p in species_params.values())} species.")
        except Exception as _e:
            print(f"[warn] could not load host cover from {_cover_path}: {_e}; scoring without it")

    attach_fruiting_models(species_params, config.region)
    attach_fruiting_gbm(species_params, config.region, datetime.now())
    attach_habitat(species_params, config.region)
    attach_phenology(species_params, config.region)
    attach_local_season(species_params, config.region)
    _fitted = sorted(s for s, p in species_params.items() if "fruiting" in p)
    print(f"Fitted fruiting model for {len(_fitted)} species: {', '.join(_fitted) or 'none'}")
    _gbm = sorted(s for s, p in species_params.items() if "fruiting_gbm" in p)
    print(f"Fruiting GBM for {len(_gbm)} species: {', '.join(_gbm) or 'none'}")
    _habitat = sorted(s for s, p in species_params.items() if "habitat" in p)
    print(f"Habitat factor for {len(_habitat)} species: {', '.join(_habitat) or 'none'}")
    _learned = sorted(s for s, p in species_params.items() if p.get("phenology") is not None)
    print(f"Learned season for {len(_learned)} species: {', '.join(_learned) or 'none'}")
    _local = sorted(s for s, p in species_params.items() if p.get("local_season") is not None)
    print(f"Local season for {len(_local)} species: {', '.join(_local) or 'none'}")
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

# The scheduler keeps no console output, so a region that failed at night left no trace (USW,
# 11 Oct 2026). Each run copies its output to app_operation/logs, outside the repo.
LOG_DIR = Path(__file__).resolve().parents[2] / "logs"
LOG_KEEP_DAYS = 30


class _Tee:
    """Writes to the console and the log at once."""

    def __init__(self, *streams):
        self.streams = [stream for stream in streams if stream is not None]

    def write(self, text):
        for stream in self.streams:
            stream.write(text)
        return len(text)

    def flush(self):
        for stream in self.streams:
            stream.flush()

    def __getattr__(self, name):
        return getattr(self.streams[0], name)


def log_run_to_file(region):
    """Copy this run's prints, warnings and tracebacks to LOG_DIR/<region>_<date>.log (line
    buffered, so a crash loses at most a line) and drop logs older than LOG_KEEP_DAYS.
    Returns the open log."""
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    for old in LOG_DIR.glob("*.log"):
        if time.time() - old.stat().st_mtime > LOG_KEEP_DAYS * 86400:
            old.unlink()
    log = open(LOG_DIR / f"{region}_{datetime.now():%Y-%m-%d}.log", "a", encoding="utf-8", buffering=1)
    sys.stdout, sys.stderr = _Tee(sys.stdout, log), _Tee(sys.stderr, log)
    return log


def run_pipeline(config: RegionConfig):
    faulthandler.enable(log_run_to_file(config.region))   # a hard crash dumps its stack there too
    print(f"Script started at {datetime.now()}")
    process_priority.normal_priority()   # not the scheduled task's low CPU, memory and I/O priority
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

    # Tonight's ERA5 rain order goes in before the WeatherAPI fetch; the orders that have
    # finished since earlier runs, tonight's too on a quiet night, download after it.
    points = [(round(float(lat), config.ndp), round(float(lon), config.ndp)) for lat, lon in coordinates]
    measured_rain = era5_rain.start(points, datetime.now().date())
    counter = CallCounter()
    weather_long = _fetch_all(config, coordinates, static_map, api_key, counter)
    print(f"API calls made: {counter.count} for {len(coordinates)} coordinates")
    # Only coords whose forecast arrived: a coord with rain alone would look fetched and
    # keep its base points from falling back to a neighbour's forecast.
    rain = measured_rain()
    fetched = set(zip(weather_long["Latitude"], weather_long["Longitude"]))
    rain = rain[[point in fetched for point in zip(rain["Latitude"], rain["Longitude"])]]
    weather_long = pd.concat([weather_long, rain], ignore_index=True)

    df = _join_to_base(config, weather_long, base_file_path)
    if str(main_data_path).endswith('.parquet'):
        update_parquet_master(config, df, species_params, zone_curves, main_data_path)
    else:
        df = _merge_and_score(config, df, species_params, zone_curves, main_data_path)
        save_df_to_file(df, main_data_path)
    # Hourly weather from free model files, for the crop forecasts to come. Last, and
    # caught: it must never cost Earth its run. The scores are saved: give their tables'
    # memory back first.
    del df, weather_long, rain, static_map
    gc.collect()
    try:
        # At every place (the base points, ~6-7 km apart), not just the ~10 km weather points:
        # a garden needs its own town's weather, and the model files cost nothing per point.
        places = read_df_from_source(base_file_path)[["Latitude", "Longitude"]].round(config.ndp)
        hourly = hourly_weather.run(config.region, list(places.drop_duplicates().itertuples(index=False, name=None)))
    except Exception as e:  # noqa: BLE001
        hourly = None
        print(f"Hourly weather failed: {e!r}")
    if hourly is not None:
        try:
            huerta.publish(config.region, hourly)
        except Exception as e:  # noqa: BLE001
            print(f"Huerta advice failed: {e!r}")
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
        "Wind Speed (kph)", "Wind Speed Mean (kph)", "Pressure (hPa)",
        "TotalPrecipitation_mm", "Rain Hours", "Snowfall (cm)", "Solar Radiation (Wh/m2)",
        "Humidity (%)", "Rain Measured",
        "dist_m_water", "dist_m_sea", "climate_zone", "ph_level", "Elevation (m)",
    ]
    weather_cols = [c for c in weather_cols if c in weather_long.columns]
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
    key = ["Location_Id", "Date"]
    index = pd.MultiIndex.from_frame(combined_df[key])
    assert not index.has_duplicates, (
        "combined_df has duplicate (Location_Id, Date) rows; merge_master dedup did not run"
    )
    where = index.get_indexer(pd.MultiIndex.from_frame(forward[key]))
    assert (where >= 0).all(), "forward rows missing from combined_df"
    # Written by position into fresh columns on a shallow copy: set_index/reset_index made two
    # full copies of the 42-day tail for ~45 columns that change.
    out = combined_df.copy(deep=False)
    for col in score_cols:
        if col not in out.columns:
            out[col] = pd.NA
        if col in forward.columns:
            values = out[col].to_numpy(copy=True)
            values[where] = forward[col].to_numpy()
            out[col] = values
    out.index = pd.RangeIndex(len(out))   # reset_index(drop=True) without its full copy
    return out


# What a measured (ERA5) day overwrites: rain only. Stored temperature and humidity
# already agree with measurements (correlation 0.95-0.99); scores and statics stay.
MEASURED_COLUMNS = ["TotalPrecipitation_mm", "Rain Hours", "Rain Measured"]


def _measured_mask(df):
    if "Rain Measured" not in df.columns:
        return pd.Series(False, index=df.index)
    return df["Rain Measured"].eq(True)


def _first_forecast_day(df):
    """Anchor "today" to the EARLIEST forecast date actually fetched (coordinate-local),
    not the server clock: forecast.json returns each coord's local 7 days, so US
    regions legitimately start a day behind a UTC/Europe runner. Using the server date
    would mis-align the forward window and the contiguity guarantee for those regions.
    Measured days are older than any forecast day and must not drag it back."""
    dates = pd.to_datetime(df.loc[~_measured_mask(df), "Date"])
    if dates.notna().any():
        return dates.min().normalize()
    return pd.Timestamp(datetime.now().date())


def apply_measured_weather(master, measured):
    """Write measured rain over the frozen days it covers and add the days the master
    lacks. Only MEASURED_COLUMNS change. Scores stay, since a frozen day is never
    rescored; the forward window reads the new rain through its lags."""
    key = ["Location_Id", "Date"]
    measured = (measured.assign(Date=pd.to_datetime(measured["Date"]))
                .drop_duplicates(key, keep="last"))
    where = pd.MultiIndex.from_frame(master[key]).get_indexer(
        pd.MultiIndex.from_frame(measured[key]))
    known = where >= 0
    for col in MEASURED_COLUMNS:
        if col not in measured.columns or col not in master.columns:
            continue
        values = measured[col].to_numpy()
        take = known & pd.notna(values)
        master.iloc[where[take], master.columns.get_loc(col)] = values[take]
    if known.all():
        return master
    added = measured.loc[~known, [c for c in master.columns if c in measured.columns]]
    return pd.concat([master, added], ignore_index=True)


def _merge_and_score(config, df, species_params, zone_curves, main_data_path,
                     *, existing_df=None, existing_exists=None, cutoff_date=None, lag_history=None):
    """The master's tail with the forecast merged in and the forward days scored. `lag_history`,
    when given, is the lag window before existing_df's first day with only the columns read from
    it (update_parquet_master streams those rows through unchanged): it feeds the elevation fill,
    the row filter, the gap check and the lags as those rows did when they were in existing_df."""
    # NOTE: the Date=today override is intentionally GONE — dates are the real forecast dates.
    if "Wind Speed (m/s)" not in df.columns and "Wind Speed (kph)" in df.columns:
        df["Wind Speed (m/s)"] = df["Wind Speed (kph)"] / 3.6
    is_measured = _measured_mask(df)
    measured, df = df[is_measured], df[~is_measured].copy()
    today = _first_forecast_day(df)

    for specie in species_params:
        col = f"{specie}_score"
        if col not in df.columns:
            # A float placeholder, not pd.NA: an object column stays object when the tail it
            # meets has no rows (pandas ignores all-NA columns only for now, and warns), and
            # round(2) skips object columns, so the scores went out unrounded.
            df[col] = np.nan
    # Location_Id -> fetched coord, taken now so the new rows' frame can go after the merge.
    loc_to_coord = None
    if {"_coord_lat", "_coord_lon"}.issubset(df.columns):
        loc_to_coord = (df[["Location_Id", "_coord_lat", "_coord_lon"]]
                        .dropna(subset=["_coord_lat", "_coord_lon"])
                        .drop_duplicates("Location_Id").set_index("Location_Id"))

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
        previous = existing_df if lag_history is None else pd.concat(
            [lag_history[["Location_Id", "Elevation (m)"]], existing_df[["Location_Id", "Elevation (m)"]]],
            ignore_index=True)
        df = replace_missing_elevation_from_previous_data(df, previous)
        del previous
        df = replace_missing_elevation_with_closest(df)
        combined_df = pd.concat([existing_df, df], ignore_index=True)   # merge_master, in two halves
    else:
        df = replace_missing_elevation_with_closest(df)
        combined_df = df.copy()
    # Both inputs are in combined_df now: let them go before deduplicating, which copies it.
    # The master's tail is the run's largest input.
    del existing_df, df
    combined_df = _keep_last(combined_df)
    if len(measured):
        try:
            combined_df = apply_measured_weather(combined_df, measured)
        except Exception as error:  # the stored rain stays, as it did before ERA5
            print(f"[warn] ERA5 rain not merged, stored rain kept: {error}", flush=True)

    combined_df = combined_df[np.isfinite(combined_df["Latitude"]) & np.isfinite(combined_df["Longitude"])]
    combined_df = combined_df[combined_df["Location_Id"] != ""]
    keys = combined_df[["Location_Id", "Date"]]
    if lag_history is not None:   # the same rows out of the history as out of the tail
        lag_history = lag_history[np.isfinite(lag_history["Latitude"]) & np.isfinite(lag_history["Longitude"])
                                  & (lag_history["Location_Id"] != "")]
        lag_history = lag_history.assign(Date=lag_history["Date"].astype(combined_df["Date"].dtype))
        keys = pd.concat([lag_history[["Location_Id", "Date"]], keys], ignore_index=True)

    assert_window_contiguous(keys, today, forward_days=FORECAST_DAYS, lookback=config.lag_days)
    del keys

    combined_df = combined_df.sort_values(["Location_Id", "Date"])
    lag_columns = [*LAG_COLUMNS, *(c for c in FRUITING_LAG_COLUMNS if c in combined_df.columns)]
    # Only the forward window (Date >= today) is rescored, and a forward row's deepest
    # lag reaches back exactly lag_days. So lag only [today - lag_days .. ]: frozen older
    # rows are never rescored and need no lag features. Bit-identical for forward rows
    # (every (loc, date-N) they reference is inside this slice), but far less data to
    # reindex when the master holds a year of history at base resolution.
    lag_start = today - pd.Timedelta(days=config.lag_days)
    in_window = pd.to_datetime(combined_df["Date"]).dt.normalize() >= lag_start
    # The lookups read only the keys and the lagged weather; only the forward rows, which are
    # scored, need every column. A copy of the whole window at full width was the merge's
    # largest allocation (~95 columns x 42 days x every place).
    lag_slice = combined_df.loc[in_window, ["Location_Id", "Date", *lag_columns]].copy()
    if lag_history is not None:
        # The window's older days ahead of the tail's, sorted as the tail is, so a coord-day
        # keeps the same last row when the lags dedupe it (the two never share a day).
        history = lag_history.sort_values(["Location_Id", "Date"]).reindex(columns=["Location_Id", "Date", *lag_columns])
        lag_slice = pd.concat([history, lag_slice], ignore_index=True)
        del history, lag_history
    target = combined_df.loc[in_window & forward_window_mask(combined_df, today)].copy()

    # Phase 2: weather (hence its lags) is identical across the base points that share a
    # fetched coord, so lag ONCE per coord and broadcast instead of once per base point.
    # The coord key (_coord_lat/_coord_lon) is carried from _join_to_base; history rows
    # (from the prior master) lack it, so re-derive it per base point via the current run's
    # Location_Id -> coord map. If any in-window row still has no coord key (un-baked base /
    # legacy), fall back to the per-base path, which is the original behaviour.
    if loc_to_coord is not None:
        for frame in (lag_slice, target):
            frame["_coord_lat"] = frame["Location_Id"].map(loc_to_coord["_coord_lat"])
            frame["_coord_lon"] = frame["Location_Id"].map(loc_to_coord["_coord_lon"])
        can_dedup = lag_slice["_coord_lat"].notna().all() and lag_slice["_coord_lon"].notna().all()
    else:
        can_dedup = False

    # Lookups span the slice; the lag columns land only on the rows rescored below.
    if can_dedup and len(lag_slice):
        forward = compute_lag_features_by_coord(lag_slice, lag_columns, days=config.lag_days, target=target)
    else:
        coords = [c for c in ("_coord_lat", "_coord_lon") if c in lag_slice.columns]
        forward = compute_lag_features(
            lag_slice.drop(columns=coords), lag_columns, days=config.lag_days,
            target=target.drop(columns=[c for c in coords if c in target.columns]))
    del lag_slice, target
    print(f"Scoring {len(forward)} forward rows (Date >= {today.date()}) "
          f"across {forward['Location_Id'].nunique()} locations")
    forward = calculate_mushroom_score(forward, species_params, zone_curves)
    try:
        forward = blend_neighbour_settings(forward, species_params, config)
    except Exception as error:      # the region's own scores stand, as before the blend
        print(f"[warn] scores not blended with the neighbour region's ({error}); the region's own stand")

    score_cols = [f"{s}_score" for s in species_params]
    forward = spatial_smooth_scores(forward, score_cols)
    # A composite (every porcini-type bolete) is the best of its members at each place and day.
    for composite, members in get_composites(config.region).items():
        present = [f"{m}_score" for m in members if f"{m}_score" in forward.columns]
        forward[f"{composite}_score"] = forward[present].max(axis=1) if present else np.nan
        score_cols.append(f"{composite}_score")
    updated_df = apply_forward_scores(combined_df, forward, score_cols)
    del forward, combined_df   # updated_df holds all that is left to write

    if cutoff_date is None:
        cutoff_date = datetime.now() - timedelta(days=config.cutoff_days)
    in_range = updated_df["Date"] > cutoff_date
    if not in_range.all():   # the 42-day tail always is: a filter that keeps every row is a full copy
        updated_df = updated_df[in_range]

    valid_score_columns = set(score_cols)
    species_score_columns = [c for c in updated_df.columns if c.endswith("_score") and c in valid_score_columns]
    # No snap to 10 above 9.5: it tied whole species lists at 100% and hid their order.
    updated_df[species_score_columns] = updated_df[species_score_columns].round(2)

    masterfile_columns = [
        "Location_Id", "Date", "Latitude", "Longitude", "Elevation (m)",
        "Pressure (hPa)", "TotalPrecipitation_mm", "Humidity (%)", "Wind Speed (m/s)",
        "Temperature (C) Max", "Temperature (C) Min", "Temperature (C)",
        "Wind Speed Mean (kph)", "Rain Hours", "Snowfall (cm)", "Solar Radiation (Wh/m2)",
        "Rain Measured", "dist_m_water", "dist_m_sea", "climate_zone", "ph_level",
    ]
    updated_df = updated_df.reindex(
        columns=masterfile_columns + species_score_columns)
    return updated_df


def update_parquet_master(config, df, species_params, zone_curves, main_data_path):
    """Replace the mutable tail of a parquet master. Only the rows a run can change enter pandas
    in full: from today, or from the oldest day ERA5 brought measured rain for (up to ~12 days
    back). The rest of the ``lag_days`` window is only read, for the lags and the checks, so it
    enters with those columns alone (LAG_HISTORY_COLUMNS) and is streamed through unchanged with
    the frozen history in Arrow batches. Its rows were filtered when they were the tail, so
    streaming them unfiltered writes the same rows (no master had one to filter, 17 Oct 2026)."""
    today = _first_forecast_day(df)
    split_date = today - pd.Timedelta(days=config.lag_days)
    measured_days = pd.to_datetime(df.loc[_measured_mask(df), "Date"]).dt.normalize()
    tail_from = max(split_date, min(today, measured_days.min()) if len(measured_days) else today)
    cutoff_date = pd.Timestamp(datetime.now() - timedelta(days=config.cutoff_days))
    exists = remote_file_exists(main_data_path)

    fd, output_name = tempfile.mkstemp(suffix=".parquet")
    os.close(fd)
    output_path = Path(output_name)
    try:
        if exists:
            with _local_parquet_source(main_data_path) as source_path:
                # Passed straight in, so only _merge_and_score holds the tail and can free it.
                updated_tail = _merge_and_score(
                    config, df, species_params, zone_curves, main_data_path,
                    existing_df=_read_recent_parquet(source_path, tail_from),
                    lag_history=_read_recent_parquet(source_path, split_date, before=tail_from,
                                                     columns=LAG_HISTORY_COLUMNS),
                    existing_exists=True, cutoff_date=cutoff_date,
                )
                _write_streaming_parquet(
                    source_path, output_path, updated_tail, tail_from, cutoff_date,
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
