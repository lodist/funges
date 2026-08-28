"""Validate historical Fung.es scores against recent GBIF occurrences.

This is a presence-background check, not a claim that GBIF absences are true
biological absences. It reads production score parquet files from R2, fetches
coordinate-bearing GBIF occurrences, deduplicates them into ~1 km cell-days,
and ranks each occurrence's nearest same-day score against the corresponding
regional background distribution.
"""

from __future__ import annotations

import argparse
import ast
import csv
import json
import math
import time
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path
from urllib.parse import urlencode

import fsspec
import numpy as np
import pyarrow.parquet as pq
import requests
from scipy.spatial import cKDTree


R2_ROOT = "https://data.fung.es"
REGIONS = {
    "NE": (f"{R2_ROOT}/EU/NE/NE_weather_data.parquet", (-25, 47, 45, 72)),
    "SE": (f"{R2_ROOT}/EU/SE/SE_weather_data.parquet", (-25, 34, 45, 47)),
    "USE": (f"{R2_ROOT}/USA/USE/USE_weather_data.parquet", (-100, 24, -60, 72)),
    "USW": (f"{R2_ROOT}/USA/USW/USW_weather_data.parquet", (-170, 24, -100, 72)),
}
PARAM_URLS = {
    "NE": f"{R2_ROOT}/EU/NE/NE_species_params.txt",
    "SE": f"{R2_ROOT}/EU/SE/SE_species_params.txt",
    "USE": f"{R2_ROOT}/USA/USE/USE_species_params.txt",
    "USW": f"{R2_ROOT}/USA/USW/USW_species_params.txt",
}
REGION_CURVE_URLS = {
    "NE": f"{R2_ROOT}/EU/NE/NE_season_curves.json",
    "SE": f"{R2_ROOT}/EU/SE/SE_season_curves.json",
    "USE": f"{R2_ROOT}/USA/USE/USE_season_curves.json",
    "USW": f"{R2_ROOT}/USA/USW/USW_season_curves.json",
}
ZONE_CURVE_URLS = {
    "NE": f"{R2_ROOT}/EU/EU_zone_season_curves.json",
    "SE": f"{R2_ROOT}/EU/EU_zone_season_curves.json",
    "USE": f"{R2_ROOT}/USA/US_zone_season_curves.json",
    "USW": f"{R2_ROOT}/USA/US_zone_season_curves.json",
}
SPECIES = {
    "mushroom": ("Porcini", "Boletus"),
    "black_chant": ("Black Chanterelle", "Craterellus cornucopioides"),
    "lingonb": ("Lingonberry", "Vaccinium vitis-idaea"),
    "garlic": ("Wild Garlic", "Allium ursinum"),
    "truffle_b": ("Black Truffle", "Tuber melanosporum"),
    "walnut": ("Wild Walnut", "Juglans regia"),
    "strawberry": ("Wild Strawberry", "Fragaria vesca"),
    "asparagus": ("Wild Asparagus", "Asparagus acutifolius"),
    "parasol": ("Parasol Mushroom", "Macrolepiota procera"),
    "chestnut": ("Chestnut", "Castanea sativa"),
    "amaranth": ("Amaranth", "Amaranthus retroflexus"),
    "masterwort": ("Masterwort", "Peucedanum ostruthium"),
    "nettle": ("Nettle", "Urtica dioica"),
    "morel": ("Morel", "Morchella"),
    "sorrel": ("Sorrel", "Rumex acetosa"),
    "raspberry": ("Raspberry", "Rubus idaeus"),
    "dandelion": ("Dandelion", "Taraxacum officinale"),
    "chickweed": ("Chickweed", "Stellaria media"),
    "artichoke": ("Artichoke", "Cynara cardunculus"),
    "st_george": ("St. George's Mushroom", "Calocybe gambosa"),
    "chant": ("Chanterelle", "Cantharellus cibarius"),
}
GBIF = "https://api.gbif.org/v1"
SCORE_COLUMNS = [f"{key}_score" for key in SPECIES]
FUNGI = {"mushroom", "black_chant", "truffle_b", "parasol", "morel", "st_george", "chant"}
ACTIVE_CURVE_THRESHOLD = 0.8
TAXON_KEY_OVERRIDES = {
    # GBIF's fuzzy matcher currently promotes bare "Boletus" to kingdom Fungi;
    # this is the exact accepted genus alternative returned by verbose matching.
    "mushroom": 8287374,
    "morel": 2594601,
}


def gbif_get(session: requests.Session, path: str, params: dict) -> dict:
    url = f"{GBIF}/{path}?{urlencode(params)}"
    for attempt in range(6):
        response = session.get(url, timeout=60)
        if response.status_code == 429 or response.status_code >= 500:
            time.sleep(2**attempt)
            continue
        response.raise_for_status()
        return response.json()
    raise RuntimeError(f"GBIF request repeatedly failed: {url}")


def load_season_specs(session: requests.Session) -> dict:
    specs = {}
    json_cache = {}
    for region in REGIONS:
        source = session.get(PARAM_URLS[region], timeout=60)
        source.raise_for_status()
        tree = ast.parse(source.text)
        assignment = next(
            node for node in tree.body
            if isinstance(node, ast.Assign)
            and any(isinstance(target, ast.Name) and target.id == "species_params" for target in node.targets)
        )
        params = ast.literal_eval(assignment.value)
        for url in (REGION_CURVE_URLS[region], ZONE_CURVE_URLS[region]):
            if url not in json_cache:
                response = session.get(url, timeout=60)
                response.raise_for_status()
                json_cache[url] = response.json()
        specs[region] = {
            "params": params,
            "region_curves": json_cache[REGION_CURVE_URLS[region]],
            "zone_curves": json_cache[ZONE_CURVE_URLS[region]],
        }
    return specs


def curve_value(curve: dict, observed: str) -> float:
    """Match production's linear interpolation through monthly midpoint values."""
    observed_date = date.fromisoformat(observed)
    midpoints = np.array([15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349])
    values = np.array([float(curve[str(month)] if str(month) in curve else curve[month]) for month in range(1, 13)])
    xp = np.concatenate(([midpoints[-1] - 365], midpoints, [midpoints[0] + 365]))
    fp = np.concatenate(([values[-1]], values, [values[0]]))
    return float(np.interp(observed_date.timetuple().tm_yday, xp, fp))


def active_for_validation(species_id: str, region: str, zone: str, observed: str, specs: dict) -> tuple[bool, float | None]:
    if species_id == "truffle_b":
        # Catalog says Burgundy Truffle but the configured taxon is T. melanosporum.
        return False, None
    region_spec = specs[region]
    if species_id in FUNGI:
        curve = region_spec["zone_curves"].get(str(zone), {}).get(species_id)
        if curve is None:
            curve = region_spec["region_curves"].get(species_id)
        if curve is None:
            return False, None
        multiplier = curve_value(curve, observed)
        return multiplier >= ACTIVE_CURVE_THRESHOLD, multiplier
    months = region_spec["params"].get(species_id, {}).get("season_months", [])
    return date.fromisoformat(observed).month in months, None


def match_taxa(session: requests.Session) -> dict[str, dict]:
    matches = {}
    for species_id, (_, name) in SPECIES.items():
        expected_rank = "GENUS" if species_id in TAXON_KEY_OVERRIDES else "SPECIES"
        if species_id in TAXON_KEY_OVERRIDES:
            key = TAXON_KEY_OVERRIDES[species_id]
            result = gbif_get(session, f"species/{key}", {})
        else:
            result = gbif_get(session, "species/match", {"name": name})
            key = result.get("usageKey")
        if not key:
            raise RuntimeError(f"GBIF could not match {name}: {result}")
        if result.get("rank") != expected_rank:
            raise RuntimeError(
                f"GBIF matched {name} at {result.get('rank')}, expected {expected_rank}: {result}"
            )
        matches[species_id] = {
            "query_name": name,
            "taxon_key": key,
            "matched_name": result.get("scientificName"),
            "rank": result.get("rank"),
            "confidence": result.get("confidence"),
        }
    return matches


def fetch_occurrences(
    session: requests.Session, matches: dict, start: str, end: str
) -> tuple[list[dict], dict]:
    records: list[dict] = []
    counts: dict[str, dict[str, int]] = defaultdict(dict)
    for species_id, match in matches.items():
        for region, (_, (west, south, east, north)) in REGIONS.items():
            geometry = (
                f"POLYGON(({west} {south},{east} {south},{east} {north},"
                f"{west} {north},{west} {south}))"
            )
            base = {
                "taxon_key": match["taxon_key"],
                "eventDate": f"{start},{end}",
                "geometry": geometry,
                "hasCoordinate": "true",
                "hasGeospatialIssue": "false",
                "occurrenceStatus": "PRESENT",
            }
            total = int(gbif_get(session, "occurrence/search", {**base, "limit": 0})["count"])
            searchable = min(total, 100_000)
            if searchable <= 1_500:
                offsets = list(range(0, searchable, 300))
            else:
                offsets = sorted(set(np.linspace(0, searchable - 300, 5, dtype=int).tolist()))
            fetched = 0
            for offset in offsets:
                payload = gbif_get(
                    session, "occurrence/search", {**base, "limit": 300, "offset": offset}
                )
                batch = payload.get("results", [])
                fetched += len(batch)
                for row in batch:
                    lat, lon = row.get("decimalLatitude"), row.get("decimalLongitude")
                    year, month, day = row.get("year"), row.get("month"), row.get("day")
                    if None in (lat, lon, year, month, day):
                        continue
                    try:
                        observed = date(int(year), int(month), int(day)).isoformat()
                    except ValueError:
                        continue
                    if not (start <= observed <= end):
                        continue
                    records.append(
                        {
                            "species_id": species_id,
                            "region": region,
                            "date": observed,
                            "lat": float(lat),
                            "lon": float(lon),
                            "gbif_key": row.get("key"),
                        }
                    )
            counts[species_id][region] = {"total": total, "sampled": fetched}
            print(
                f"GBIF {species_id:12s} {region}: {fetched}/{total} records sampled",
                flush=True,
            )

    # Reduce duplicate records and observer clusters to one species/cell/day.
    deduped = {}
    for row in records:
        key = (
            row["species_id"], row["region"], row["date"],
            round(row["lat"], 2), round(row["lon"], 2),
        )
        deduped.setdefault(key, row)
    return list(deduped.values()), counts


def unit_xyz(lat: np.ndarray, lon: np.ndarray) -> np.ndarray:
    lat_r, lon_r = np.radians(lat), np.radians(lon)
    return np.column_stack(
        (np.cos(lat_r) * np.cos(lon_r), np.cos(lat_r) * np.sin(lon_r), np.sin(lat_r))
    )


def chord_to_km(chord: np.ndarray) -> np.ndarray:
    return 6371.0088 * 2 * np.arcsin(np.minimum(1.0, chord / 2))


def analyse_region(
    region: str, url: str, occurrences: list[dict], start: str, end: str, specs: dict
) -> tuple[list[dict], dict]:
    print(f"R2 {region}: reading coordinates and score columns", flush=True)
    fs = fsspec.filesystem("https")
    with fs.open(url, "rb", block_size=16 * 1024 * 1024) as handle:
        parquet = pq.ParquetFile(handle)
        coordinate_parts = []
        for batch in parquet.iter_batches(
            columns=["Location_Id", "Latitude", "Longitude", "climate_zone"]
        ):
            frame = batch.to_pandas().drop_duplicates("Location_Id")
            coordinate_parts.append(frame)
        coordinates = (
            __import__("pandas").concat(coordinate_parts, ignore_index=True)
            .drop_duplicates("Location_Id")
            .reset_index(drop=True)
        )
        tree = cKDTree(unit_xyz(coordinates.Latitude.to_numpy(), coordinates.Longitude.to_numpy()))
        region_occ = [row for row in occurrences if row["region"] == region]
        if region_occ:
            query = unit_xyz(
                np.array([row["lat"] for row in region_occ]),
                np.array([row["lon"] for row in region_occ]),
            )
            distance, index = tree.query(query, k=1)
            for row, dist, idx in zip(region_occ, chord_to_km(distance), index):
                row["distance_km"] = float(dist)
                row["location_id"] = coordinates.iloc[int(idx)].Location_Id
                row["climate_zone"] = str(coordinates.iloc[int(idx)].climate_zone)
                row["season_eligible"], row["season_multiplier"] = active_for_validation(
                    row["species_id"], region, row["climate_zone"], row["date"], specs
                )

        # Only evaluate dates explicitly in season according to production configuration.
        eligible_occ = [row for row in region_occ if row.get("season_eligible")]
        # Several species can share a point-day, so retain a list rather than one row.
        wanted_many: dict[tuple, list] = defaultdict(list)
        for row in eligible_occ:
            wanted_many[(row["date"], row["location_id"])].append(row)
        wanted_dates = {key[0] for key in wanted_many}
        wanted_locations = {key[1] for key in wanted_many}

        histograms: dict[tuple[str, str, str], np.ndarray] = defaultdict(
            lambda: np.zeros(101, dtype=np.int64)
        )
        date_counts: dict[str, int] = defaultdict(int)
        columns = ["Location_Id", "Date", "climate_zone", *SCORE_COLUMNS]
        for batch in parquet.iter_batches(columns=columns):
            frame = batch.to_pandas()
            frame["Date"] = frame["Date"].astype("datetime64[ns]").dt.strftime("%Y-%m-%d")
            frame = frame[(frame.Date >= start) & (frame.Date <= end)]
            if frame.empty:
                continue
            frame["climate_zone"] = frame["climate_zone"].astype(str)
            for (day, zone), day_frame in frame.groupby(["Date", "climate_zone"], sort=False):
                date_counts[day] += len(day_frame)
                for species_id in SPECIES:
                    values = day_frame[f"{species_id}_score"].to_numpy(float)
                    bins = np.clip(np.rint(np.nan_to_num(values) * 10), 0, 100).astype(int)
                    histograms[(day, zone, species_id)] += np.bincount(bins, minlength=101)
            target_rows = frame[
                frame.Date.isin(wanted_dates) & frame.Location_Id.isin(wanted_locations)
            ]
            for _, score_row in target_rows.iterrows():
                for occurrence in wanted_many.get((score_row.Date, score_row.Location_Id), []):
                    occurrence["score"] = float(score_row[f"{occurrence['species_id']}_score"])

    for row in eligible_occ:
        score = row.get("score")
        histogram = histograms.get(
            (row["date"], row["climate_zone"], row["species_id"])
        )
        if score is None or histogram is None or histogram.sum() == 0:
            continue
        score_bin = int(np.clip(round(score * 10), 0, 100))
        row["background_percentile"] = float(
            (histogram[:score_bin].sum() + 0.5 * histogram[score_bin]) / histogram.sum()
        )
    return region_occ, {
        "source_url": url,
        "rows": parquet.metadata.num_rows,
        "row_groups": parquet.num_row_groups,
        "grid_points": len(coordinates),
        "dates_seen": len(date_counts),
        "min_points_per_day": min(date_counts.values(), default=0),
        "max_points_per_day": max(date_counts.values(), default=0),
    }


def summarise(rows: list[dict]) -> list[dict]:
    output = []
    for species_id, (label, scientific_name) in SPECIES.items():
        matched = [
            row for row in rows
            if row["species_id"] == species_id and row.get("distance_km", math.inf) <= 75
        ]
        group = [
            row for row in matched
            if row.get("season_eligible") and row.get("score") is not None
        ]
        scores = np.array([row["score"] for row in group], dtype=float)
        pct = np.array([row["background_percentile"] for row in group], dtype=float)
        distances = np.array([row["distance_km"] for row in group], dtype=float)
        days = sorted({row["date"] for row in group})
        ci_low, ci_high = "", ""
        if len(days) >= 5:
            rng = np.random.default_rng(20260813)
            by_day = {day: np.array([row["background_percentile"] for row in group if row["date"] == day]) for day in days}
            boot = []
            for _ in range(2_000):
                sampled_days = rng.choice(days, size=len(days), replace=True)
                boot.append(float(np.mean(np.concatenate([by_day[day] for day in sampled_days]))))
            ci_low, ci_high = (round(float(value), 3) for value in np.quantile(boot, [0.025, 0.975]))
        output.append(
            {
                "species_id": species_id,
                "label": label,
                "gbif_query": scientific_name,
                "evidence_class": "fruiting-proxy" if species_id in FUNGI else "habitat-only",
                "matched_all_dates": len(matched),
                "n": len(group),
                "active_days": len(days),
                "median_score": round(float(np.median(scores)), 2) if len(group) else "",
                "mean_score": round(float(np.mean(scores)), 2) if len(group) else "",
                "hit_rate_ge_4": round(float(np.mean(scores >= 4)), 3) if len(group) else "",
                "hit_rate_ge_6": round(float(np.mean(scores >= 6)), 3) if len(group) else "",
                "presence_background_auc": round(float(np.mean(pct)), 3) if len(group) else "",
                "auc_ci_low": ci_low,
                "auc_ci_high": ci_high,
                "median_match_km": round(float(np.median(distances)), 1) if len(group) else "",
                "status": (
                    "taxonomy-blocked" if species_id == "truffle_b"
                    else "not-testable-in-window" if not group
                    else "low-sample" if len(group) < 30
                    else "testable" if species_id in FUNGI
                    else "proxy-only"
                ),
            }
        )
    return output


def summarise_regions(rows: list[dict]) -> list[dict]:
    output = []
    for region in REGIONS:
        for species_id, (label, _) in SPECIES.items():
            group = [
                row for row in rows
                if row["region"] == region and row["species_id"] == species_id
                and row.get("season_eligible") and row.get("score") is not None
                and row.get("distance_km", math.inf) <= 75
            ]
            if not group:
                continue
            output.append({
                "region": region,
                "species_id": species_id,
                "label": label,
                "evidence_class": "fruiting-proxy" if species_id in FUNGI else "habitat-only",
                "n": len(group),
                "active_days": len({row["date"] for row in group}),
                "median_score": round(float(np.median([row["score"] for row in group])), 2),
                "presence_background_auc": round(
                    float(np.mean([row["background_percentile"] for row in group])), 3
                ),
            })
    return output


def primary_metrics(rows: list[dict], summary: list[dict]) -> dict:
    species_ids = {
        row["species_id"] for row in summary
        if row["evidence_class"] == "fruiting-proxy" and row["n"] >= 30
    }
    group = [
        row for row in rows
        if row["species_id"] in species_ids and row.get("season_eligible")
        and row.get("background_percentile") is not None
        and row.get("distance_km", math.inf) <= 75
    ]
    values = np.array([row["background_percentile"] for row in group], dtype=float)
    days = sorted({row["date"] for row in group})
    by_day = {day: np.array([row["background_percentile"] for row in group if row["date"] == day]) for day in days}
    rng = np.random.default_rng(20260813)
    boot = []
    for _ in range(2_000):
        sampled_days = rng.choice(days, size=len(days), replace=True)
        boot.append(float(np.mean(np.concatenate([by_day[day] for day in sampled_days]))))
    low, high = np.quantile(boot, [0.025, 0.975])
    return {
        "species_ids": sorted(species_ids), "n": len(group), "active_days": len(days),
        "weighted_auc": round(float(values.mean()), 3),
        "day_bootstrap_ci": [round(float(low), 3), round(float(high), 3)],
    }


def write_report(
    path: Path, start: str, end: str, summary: list[dict], regional_summary: list[dict], meta: dict
) -> None:
    fungi = [
        row for row in summary
        if row["evidence_class"] == "fruiting-proxy"
        and isinstance(row["presence_background_auc"], float) and row["n"] >= 30
    ]
    eligible_n = sum(row["n"] for row in fungi)
    primary = meta["primary_fungal_result"]
    weighted_auc = primary["weighted_auc"]
    overall_low, overall_high = primary["day_bootstrap_ci"]
    macro_auc = sum(row["presence_background_auc"] for row in fungi) / len(fungi)
    strong = ", ".join(row["label"] for row in fungi if row["presence_background_auc"] >= 0.6) or "none"
    weak = ", ".join(row["label"] for row in fungi if row["presence_background_auc"] < 0.45) or "none"
    lines = [
        "# GBIF score QA", "", f"Period: **{start} to {end}** (inclusive)", "",
        "## Result", "",
        f"The defensible primary result covers **{eligible_n:,} in-season fungal observations "
        f"across {len(fungi)} taxa**. Its observation-weighted within-zone AUC is "
        f"**{weighted_auc:.3f}** (95% day-bootstrap CI **{overall_low:.3f}–{overall_high:.3f}**) "
        f"and its species-macro average is **{macro_auc:.3f}**. "
        "0.5 is random ranking. This is a presence-background diagnostic, not a true "
        "presence/absence AUC.", "",
        "## Priority findings", "",
        f"- Strong in-season fungal ranking (AUC ≥0.60): {strong}.",
        f"- Weak in-season fungal ranking (AUC <0.45): {weak}.",
        "- Plant rows are habitat-only diagnostics. GBIF plant presence does not establish edible "
        "phenophase, so plant results are not used in the model verdict or calibration claims.",
        "- Out-of-season taxa—including spring asparagus and autumn chestnut—are explicitly "
        "excluded rather than scored as failures.",
        "- The catalog label `Burgundy Truffle` is paired with [`Tuber melanosporum`](https://www.gbif.org/species/5258468); "
        "GBIF calls that Black Périgord Truffle, while [`Tuber aestivum`](https://www.gbif.org/species/5258469) "
        "includes the Burgundy-truffle synonym `T. uncinatum`. No usable `T. melanosporum` "
        "observations were available in this window.", "",
        "| Species | Evidence | All | In season | Days | Median | ≥4 | Zone AUC (95% day-bootstrap CI) | Status |",
        "|---|---|---:|---:|---:|---:|---:|---:|---|",
    ]
    for row in sorted(summary, key=lambda item: item["n"], reverse=True):
        def fmt(value, percent=False):
            if value == "":
                return "—"
            return f"{value:.1%}" if percent else str(value)
        auc = fmt(row["presence_background_auc"])
        if row["auc_ci_low"] != "":
            auc += f" ({row['auc_ci_low']}–{row['auc_ci_high']})"
        lines.append(
            f"| {row['label']} | {row['evidence_class']} | {row['matched_all_dates']} | "
            f"{row['n']} | {row['active_days']} | {fmt(row['median_score'])} | "
            f"{fmt(row['hit_rate_ge_4'], True)} | {auc} | {row['status']} |"
        )
    lines += ["", "## In-season fungal results by region", "",
              "| Region | Species | n | Days | Median score | Zone AUC |",
              "|---|---|---:|---:|---:|---:|"]
    for row in regional_summary:
        if row["evidence_class"] != "fruiting-proxy":
            continue
        lines.append(
            f"| {row['region']} | {row['label']} | {row['n']} | {row['active_days']} | "
            f"{row['median_score']} | {row['presence_background_auc']} |"
        )
    lines += [
        "", "## Method and caveats", "",
        "GBIF records were required to be present, coordinate-bearing, and free of flagged "
        "geospatial issues. Records were deduplicated by species, day, region, and coordinates "
        "rounded to 0.01°. Each was matched to the nearest production grid point on the same day. "
        "Matches over 75 km were excluded. Fungi were eligible only when their interpolated R2 "
        f"zone/region curve was ≥{ACTIVE_CURVE_THRESHOLD}; plants only during their production "
        "`season_months`. The AUC-like value is the mean percentile of occurrence scores among "
        "background points on the same date, in the same region and climate zone. This controls "
        "for the season multiplier rather than rewarding the model for reproducing it. Queries "
        "with more than 1,500 results "
        "were sampled at five evenly spaced API offsets (up to GBIF's 100,000-offset ceiling); "
        "smaller result sets were fetched completely.", "",
        "The fungal curves were themselves derived from 2020–2026 GBIF monthly ratios, so they "
        "define eligibility but cannot independently validate seasonality. GBIF is presence-only "
        "and strongly affected by observer effort, taxonomic ambiguity, "
        "reporting lag, and duplicate datasets. Scores describe fruiting/foraging conditions, while "
        "plant records may describe vegetative plants rather than harvest readiness. Results with "
        "n < 10 are too small to interpret.", "", "## Run metadata", "",
        "```json", json.dumps(meta, indent=2, sort_keys=True), "```", "",
    ]
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--start")
    parser.add_argument("--end")
    parser.add_argument(
        "--output-dir",
        default="docs/qa/model-evaluation-2026/spatial-grid-background",
    )
    args = parser.parse_args()
    end_date = date.fromisoformat(args.end) if args.end else date.today() - timedelta(days=1)
    start_date = date.fromisoformat(args.start) if args.start else end_date - timedelta(days=60)
    start, end = start_date.isoformat(), end_date.isoformat()
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    session = requests.Session()
    session.headers["User-Agent"] = "fung.es score QA (https://fung.es)"
    season_specs = load_season_specs(session)
    matches = match_taxa(session)
    cache_path = output_dir / f"gbif-cache-{start}-{end}.json"
    if cache_path.exists():
        cache = json.loads(cache_path.read_text(encoding="utf-8"))
        occurrences, counts = cache["occurrences"], cache["counts"]
        print(f"GBIF: loaded {len(occurrences)} deduplicated records from cache", flush=True)
    else:
        occurrences, counts = fetch_occurrences(session, matches, start, end)
        cache_path.write_text(
            json.dumps({"occurrences": occurrences, "counts": counts}), encoding="utf-8"
        )
    scored = []
    region_meta = {}
    for region, (url, _) in REGIONS.items():
        region_rows, region_meta[region] = analyse_region(
            region, url, occurrences, start, end, season_specs
        )
        scored.extend(region_rows)

    summary = summarise(scored)
    regional_summary = summarise_regions(scored)
    primary = primary_metrics(scored, summary)
    meta = {
        "period": {"start": start, "end": end},
        "gbif_api": GBIF,
        "gbif_raw_api_counts": counts,
        "gbif_deduplicated_records": len(occurrences),
        "r2": region_meta,
        "taxon_matches": matches,
        "exclusion_distance_km": 75,
        "primary_fungal_result": primary,
        "season_filter": {
            "fungi_curve_threshold": ACTIVE_CURVE_THRESHOLD,
            "fungi_curve_sources": {
                region: {
                    "region": REGION_CURVE_URLS[region],
                    "zone": ZONE_CURVE_URLS[region],
                }
                for region in REGIONS
            },
            "plant_month_sources": PARAM_URLS,
            "plant_season_months": {
                region: {
                    species_id: spec.get("season_months", [])
                    for species_id, spec in season_specs[region]["params"].items()
                    if species_id not in FUNGI
                }
                for region in REGIONS
            },
        },
    }
    with (output_dir / "species-summary.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(summary[0]))
        writer.writeheader()
        writer.writerows(summary)
    with (output_dir / "region-species-summary.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(regional_summary[0]))
        writer.writeheader()
        writer.writerows(regional_summary)
    observation_fields = [
        "species_id", "region", "date", "lat", "lon", "gbif_key", "distance_km",
        "location_id", "climate_zone", "season_eligible", "season_multiplier", "score",
        "background_percentile",
    ]
    with (output_dir / "matched-observations.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=observation_fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(scored)
    (output_dir / "run-metadata.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    write_report(output_dir / "report.md", start, end, summary, regional_summary, meta)
    print(json.dumps({"output_dir": str(output_dir), "deduplicated": len(occurrences)}, indent=2))


if __name__ == "__main__":
    main()
