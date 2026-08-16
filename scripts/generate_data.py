"""Aggregate regional weather parquet files into a compact JSON for the Data Nerd page.

Reads the four R2 weather parquets (NE / SE / USE / USW), assigns each grid
point to a visually-meaningful oval region (defined as axis-aligned ellipses),
aggregates daily means per region, and writes public/data/data_nerd.json.

The visual regions are defined here for display — they are NOT the ML climate
zones used by the scoring model.
"""

import json
import math
from datetime import datetime, timedelta, timezone
from io import BytesIO
from pathlib import Path

import numpy as np
import pandas as pd
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


def fetch_parquet(url: str) -> pd.DataFrame:
    print(f"Fetching {url} ...")
    resp = requests.get(url, timeout=180)
    resp.raise_for_status()
    return pd.read_parquet(BytesIO(resp.content))


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


def aggregate_region(df: pd.DataFrame, regions: dict[str, tuple]) -> tuple[list[dict], list[str]]:
    df["Date"] = pd.to_datetime(df["Date"])
    cutoff = datetime.now(timezone.utc).date() - timedelta(days=DAYS)
    df = df[df["Date"].dt.date > cutoff].copy()

    df["visual_region"] = assign_visual_regions(df, regions)
    df = df[df["visual_region"].notna()]

    score_cols = [c for c in df.columns if c.endswith("_score")]
    present_weather = [c for c in WEATHER_COLS if c in df.columns]
    present_scores = [c for c in score_cols if c in df.columns]

    agg: dict[str, str] = {c: "mean" for c in present_weather + present_scores}
    grouped = (
        df.groupby(["Date", "visual_region"], sort=False)
        .agg(agg)
        .reset_index()
    )

    rows: list[dict] = []
    for _, row in grouped.iterrows():
        entry: dict = {
            "date": row["Date"].strftime("%Y-%m-%d"),
            "zone": str(row["visual_region"]),
        }
        for src_col, dst_key in WEATHER_COLS.items():
            if src_col not in row:
                continue
            val = _safe_float(row[src_col], 1)
            if val is not None:
                entry[dst_key] = val
        scores: dict[str, float] = {}
        for col in present_scores:
            val = _safe_float(row[col], 2)
            if val is not None:
                scores[col.removesuffix("_score")] = val
        if scores:
            entry["scores"] = scores
        rows.append(entry)

    rows.sort(key=lambda r: (r["zone"], r["date"]))
    zones = sorted({r["zone"] for r in rows})
    return rows, zones


def main() -> None:
    updated_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    regions_payload: dict[str, dict] = {}

    for region_id, url in REGION_URLS.items():
        df = fetch_parquet(url)
        vis_regions = VISUAL_REGIONS[region_id]
        data, zones = aggregate_region(df, vis_regions)
        zones_geo = build_zones_geo(vis_regions)
        regions_payload[region_id] = {
            "label": REGION_LABELS[region_id],
            "zones": zones,
            "zones_geo": zones_geo,
            "data": data,
        }
        print(f"  {region_id}: {len(data)} rows across {len(zones)} visual regions")

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
