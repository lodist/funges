"""Aggregate regional weather parquet files into a compact JSON for the Data Nerd page.

Reads the four R2 weather parquets (NE / SE / USE / USW), assigns each grid
point to a visually-meaningful oval region (defined as axis-aligned ellipses),
aggregates daily means per region, and writes public/data/data_nerd.json.

Weather is first averaged into BIN_DEG cells so every patch of land counts once
however densely its wilderness points are mapped, then summarised per zone and
region-wide (ALL_ZONE). A zone mean alone hides local weather -- a storm over
Valencia averages to ~0 mm across Iberia -- so each zone also carries the
across-cell spread for every page window (see ``window_spread``), including
rain hotspots named after the places the page's own basemap labels there.

The visual regions are defined here for display — they are NOT the ML climate
zones used by the scoring model.
"""

import gzip
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
import mapbox_vector_tile
from pmtiles.reader import Reader

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

# Rain hotspots: 8-connected groups of cells that got clearly more rain than
# the zone's median. Longer windows only show climate (the wet west coast), so
# hotspots are for the short windows a forager plans with.
HOTSPOT_WINDOWS = (7, 14, 30)
HOTSPOT_MIN_MM = 10.0
HOTSPOT_MEDIAN_FACTOR = 3.0
HOTSPOT_MIN_CELLS = 3  # a lone wet cell is a downpour, not an area worth naming
MAX_HOTSPOTS = 2
FLUSH_MIN_MM = 1.5  # minPrecip in DataPage.tsx's rain-first flush check

# The US parquets carry impossible daily rain (up to 2415 mm on 2026-09-11,
# over the world record) while Europe tops out near 125 mm. Treat anything
# above this as missing so a glitch cannot become a zone mean or a hotspot.
# ponytail: a flat cap; fix the upstream values and this becomes a no-op.
RAIN_MAX_MM_DAY = 300.0

# Place names come from the basemap ZoneMap draws (keep in sync with
# BASEMAP_URL in src/components/ZoneMap.tsx), so hotspots are named after the
# labels the reader sees on the map, in every UI language.
BASEMAP_URL = "https://data.fung.es/basemap/world_z12_20260619.pmtiles"
PLACE_ZOOM = 7  # regional cities; bigger hotspots step down to fewer, larger places
MAX_PLACE_TILES = 4
PLACE_LANGS = ("en", "de", "es", "fr", "it", "pt")  # src/i18n/locales
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


def _cell_center(cell: tuple[int, int]) -> tuple[float, float]:
    return (cell[0] + 0.5) * BIN_DEG, (cell[1] + 0.5) * BIN_DEG


def direction(cells: set[tuple[int, int]], zone_cells: list[tuple[int, int]]) -> str:
    """Compass direction of ``cells`` from the zone's centre ("c" = central)."""
    lat, lon = np.array([_cell_center(c) for c in cells]).mean(axis=0)
    zone = np.array([_cell_center(c) for c in zone_cells])
    zlat, zlon = zone.mean(axis=0)
    dy = lat - zlat
    dx = (lon - zlon) * math.cos(math.radians(zlat))
    # ponytail: "central" = offset under 15% of the zone's half-extent
    radius = max(np.ptp(zone[:, 0]), np.ptp(zone[:, 1]), BIN_DEG) / 2
    if math.hypot(dx, dy) < 0.15 * radius:
        return "c"
    return COMPASS[round(math.degrees(math.atan2(dy, dx)) / 45) % 8]


def _tile_xy(lat: float, lon: float, z: int) -> tuple[int, int]:
    n = 2**z
    x = int((lon + 180) / 360 * n)
    y = int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)
    return min(max(x, 0), n - 1), min(max(y, 0), n - 1)


class PlaceIndex:
    """Place labels from the basemap's Protomaps ``places`` layer.

    Tiles are read lazily with HTTP range requests and cached for the run, so
    naming a hotspot costs a few tile reads rather than a gazetteer to keep up
    to date. Naming is best-effort: any failure disables it for the run and
    hotspots fall back to a compass direction instead of failing the update.
    """

    def __init__(self, url: str = BASEMAP_URL) -> None:
        self._url = url
        self._session = requests.Session()
        self._reader: Reader | None = None
        self._tiles: dict[tuple[int, int, int], list[dict]] = {}
        self._broken = False

    def _get_bytes(self, offset: int, length: int) -> bytes:
        resp = self._session.get(
            self._url,
            headers={"Range": f"bytes={offset}-{offset + length - 1}"},
            timeout=(30, 120),
        )
        resp.raise_for_status()
        return resp.content

    def _tile_places(self, z: int, x: int, y: int) -> list[dict]:
        key = (z, x, y)
        if key in self._tiles:
            return self._tiles[key]
        if self._reader is None:
            self._reader = Reader(self._get_bytes)
        data = self._reader.get(z, x, y)
        places: list[dict] = []
        if data:
            if data[:2] == b"\x1f\x8b":
                data = gzip.decompress(data)
            layer = mapbox_vector_tile.decode(
                data, default_options={"y_coord_down": True}
            ).get("places") or {}
            extent = layer.get("extent", 4096)
            n = 2**z
            for feature in layer.get("features", []):
                props, geom = feature["properties"], feature["geometry"]
                if props.get("kind") != "locality" or geom.get("type") != "Point":
                    continue
                if not props.get("name"):
                    continue
                px, py = geom["coordinates"]
                lon = (x + px / extent) / n * 360 - 180
                lat = math.degrees(
                    math.atan(math.sinh(math.pi * (1 - 2 * (y + py / extent) / n)))
                )
                places.append({"lat": lat, "lon": lon, "props": props})
        self._tiles[key] = places
        return places

    def places_in(
        self,
        cells: set[tuple[int, int]],
        zone_cells: set[tuple[int, int]] | None = None,
        limit: int = 2,
    ) -> list[dict]:
        """The most prominent map labels in (or beside) ``cells``, as
        ``{"name": local name, "<lang>": translation, ...}``.

        ``zone_cells`` (the zone's land) ranks a coastal city just outside the
        hotspot ahead of a town across the sea or the border."""
        if self._broken or not cells:
            return []
        near = {
            (lat + dy, lon + dx)
            for lat, lon in cells
            for dy in (-1, 0, 1)
            for dx in (-1, 0, 1)
        }
        lats = [c[0] for c in near]
        lons = [c[1] for c in near]

        def cell_of(place: dict) -> tuple[int, int]:
            return (
                math.floor(place["lat"] / BIN_DEG),
                math.floor(place["lon"] / BIN_DEG),
            )

        def tiles(z: int) -> list[tuple[int, int]]:
            x0, y0 = _tile_xy((max(lats) + 1) * BIN_DEG, min(lons) * BIN_DEG, z)
            x1, y1 = _tile_xy(min(lats) * BIN_DEG, (max(lons) + 1) * BIN_DEG, z)
            return [(x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)]

        # Start at the most detailed zoom the hotspot fits in MAX_PLACE_TILES
        # tiles (a big hotspot gets the big cities the map shows zoomed out),
        # and zoom in only while nothing is labelled there.
        start = next(
            (z for z in range(PLACE_ZOOM, 3, -1) if len(tiles(z)) <= MAX_PLACE_TILES), 4
        )
        found: list[dict] = []
        try:
            for z in range(start, PLACE_ZOOM + 1):
                found = [
                    place
                    for x, y in tiles(z)
                    for place in self._tile_places(z, x, y)
                    if cell_of(place) in near
                ]
                if found:
                    break
        except Exception as exc:  # naming must never fail the data update
            print(f"  place names disabled: {exc!r}", flush=True)
            self._broken = True
            return []

        # Places on the zone's land before ones past its edge (across a sea
        # or border), then the map's own ranking: the zoom a label appears
        # at, population breaking ties.
        home = zone_cells or cells
        found.sort(
            key=lambda p: (
                cell_of(p) not in home,
                p["props"].get("min_zoom", 99),
                -(p["props"].get("population_rank") or 0),
                -(p["props"].get("population") or 0),
            )
        )
        names: list[dict] = []
        for place in found:
            props = place["props"]
            if any(n["name"] == props["name"] for n in names):
                continue
            entry = {"name": props["name"]}
            for lang in PLACE_LANGS:
                translated = props.get(f"name:{lang}")
                if translated and translated != props["name"]:
                    entry[lang] = translated
            names.append(entry)
            if len(names) == limit:
                break
        return names


def _clusters(cells: set[tuple[int, int]]) -> list[set[tuple[int, int]]]:
    """8-connected groups of cells."""
    todo = set(cells)
    groups = []
    while todo:
        stack = [todo.pop()]
        group = set(stack)
        while stack:
            lat, lon = stack.pop()
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    neighbour = (lat + dy, lon + dx)
                    if neighbour in todo:
                        todo.remove(neighbour)
                        group.add(neighbour)
                        stack.append(neighbour)
        groups.append(group)
    return groups


def _daily_mean_over(rain: pd.Series, cells: set[tuple[int, int]]) -> pd.Series:
    """Per-day mean rain over ``cells`` from a (Date, blat, blon) series."""
    keys = pd.MultiIndex.from_arrays(
        [rain.index.get_level_values("blat"), rain.index.get_level_values("blon")]
    )
    return rain[keys.isin(list(cells))].groupby(level="Date").mean()


def is_flush(daily: pd.Series, today: pd.Timestamp) -> bool:
    """DataPage's rain-first check: wet 7-10 days ago, dry the last 1-4 days."""

    def share(days: range, wet: bool) -> float:
        vals = [daily.get(today - pd.Timedelta(days=d)) for d in days]
        vals = [v for v in vals if v is not None and math.isfinite(v)]
        if not vals:
            return 0.0
        return sum(bool(v >= FLUSH_MIN_MM) == wet for v in vals) / len(vals)

    return bool(share(range(7, 11), True) >= 0.5 and share(range(1, 5), False) >= 0.75)


def find_hotspots(
    totals: pd.Series,
    window_rain: pd.Series,
    recent_rain: pd.Series,
    today: pd.Timestamp,
    places: PlaceIndex | None,
) -> list[dict]:
    """Areas that got clearly more rain than the zone's median.

    ``totals`` is each cell's window total; ``window_rain`` / ``recent_rain``
    are daily per-cell rain for the window and the last 11 days (flush check).
    """
    threshold = max(HOTSPOT_MIN_MM, HOTSPOT_MEDIAN_FACTOR * max(totals.median(), 1.0))
    wet = totals[totals >= threshold]
    groups = [g for g in _clusters(set(wet.index)) if len(g) >= HOTSPOT_MIN_CELLS]
    groups.sort(key=lambda g: -wet.loc[list(g)].sum())

    hotspots = []
    for group in groups[:MAX_HOTSPOTS]:
        amounts = wet.loc[list(group)]
        spot: dict = {
            # Median and p90 of the hotspot's cells: robust to one bad cell.
            "rain_mm": _safe_float(amounts.median(), 1),
            "rain_high": _safe_float(amounts.quantile(0.9), 1),
            "peak_date": _daily_mean_over(window_rain, group)
            .idxmax()
            .strftime("%Y-%m-%d"),
            "flush": is_flush(_daily_mean_over(recent_rain, group), today),
        }
        names = places.places_in(group, set(totals.index)) if places else []
        if names:
            spot["places"] = names
        else:
            spot["dir"] = direction(group, list(totals.index))
        hotspots.append(spot)
    return hotspots


def window_spread(
    cells: pd.DataFrame, today: pd.Timestamp, places: PlaceIndex | None = None
) -> dict[str, dict]:
    """Across-cell spread for each page window, every window ending today.

    Rain: the median cell's window total plus hotspots (short windows only);
    temperature, humidity and wind: p10/p90 of each cell's window mean.
    """
    cells = cells[cells.index.get_level_values("Date") <= today]
    dates = cells.index.get_level_values("Date")
    has_rain = "precip_mm" in cells
    recent_rain = (
        cells.loc[dates > today - pd.Timedelta(days=11), "precip_mm"]
        if has_rain
        else None
    )
    out: dict[str, dict] = {}
    for window in WINDOWS:
        win = cells[dates > today - pd.Timedelta(days=window)]
        if win.empty:
            continue
        per_cell = win.groupby(level=["blat", "blon"])
        spread: dict = {}
        if has_rain:
            totals = per_cell["precip_mm"].sum()
            spread["rain_p50"] = _safe_float(totals.median(), 1)
            if window in HOTSPOT_WINDOWS:
                spread["hotspots"] = find_hotspots(
                    totals, win["precip_mm"], recent_rain, today, places
                )
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
    places: PlaceIndex | None = None,
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
    return rows, window_spread(cells, today, places)


def aggregate_region(
    parquet_path: Path,
    regions: dict[str, tuple],
    batch_size: int = BATCH_SIZE,
    places: PlaceIndex | None = None,
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
        if "TotalPrecipitation_mm" in df:
            df.loc[df["TotalPrecipitation_mm"] > RAIN_MAX_MM_DAY, "TotalPrecipitation_mm"] = np.nan
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
        zone_rows, spread[zone] = summarise_zone(
            zone, zone_cells, zone_scores, today, places
        )
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
    places = PlaceIndex()

    with TemporaryDirectory(prefix="funges-data-") as temp_dir:
        temp_path = Path(temp_dir)
        for region_id, url in REGION_URLS.items():
            parquet_path = temp_path / f"{region_id}.parquet"
            download_parquet(url, parquet_path)
            vis_regions = VISUAL_REGIONS[region_id]
            data, zones, spread = aggregate_region(
                parquet_path, vis_regions, places=places
            )
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
