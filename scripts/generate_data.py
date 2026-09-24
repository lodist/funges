"""Aggregate regional weather parquet files into a compact JSON for the Data Nerd page.

Reads the four R2 weather parquets (NE / SE / USE / USW), assigns each grid
point to a visually-meaningful oval region (defined as axis-aligned ellipses),
aggregates daily means per region, and writes public/data/data_nerd.json.

Weather is first averaged into BIN_DEG cells so every patch of land counts once
however densely its wilderness points are mapped, then summarised per zone and
region-wide (ALL_ZONE). A zone mean alone hides local weather -- a storm over
Valencia averages to ~0 mm across Iberia -- so each zone also carries the
across-cell spread for every page window (see ``window_spread``).

The visual regions are defined here for display — they are NOT the ML climate
zones used by the scoring model.
"""

import json
import math
from datetime import datetime, timedelta, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Iterator

import numpy as np
import pandas as pd
import pyarrow.parquet as pq
import requests

REGION_URLS: dict[str, str] = {
    "NE": "https://data.fung.es/EU/NE/NE_weather_data.parquet",
    "SE": "https://data.fung.es/EU/SE/SE_weather_data.parquet",
    "USE": "https://data.fung.es/USA/USE/USE_weather_data.parquet",
    "USW": "https://data.fung.es/USA/USW/USW_weather_data.parquet",
}

REGION_LABELS: dict[str, str] = {
    "NE": "North Europe",
    "SE": "South Europe",
    "USE": "US East",
    "USW": "US West",
}

# Visual oval regions: (cx_lon, cy_lat, rx_lon, ry_lat, label, hex_color)
# These are purely for visualization and data selection — not ML zones.
VISUAL_REGIONS: dict[str, dict[str, tuple]] = {
    "NE": {
        # Order matters: first match wins for overlapping ellipses
        "iceland":          (-19.0, 64.5,  4.5,  3.5, "Iceland",           "#9bf5b9"),
        "british_isles":    ( -3.5, 54.0,  6.0,  5.5, "British Isles",     "#96a8e4"),
        "north_sea_coast":  (  7.0, 53.5,  7.0,  3.5, "North Sea Coast",   "#dcd0fc"),
        "central_europe":   ( 15.0, 51.0,  9.0,  4.5, "Central Europe",    "#fcc0c0"),
        "scandinavia":      ( 14.0, 63.0,  9.0,  8.0, "Scandinavia",       "#fce8a8"),
        "finland_baltics":  ( 27.0, 61.0,  5.5,  7.5, "Finland & Baltics", "#c8dff8"),
    },
    "SE": {
        # alps_austria before france so Switzerland/Austria are claimed first
        "iberia":           ( -5.0, 40.0,  9.5,  5.5, "Iberia",            "#fcd8b4"),
        "alps_austria":     ( 12.5, 47.5,  5.5,  2.0, "Alps & Austria",    "#e8e4c4"),
        "france":           (  0.0, 46.5,  8.0,  5.0, "France",            "#b8ccf0"),
        "balkans":          ( 22.0, 43.0,  8.0,  6.0, "Balkans",           "#d4e4c8"),
        "italy":            ( 13.0, 42.5,  5.0,  7.0, "Italy",             "#b8e8c4"),
        "turkey":           ( 35.0, 38.5,  8.0,  4.5, "Turkey",            "#fcc0c0"),
    },
    "USE": {
        "northeast":        (-73.0, 42.5,  7.0,  5.0, "Northeast",         "#b8dcfc"),
        "appalachians":     (-81.0, 38.5,  4.5,  7.0, "Appalachians",      "#b4ece0"),
        "great_lakes":      (-88.0, 44.0,  8.0,  4.5, "Great Lakes",       "#dcd0fc"),
        "deep_south":       (-88.0, 31.0,  8.0,  4.0, "Deep South",        "#fcedb8"),
        "texas":            (-99.0, 31.0,  7.0,  5.0, "Texas",             "#fcc8c8"),
    },
    "USW": {
        "pacific_nw":       (-122.0, 46.5,  4.0,  5.0, "Pacific NW",       "#b4e0fc"),
        "california":       (-120.0, 37.0,  5.0,  6.0, "California",       "#fcd4c0"),
        "rockies":          (-112.0, 43.0,  8.0,  7.0, "Rockies",          "#dcd0fc"),
        "great_plains":     (-100.0, 39.0,  8.0,  7.0, "Great Plains",     "#fceabc"),
        "desert_sw":        (-111.0, 33.0,  7.0,  4.5, "Desert SW",        "#fcc8d8"),
    },
}

DAYS = 365
BIN_DEG = 0.25  # ~25 km cells: fine enough to resolve a regional storm
ALL_ZONE = "_all"  # region-wide rows and spread, the page's "all zones" view
WINDOWS = (7, 14, 30, 90, 365)  # must match DAY_OPTIONS in DataPage.tsx
COMPASS = ("e", "ne", "n", "nw", "w", "sw", "s", "se")
BATCH_SIZE = 100_000
DOWNLOAD_CHUNK_SIZE = 1024 * 1024
OUTPUT_PATH = Path("public/data/data_nerd.json")

WEATHER_COLS: dict[str, str] = {
    "TotalPrecipitation_mm": "precip_mm",
    "Temperature (C)": "temp_avg",
    "Temperature (C) Min": "temp_min",
    "Temperature (C) Max": "temp_max",
    "Humidity (%)": "humidity",
    "Wind Speed (m/s)": "wind_ms",
    "Pressure (hPa)": "pressure_hpa",
}


def download_parquet(url: str, destination: Path) -> None:
    """Stream a parquet to disk without retaining the response in memory."""
    print(f"Fetching {url} ...", flush=True)
    with requests.get(url, timeout=(30, 180), stream=True) as resp:
        resp.raise_for_status()
        with destination.open("wb") as output:
            for chunk in resp.iter_content(chunk_size=DOWNLOAD_CHUNK_SIZE):
                if chunk:
                    output.write(chunk)


def _safe_float(value: object, decimals: int) -> float | None:
    try:
        f = float(value)  # type: ignore[arg-type]
        return round(f, decimals) if math.isfinite(f) else None
    except (TypeError, ValueError):
        return None


def make_ellipse_geojson(cx: float, cy: float, rx: float, ry: float, n: int = 72) -> dict:
    """Return a smooth GeoJSON Polygon for an axis-aligned ellipse."""
    t = np.linspace(0, 2 * np.pi, n, endpoint=False)
    lons = (cx + rx * np.cos(t)).tolist()
    lats = (cy + ry * np.sin(t)).tolist()
    coords = [[lon, lat] for lon, lat in zip(lons, lats)]
    coords.append(coords[0])  # close ring
    return {"type": "Polygon", "coordinates": [coords]}


def assign_visual_regions(df: pd.DataFrame, regions: dict[str, tuple]) -> pd.Series:
    """Vectorised: assign each row to the first ellipse it falls inside."""
    result = pd.Series(None, index=df.index, dtype="object")
    lon = df["Longitude"].to_numpy()
    lat = df["Latitude"].to_numpy()
    for name, (cx, cy, rx, ry, _label, _color) in regions.items():
        inside = ((lon - cx) / rx) ** 2 + ((lat - cy) / ry) ** 2 <= 1.0
        unassigned = result.isna().to_numpy()
        result.iloc[inside & unassigned] = name
    return result


def build_zones_geo(regions: dict[str, tuple]) -> dict:
    """GeoJSON FeatureCollection of ellipse polygons, one per visual region."""
    features = []
    for name, (cx, cy, rx, ry, label, color) in regions.items():
        features.append({
            "type": "Feature",
            "properties": {"zone": name, "label": label, "color": color},
            "geometry": make_ellipse_geojson(cx, cy, rx, ry),
        })
    return {"type": "FeatureCollection", "features": features}


def _parquet_batches(
    parquet_path: Path, columns: list[str], batch_size: int
) -> Iterator[pd.DataFrame]:
    parquet = pq.ParquetFile(parquet_path)
    for batch in parquet.iter_batches(
        batch_size=batch_size, columns=columns, use_threads=True
    ):
        yield batch.to_pandas()


def _mean_of(totals: pd.DataFrame, columns: list[str]) -> pd.DataFrame:
    """Turn accumulated (column, sum|count) totals back into means."""
    out = pd.DataFrame(index=totals.index)
    for column in columns:
        counts = totals[(column, "count")]
        out[column] = totals[(column, "sum")].div(counts.where(counts > 0))
    return out


def wettest_direction(totals: pd.Series) -> str | None:
    """Compass direction of the wettest tenth of cells from the zone's centre.

    None when rain is uniform or the wet cells sit around the centre, so the
    page only names a direction when there is a real one.
    """
    values = totals.to_numpy()
    if len(values) < 2 or values.max() <= 0:
        return None
    lat = totals.index.get_level_values("blat").to_numpy() * BIN_DEG
    lon = totals.index.get_level_values("blon").to_numpy() * BIN_DEG
    wet = values >= np.quantile(values, 0.9)
    if wet.all():
        return None
    dy = lat[wet].mean() - lat.mean()
    dx = (lon[wet].mean() - lon.mean()) * math.cos(math.radians(lat.mean()))
    # ponytail: "central" = offset under 15% of the zone's half-extent
    radius = max(np.ptp(lat), np.ptp(lon), BIN_DEG) / 2
    if math.hypot(dx, dy) < 0.15 * radius:
        return None
    return COMPASS[round(math.degrees(math.atan2(dy, dx)) / 45) % 8]


def window_spread(cells: pd.DataFrame, today: pd.Timestamp) -> dict[str, dict]:
    """Across-cell spread for each page window, every window ending today.

    Rain uses each cell's window total (p50/p90 + where the wettest cells
    are); temperature, humidity and wind use each cell's window mean (p10/p90).
    """
    dates = cells.index.get_level_values("Date")
    out: dict[str, dict] = {}
    for window in WINDOWS:
        win = cells[(dates <= today) & (dates > today - pd.Timedelta(days=window))]
        if win.empty:
            continue
        per_cell = win.groupby(level=["blat", "blon"])
        spread: dict = {}
        if "precip_mm" in win:
            rain = per_cell["precip_mm"].sum()
            spread["rain_p50"] = _safe_float(rain.quantile(0.5), 1)
            spread["rain_p90"] = _safe_float(rain.quantile(0.9), 1)
            spread["rain_dir"] = wettest_direction(rain)
        for key in ("temp_avg", "humidity", "wind_ms"):
            if key in win:
                means = per_cell[key].mean()
                spread[f"{key}_p10"] = _safe_float(means.quantile(0.1), 1)
                spread[f"{key}_p90"] = _safe_float(means.quantile(0.9), 1)
        out[str(window)] = spread
    return out


def summarise_zone(
    zone: str,
    cells: pd.DataFrame,
    scores: pd.DataFrame | None,
    today: pd.Timestamp,
) -> tuple[list[dict], dict[str, dict]]:
    """Daily rows (cell-weighted means + precip_p90) and window spread."""
    by_date = cells.groupby(level="Date")
    daily = by_date.mean()
    if "precip_mm" in daily:
        # Share-of-area signal: at least a tenth of the zone got this much.
        daily["precip_p90"] = by_date["precip_mm"].quantile(0.9)

    rows: list[dict] = []
    for date, weather in daily.iterrows():
        entry: dict = {"date": date.strftime("%Y-%m-%d"), "zone": zone}
        for key, raw in weather.items():
            val = _safe_float(raw, 1)
            if val is not None:
                entry[key] = val
        if scores is not None and date in scores.index:
            day_scores = {
                col.removesuffix("_score"): val
                for col, raw in scores.loc[date].items()
                if (val := _safe_float(raw, 2)) is not None
            }
            if day_scores:
                entry["scores"] = day_scores
        rows.append(entry)
    return rows, window_spread(cells, today)


def aggregate_region(
    parquet_path: Path,
    regions: dict[str, tuple],
    batch_size: int = BATCH_SIZE,
) -> tuple[list[dict], list[str], dict[str, dict]]:
    """Aggregate a parquet with memory bounded by ``batch_size`` rows.

    Returns (daily rows, zone names, spread per zone). Rows and spread also
    carry ALL_ZONE; zone names do not.
    """
    parquet = pq.ParquetFile(parquet_path)
    schema_columns = parquet.schema_arrow.names
    score_cols = [c for c in schema_columns if c.endswith("_score")]
    present_weather = [c for c in WEATHER_COLS if c in schema_columns]
    read_columns = ["Date", "Latitude", "Longitude", *present_weather, *score_cols]

    cutoff = pd.Timestamp(
        datetime.now(timezone.utc).date() - timedelta(days=DAYS)
    )
    cell_totals: pd.DataFrame | None = None
    score_totals: pd.DataFrame | None = None

    for df in _parquet_batches(parquet_path, read_columns, batch_size):
        df["Date"] = pd.to_datetime(df["Date"])
        df = df[df["Date"] > cutoff]
        if df.empty:
            continue

        df["zone"] = assign_visual_regions(df, regions)
        df = df[df["zone"].notna()]
        if df.empty:
            continue
        df["blat"] = np.floor(df["Latitude"] / BIN_DEG).astype("int32")
        df["blon"] = np.floor(df["Longitude"] / BIN_DEG).astype("int32")

        cells = df.groupby(["Date", "zone", "blat", "blon"], sort=False)[
            present_weather
        ].agg(["sum", "count"])
        cell_totals = cells if cell_totals is None else cell_totals.add(cells, fill_value=0)
        if score_cols:
            # Scores stay point-weighted: they describe foraging spots, not land.
            scores = df.groupby(["Date", "zone"], sort=False)[score_cols].agg(["sum", "count"])
            score_totals = scores if score_totals is None else score_totals.add(scores, fill_value=0)

    if cell_totals is None:
        return [], [], {}

    cells = _mean_of(cell_totals, present_weather).rename(columns=WEATHER_COLS)
    del cell_totals
    today = pd.Timestamp(datetime.now(timezone.utc).date())
    zones = sorted(cells.index.get_level_values("zone").unique())

    rows: list[dict] = []
    spread: dict[str, dict] = {}

    def add(zone: str, zone_cells: pd.DataFrame, zone_scores: pd.DataFrame | None) -> None:
        zone_rows, spread[zone] = summarise_zone(zone, zone_cells, zone_scores, today)
        rows.extend(zone_rows)

    for zone in zones:
        add(
            zone,
            cells.xs(zone, level="zone"),
            _mean_of(score_totals.xs(zone, level="zone"), score_cols)
            if score_totals is not None else None,
        )
    # A cell cut by two ellipses appears once per zone; average it back to one.
    add(
        ALL_ZONE,
        cells.groupby(level=["Date", "blat", "blon"]).mean(),
        _mean_of(score_totals.groupby(level="Date").sum(), score_cols)
        if score_totals is not None else None,
    )

    rows.sort(key=lambda r: (r["zone"], r["date"]))
    return rows, zones, spread


def main() -> None:
    updated_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    regions_payload: dict[str, dict] = {}

    with TemporaryDirectory(prefix="funges-data-") as temp_dir:
        temp_path = Path(temp_dir)
        for region_id, url in REGION_URLS.items():
            parquet_path = temp_path / f"{region_id}.parquet"
            download_parquet(url, parquet_path)
            vis_regions = VISUAL_REGIONS[region_id]
            data, zones, spread = aggregate_region(parquet_path, vis_regions)
            zones_geo = build_zones_geo(vis_regions)
            regions_payload[region_id] = {
                "label": REGION_LABELS[region_id],
                "zones": zones,
                "zones_geo": zones_geo,
                "data": data,
                "spread": spread,
            }
            print(
                f"  {region_id}: {len(data)} rows across "
                f"{len(zones)} visual regions",
                flush=True,
            )
            parquet_path.unlink()

    payload = {
        "updated_at": updated_at,
        "days": DAYS,
        "regions": regions_payload,
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_PATH.open("w", encoding="utf-8") as f:
        json.dump(payload, f, separators=(",", ":"))

    size_kb = OUTPUT_PATH.stat().st_size / 1024
    print(f"Written {OUTPUT_PATH} ({size_kb:.1f} KB)")


if __name__ == "__main__":
    main()
