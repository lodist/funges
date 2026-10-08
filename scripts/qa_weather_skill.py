"""Does the weather model have timing skill? A case-crossover test with an outing placebo.

Every find is compared with the same location on control days 14 and 21 days before and
after it. They share the find's weekday, sit outside its 7-day moisture window, and are
symmetric, so the seasonal trend cancels. Everything fixed at the place drops out:
habitat, elevation, pH, and who looks and shares there.

What still varies is the weather, and when people go out. Weekends are matched away, but
people also go out because it rained. Perennial brackets measure that: they are on the
tree all year and logged by the same people on the same walks. A species' weather part
scored on bracket find days shows how much "skill" outings alone produce.

    weather   percentile of the weather part on find days among control days (0.5 = none)
    placebo   the same species' weather part, on bracket find days
    net       weather - placebo: the timing skill that is about fruiting
    static    constant per location, so it must come out at exactly 0.5 (harness check)

Every score is recomputed from raw weather with the current code. --weather era5 swaps the
stored WeatherAPI weather (each day's day-0 forecast, before #290) for ERA5 at the same
points, from the Open-Meteo archive (free for non-commercial use), to tell a model without
skill from inputs too noisy to show it. Run both with the same --max-locations and
--finds file and they score identical cases.

    python scripts/qa_weather_skill.py --max-locations 800
    python scripts/qa_weather_skill.py --max-locations 800 --weather era5
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
from datetime import date
from io import StringIO
from pathlib import Path
from urllib.parse import urlparse

import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.fs as pafs
import pyarrow.parquet as pq
import requests
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "scripts"))

import forecast_pipeline as fp
import seasonality as sn
from qa_season_branch_replay import BRANCH_LAG_COLUMNS, RAW_COLUMNS, load_specs
from qa_season_scan import chord_to_km, unit_xyz
from species_registry import get_empirical_taxon_map

# Same weekday as the find, outside its 7-day moisture window, symmetric.
CONTROL_OFFSETS = (-21, -14, 14, 21)
LAG_DAYS = 42
MAX_MATCH_KM = 10
MAX_UNCERTAINTY_M = 5000
# Perennial brackets: Fomes fomentarius, Fomitopsis pinicola, Ganoderma applanatum,
# Fomitopsis mounceae (F. pinicola's North American split).
PLACEBO_KEYS = [8068867, 2542395, 2549834, 10825597]
PLACEBO = "placebo"
CONTINENTS = {
    "EU": (("NE", "SE"), (-25.0, 34.0, 45.0, 72.0)),
    "US": (("USE", "USW"), (-170.0, 24.0, -60.0, 72.0)),
}
WEATHER_COMPONENTS = {"Temp", "Humidity", "Moisture"}
# Rain (Moisture) is episodic; temperature and humidity also follow the season, and a
# Gaussian optimum peaks wherever the season does, which symmetric controls cannot cancel.
COMPONENT_COLUMNS = {"Temp": "temp", "Humidity": "humidity", "Moisture": "moisture"}
WEATHER_COLUMNS = ("weather_part", *COMPONENT_COLUMNS.values())
NAMES_NO_PH = ["Temp", "Humidity", "Moisture", "Altitude", "Water/Sea"]
NAMES_PH = ["Temp", "Humidity", "Moisture", "Altitude", "pH", "Water/Sea"]
GBIF = "https://api.gbif.org/v1/occurrence/search"
ERA5 = "https://archive-api.open-meteo.com/v1/archive"
ERA5_COLUMNS = {
    "precipitation_sum": "TotalPrecipitation_mm",
    "temperature_2m_mean": "Temperature (C)",
    "relative_humidity_2m_mean": "Humidity (%)",
    "wind_speed_10m_max": "Wind Speed (m/s)",  # km/h, converted below
}


def crossover(cases: pd.DataFrame, series: pd.DataFrame, column: str) -> np.ndarray:
    """Percentile of each find day's `column` among its own location's control days.
    Finds without a usable control on both sides are dropped: the trend would not cancel."""
    lookup = series.set_index(["Location_Id", "Date"])[column]
    lookup = lookup[~lookup.index.duplicated(keep="last")]
    locations, days = cases["Location_Id"].to_numpy(), pd.to_datetime(cases["Date"])

    def values(offset):
        index = pd.MultiIndex.from_arrays([locations, days + pd.Timedelta(days=offset)])
        return lookup.reindex(index).to_numpy(float)

    case = values(0)
    controls = np.column_stack([values(offset) for offset in CONTROL_OFFSETS])
    valid = np.isfinite(controls)
    half = len(CONTROL_OFFSETS) // 2
    usable = np.isfinite(case) & valid[:, :half].any(axis=1) & valid[:, half:].any(axis=1)
    below = (valid & (controls < case[:, None])).sum(axis=1)
    equal = (valid & (controls == case[:, None])).sum(axis=1)
    percentile = (below + 0.5 * equal) / np.maximum(valid.sum(axis=1), 1)
    return percentile[usable]


def bootstrap(a: np.ndarray, b: np.ndarray | None = None, seed: int = 20261007) -> list[float]:
    """95% CI of mean(a), or of mean(a) - mean(b) with both resampled."""
    rng = np.random.default_rng(seed)
    draws = [rng.choice(a, len(a)).mean() - (0 if b is None else rng.choice(b, len(b)).mean())
             for _ in range(2000)]
    return [round(float(q), 3) for q in np.quantile(draws, [0.025, 0.975])]


def get_with_retry(session: requests.Session, url: str, params, what: str, attempts: int = 8) -> dict:
    problem = ""
    for attempt in range(attempts):
        try:
            response = session.get(url, params=params, timeout=120)
            if response.status_code == 429 or response.status_code >= 500:
                problem = f"{response.status_code} {response.text[:200]}"
            else:
                response.raise_for_status()
                return response.json()
        except (requests.ConnectionError, requests.Timeout, requests.exceptions.ChunkedEncodingError) as error:
            problem = str(error)  # a dropped connection is as passing as a 503
        time.sleep(min(60, 2 ** attempt))
    raise RuntimeError(f"{what} kept failing: {problem}")


def fetch_finds(session: requests.Session, keys: list[int], start: str, end: str,
                box: tuple, max_records: int | None = None) -> pd.DataFrame:
    """Every coordinate-precise human observation of `keys` inside `box`, one row each;
    with max_records, an even sample of pages across the whole result instead."""
    west, south, east, north = box
    params = [("taxonKey", key) for key in keys] + [
        ("basisOfRecord", "HUMAN_OBSERVATION"), ("occurrenceStatus", "PRESENT"),
        ("hasCoordinate", "true"), ("hasGeospatialIssue", "false"),
        ("coordinateUncertaintyInMeters", f"0,{MAX_UNCERTAINTY_M}"),
        ("eventDate", f"{start},{end}"),
        ("decimalLatitude", f"{south},{north}"), ("decimalLongitude", f"{west},{east}"),
        ("limit", 300),
    ]
    first = get_with_retry(session, GBIF, params + [("offset", 0)], "GBIF")
    total = first.get("count", 0)
    if total > 100_000:
        print(f"    [warn] {total:,} records, past GBIF's 100k paging limit")
    reachable = min(total, 100_000)
    if max_records and reachable > max_records:
        offsets = sorted(set(np.linspace(0, reachable - 300, max_records // 300, dtype=int).tolist()))
    else:
        offsets = list(range(0, reachable, 300))
    rows = []
    for offset in offsets:
        page = first if offset == 0 else get_with_retry(session, GBIF, params + [("offset", offset)], "GBIF")
        for record in page.get("results", []):
            parts = (record.get("year"), record.get("month"), record.get("day"))
            if None in parts or record.get("decimalLatitude") is None:
                continue
            try:
                observed = date(*map(int, parts)).isoformat()
            except ValueError:
                continue
            if start <= observed <= end:
                rows.append((record["decimalLatitude"], record["decimalLongitude"], observed))
    return pd.DataFrame(rows, columns=["lat", "lon", "date"])


def load_locations(region: str) -> pd.DataFrame:
    raw = fp.r2_fetch(fp.get_required_env(f"{region}_BASE_DATA")).decode("utf-8")
    base = pd.read_csv(StringIO(raw), usecols=["Location_Id", "Latitude", "Longitude"])
    return base.assign(region=region)


def match_finds(finds: pd.DataFrame, locations: pd.DataFrame) -> pd.DataFrame:
    """Nearest base point across the continent's regions, never split at a latitude line:
    NE and SE (and USE and USW) overlap, so the nearest point decides the region."""
    tree = cKDTree(unit_xyz(locations.Latitude.to_numpy(), locations.Longitude.to_numpy()))
    distance, index = tree.query(unit_xyz(finds.lat.to_numpy(), finds.lon.to_numpy()), k=1)
    near = chord_to_km(distance) <= MAX_MATCH_KM
    hit = locations.iloc[index[near]].reset_index(drop=True)
    return pd.DataFrame({
        "species": finds.species.to_numpy()[near],
        "Location_Id": hit.Location_Id, "region": hit.region,
        "Date": pd.to_datetime(finds.date.to_numpy()[near]),
    }).drop_duplicates(["species", "Location_Id", "Date"])


def sample_locations(finds: pd.DataFrame, limit: int) -> pd.DataFrame:
    """Deterministic location subset (hash order), identical across --weather runs."""
    if not limit:
        return finds
    ids = pd.Series(finds.Location_Id.unique())
    order = ids.map(lambda value: hashlib.blake2b(value.encode(), digest_size=8).hexdigest())
    keep = set(ids[order.argsort().to_numpy()[:limit]])
    return finds[finds.Location_Id.isin(keep)]


def r2_filesystem() -> pafs.S3FileSystem:
    endpoint = urlparse(fp.get_required_env("R2_ENDPOINT_URL"))
    return pafs.S3FileSystem(
        endpoint_override=endpoint.netloc, scheme=endpoint.scheme or "https", region="auto",
        access_key=fp.get_required_env("R2_ACCESS_KEY_ID"),
        secret_key=fp.get_required_env("R2_SECRET_ACCESS_KEY"),
    )


def read_weather(s3, region: str, location_ids: set, first, last) -> pd.DataFrame:
    """Stored weather for these locations, reading only row groups that overlap the dates."""
    key = fp._r2_key(fp.get_required_env(f"{region}_WEATHER_DATA"))
    parquet = pq.ParquetFile(s3.open_input_file(f"{fp.get_required_env('R2_BUCKET_NAME')}/{key}"))
    after, before = first - pd.Timedelta(days=1), last + pd.Timedelta(days=1)
    wanted = list(location_ids)
    pieces = []
    for group in range(parquet.num_row_groups):
        if not fp._row_group_may_overlap(parquet, group, after=after, before=before):
            continue
        table = parquet.read_row_group(group, columns=RAW_COLUMNS)
        table = table.filter(pc.and_(fp._arrow_date_mask(table, after=after, before=before),
                                     pc.is_in(table["Location_Id"], value_set=pa.array(wanted))))
        if len(table):
            pieces.append(table.to_pandas())
    frame = pd.concat(pieces, ignore_index=True)
    frame["Date"] = pd.to_datetime(frame["Date"]).dt.normalize()
    return (frame.drop_duplicates(["Location_Id", "Date"], keep="last")
            .sort_values(["Location_Id", "Date"]).reset_index(drop=True))



def era5_weather(session: requests.Session, points: pd.DataFrame, first, last,
                 cache: Path | None) -> pd.DataFrame:
    """ERA5 daily weather at each location, in the columns the score reads."""
    have = pd.read_parquet(cache) if cache and cache.exists() else pd.DataFrame(columns=["Location_Id"])
    missing = points[~points.Location_Id.isin(set(have.Location_Id))]
    # Open-Meteo bills each location per 2 weeks of data (~12 calls here) against 600 a
    # minute, 5,000 an hour and 10,000 a day: small batches, wait out every 429, and keep
    # what arrived so an interrupted run does not spend the quota twice.
    for start in range(0, len(missing), 20):
        batch = missing.iloc[start:start + 20]
        reply = get_with_retry(session, ERA5, {
            "latitude": ",".join(f"{v:.4f}" for v in batch.Latitude),
            "longitude": ",".join(f"{v:.4f}" for v in batch.Longitude),
            "start_date": first.date().isoformat(), "end_date": last.date().isoformat(),
            "daily": ",".join(ERA5_COLUMNS), "timezone": "auto",
        }, "Open-Meteo", attempts=90)
        frames = []
        for location_id, series in zip(batch.Location_Id, reply if isinstance(reply, list) else [reply]):
            daily = pd.DataFrame(series["daily"]).rename(columns=ERA5_COLUMNS)
            frames.append(daily.assign(Location_Id=location_id, Date=pd.to_datetime(daily.pop("time"))))
        have = pd.concat([have, *frames], ignore_index=True)
        if cache:
            have.to_parquet(cache, index=False)
        print(f"    ERA5 {min(start + 20, len(missing))}/{len(missing)} new locations", flush=True)
    era5 = have[have.Location_Id.isin(set(points.Location_Id))].copy()
    era5["Wind Speed (m/s)"] = era5["Wind Speed (m/s)"].astype(float) / 3.6
    return era5


def decompose(frame: pd.DataFrame, species: str, params: dict, zone_curves: dict) -> pd.DataFrame:
    """Score the frame and return the weather-only and static-only geometric parts."""
    captured = []
    original = fp._hybrid_component_mean_rows

    def spy(components, weights, **kwargs):
        captured.append((np.asarray(components, float), np.asarray(weights, float)))
        return original(components, weights, **kwargs)

    fp._hybrid_component_mean_rows = spy
    try:
        scored = fp.calculate_mushroom_score(frame.copy(), {species: params[species]}, zone_curves)
    finally:
        fp._hybrid_component_mean_rows = original

    # Rows with and without pH are scored in separate calls; stitch both back by row.
    out = frame[["Location_Id", "Date"]].copy()
    has_ph = frame["ph_level"].notna().to_numpy()
    for column in ("weather_part", "static_part", *COMPONENT_COLUMNS.values()):
        out[column] = np.nan
    for components, weights in captured:
        names = NAMES_PH if components.shape[0] == 6 else NAMES_NO_PH
        rows = has_ph if components.shape[0] == 6 else ~has_ph
        if components.shape[1] != len(frame):
            continue
        components = np.clip(components, 0.02, 1.0)

        def geometric(selected):
            mask = np.array([n in selected for n in names]) & (weights > 0)
            if not mask.any():
                return np.ones(components.shape[1])
            chosen, chosen_weights = components[mask], weights[mask]
            return np.exp((chosen_weights[:, None] * np.log(chosen)).sum(axis=0) / chosen_weights.sum())

        out.loc[rows, "weather_part"] = geometric(WEATHER_COMPONENTS)[rows]
        out.loc[rows, "static_part"] = geometric(set(names) - WEATHER_COMPONENTS)[rows]
        for name, column in COMPONENT_COLUMNS.items():
            out.loc[rows, column] = components[names.index(name)][rows]
    if params[species].get("wind_sensitive", False):
        out["weather_part"] *= fp._lagged_wind_factor(frame)
    # The calendar also varies between a find and its controls; carried so the full
    # score's skill can be attributed.
    out["season_part"] = (sn.season_multiplier_for_species(frame, species, params[species], zone_curves)
                          * sn.season_gate_for_species(frame, species, params[species], zone_curves))
    out["full_score"] = scored[f"{species}_score"].to_numpy()
    return out


def summarise(cases: dict, placebo: dict, min_cases: int) -> dict:
    """cases: column -> per-find percentiles. placebo: weather column -> the same, on bracket finds."""
    entry = {"n": int(len(cases["weather_part"])), "placebo_n": int(len(placebo["weather_part"]))}
    if entry["n"] < min_cases:
        entry["verdict"] = "not testable"
        return entry
    for column, values in cases.items():
        entry[column] = round(float(values.mean()), 3)
    entry["weather_part_ci"] = bootstrap(cases["weather_part"])
    if entry["placebo_n"] >= min_cases:
        for column in WEATHER_COLUMNS:
            entry[f"{column}_placebo"] = round(float(placebo[column].mean()), 3)
            entry[f"{column}_net"] = round(float(cases[column].mean() - placebo[column].mean()), 3)
            entry[f"{column}_net_ci"] = bootstrap(cases[column], placebo[column])
    return entry


def line(species: str, entry: dict) -> str:
    if "weather_part" not in entry:
        return f"  {species:22s} n={entry['n']:5d}  not testable"

    def net(column):
        value = entry.get(f"{column}_net")
        return "   -  " if value is None else f"{value:+.3f}"

    return (f"  {species:22s} n={entry['n']:5d}  weather {entry['weather_part']:.3f} "
            f"net {net('weather_part')} {entry.get('weather_part_net_ci', '')}  |  temp {net('temp')}  "
            f"humidity {net('humidity')}  rain {net('moisture')}  |  static {entry['static_part']:.3f}  "
            f"season {entry['season_part']:.3f}")


def cached(path: Path | None, build):
    if path and path.exists():
        return pd.read_parquet(path)
    frame = build()
    if path:
        frame.to_parquet(path, index=False)
    return frame


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--start", default="2026-06-14", help="first find date (42 lag + 21 control days into R2)")
    parser.add_argument("--end", default="2026-09-11", help="last find date (21 control days before the newest weather)")
    parser.add_argument("--weather", choices=("stored", "era5"), default="stored")
    parser.add_argument("--max-locations", type=int, default=0, help="0 = every matched location")
    parser.add_argument("--min-cases", type=int, default=20)
    parser.add_argument("--finds", default=None, help="matched-finds CSV to reuse (written on first run)")
    parser.add_argument("--output", default="docs/qa/weather-skill")
    parser.add_argument("--cache", default=None, help="directory for weather read from R2 / Open-Meteo")
    args = parser.parse_args()
    cache = Path(args.cache) if args.cache else None
    if cache:
        cache.mkdir(parents=True, exist_ok=True)

    fp.load_dotenv(ROOT / ".env")
    fp.load_dotenv(ROOT / ".env.secret")
    session = requests.Session()
    session.headers["User-Agent"] = "fung.es weather skill QA"
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    finds_path = Path(args.finds or output / f"finds-{args.start}_{args.end}.csv")

    if finds_path.exists():
        finds = pd.read_csv(finds_path, parse_dates=["Date"])
        print(f"reusing {len(finds):,} matched finds from {finds_path}")
    else:
        taxa = {**get_empirical_taxon_map(), PLACEBO: PLACEBO_KEYS}
        matched = []
        for continent, (regions, box) in CONTINENTS.items():
            locations = pd.concat([load_locations(region) for region in regions], ignore_index=True)
            for species, keys in taxa.items():
                raw = fetch_finds(session, keys, args.start, args.end, box)
                if raw.empty:
                    continue
                found = match_finds(raw.assign(species=species), locations)
                print(f"  {continent} {species:22s} {len(raw):6,} records -> {len(found):6,} location-days",
                      flush=True)
                matched.append(found)
        finds = pd.concat(matched, ignore_index=True)
        finds.to_csv(finds_path, index=False)
    finds = sample_locations(finds, args.max_locations)

    s3 = r2_filesystem()
    first = pd.Timestamp(args.start) + pd.Timedelta(days=min(CONTROL_OFFSETS) - LAG_DAYS)
    last = pd.Timestamp(args.end) + pd.Timedelta(days=max(CONTROL_OFFSETS))
    results, pooled = {}, {}
    for region in ("NE", "SE", "USE", "USW"):
        here = finds[finds.region == region]
        if here.empty:
            continue
        print(f"{region}: {len(here):,} location-days at {here.Location_Id.nunique():,} locations", flush=True)
        span = f"{first:%Y%m%d}-{last:%Y%m%d}"
        ids = sorted(set(here.Location_Id))
        digest = hashlib.blake2b("|".join(ids).encode(), digest_size=6).hexdigest()
        history = cached(cache and cache / f"stored-{region}-{span}-{digest}.parquet",
                         lambda: read_weather(s3, region, set(ids), first, last))
        if args.weather == "era5":
            points = history.drop_duplicates("Location_Id")[["Location_Id", "Latitude", "Longitude"]]
            era5 = era5_weather(session, points, first, last, cache and cache / f"era5-{region}-{span}.parquet")
            history = history.drop(columns=list(ERA5_COLUMNS.values())).merge(
                era5, on=["Location_Id", "Date"], how="left")
        # Score only the find and control days; lags still read the whole history.
        days = pd.concat([here[["Location_Id", "Date"]].assign(Date=here.Date + pd.Timedelta(days=o))
                          for o in (0, *CONTROL_OFFSETS)]).drop_duplicates()
        target = history.merge(days, on=["Location_Id", "Date"])
        frame = fp.compute_lag_features(history, BRANCH_LAG_COLUMNS, LAG_DAYS, target=target)
        frame = frame.reset_index(drop=True)
        params, zone_curves = load_specs(session, region)
        placebo_cases = here[here.species == PLACEBO]
        results[region] = {}
        for species in sorted(set(here.species) - {PLACEBO}):
            if species not in params:
                continue
            cases = here[here.species == species]
            parts = decompose(frame, species, params, zone_curves)
            percentiles = {column: crossover(cases, parts, column)
                           for column in (*WEATHER_COLUMNS, "static_part", "season_part", "full_score")}
            placebo = {column: crossover(placebo_cases, parts, column) for column in WEATHER_COLUMNS}
            results[region][species] = summarise(percentiles, placebo, args.min_cases)
            print(line(species, results[region][species]), flush=True)
            bucket = pooled.setdefault(species, ({}, {}))
            for column, values in percentiles.items():
                bucket[0].setdefault(column, []).append(values)
            for column, values in placebo.items():
                bucket[1].setdefault(column, []).append(values)

    def joined(parts):
        return {column: np.concatenate(values) for column, values in parts.items()}

    pooled_summary = {species: summarise(joined(cases), joined(placebo), args.min_cases)
                      for species, (cases, placebo) in pooled.items()}
    # Mixes species of opposite sign; it is there to compare weather sources on one set
    # of cases, not as a verdict on any species.
    if pooled:
        everything = ({}, {})
        for cases, placebo in pooled.values():
            for side, parts in zip(everything, (cases, placebo)):
                for column, values in parts.items():
                    side.setdefault(column, []).extend(values)
        pooled_summary["ALL"] = summarise(joined(everything[0]), joined(everything[1]), args.min_cases)
    report = {
        "meta": {"start": args.start, "end": args.end, "weather": args.weather,
                 "max_locations": args.max_locations, "control_offsets": CONTROL_OFFSETS,
                 "placebo_keys": PLACEBO_KEYS, "generated": date.today().isoformat()},
        "regions": results,
        "pooled": pooled_summary,
    }
    suffix = f"-{args.max_locations}loc" if args.max_locations else ""
    path = output / f"weather-skill-{args.weather}{suffix}-{args.start}_{args.end}.json"
    path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"\nwrote {path}\npooled across regions (net = species minus bracket placebo):")
    for species, entry in sorted(pooled_summary.items()):
        print(line(species, entry))


if __name__ == "__main__":
    main()
