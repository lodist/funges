"""Current-year continental QA using other fungal observations as effort background."""

from __future__ import annotations

import argparse
import csv
import json
import math
import time
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

import fsspec
import numpy as np
import pyarrow.parquet as pq
import requests
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parents[1]
import sys
sys.path.insert(0, str(ROOT / "backend"))
from species_registry import get_empirical_taxon_map, get_species_metadata

from qa_gbif_scores import GBIF, REGIONS, R2_ROOT, chord_to_km, unit_xyz


EU_REGIONS = {key: REGIONS[key] for key in ("NE", "SE")}
_LEGACY_TARGETS = {
    "mushroom": ("Porcini / Boletus", 8287374),
    "black_chant": ("Black Chanterelle", 2554662),
    "parasol": ("Parasol Mushroom", 8914748),
    "morel": ("Morel", 2594601),
    "st_george": ("St. George's Mushroom", 8936224),
    # Match production's season-curve taxon, not only C. cibarius.
    "chant": ("Chanterelle / Cantharellus", 9623860),
}
_TAXA = get_empirical_taxon_map()
_METADATA = get_species_metadata()
TARGETS = {
    species_id: (_METADATA[species_id]["name"], keys[0])
    for species_id, keys in _TAXA.items()
    if keys
}
MAX_MATCH_KM = 30
CELL_KM = 20
MAX_COORDINATE_UNCERTAINTY_M = 20_000


def request_json(session: requests.Session, params: dict) -> dict:
    url = f"{GBIF}/occurrence/search"
    for attempt in range(7):
        response = session.get(url, params=params, timeout=60)
        if response.status_code == 429 or response.status_code >= 500:
            time.sleep(2**attempt)
            continue
        response.raise_for_status()
        return response.json()
    raise RuntimeError(f"GBIF repeatedly failed: {response.url}")


def geometry(region: str) -> str:
    _, (west, south, east, north) = EU_REGIONS[region]
    return f"POLYGON(({west} {south},{east} {south},{east} {north},{west} {north},{west} {south}))"


def common_params(region: str, event_date: str) -> dict:
    return {
        "eventDate": event_date, "geometry": geometry(region), "hasCoordinate": "true",
        "hasGeospatialIssue": "false", "occurrenceStatus": "PRESENT",
        "basisOfRecord": "HUMAN_OBSERVATION",
    }


def parse_records(payload: dict, region: str, species_id: str | None = None) -> list[dict]:
    output = []
    for row in payload.get("results", []):
        lat, lon = row.get("decimalLatitude"), row.get("decimalLongitude")
        year, month, day = row.get("year"), row.get("month"), row.get("day")
        if None in (lat, lon, year, month, day):
            continue
        try:
            observed = date(int(year), int(month), int(day)).isoformat()
        except ValueError:
            continue
        uncertainty = row.get("coordinateUncertaintyInMeters")
        if uncertainty is not None and float(uncertainty) > MAX_COORDINATE_UNCERTAINTY_M:
            continue
        output.append({
            "date": observed, "region": region, "lat": float(lat), "lon": float(lon),
            "species_id": species_id, "gbif_key": row.get("key"),
            "basis_of_record": row.get("basisOfRecord"),
            "coordinate_uncertainty_m": uncertainty,
        })
    return output


def fetch_background(session: requests.Session, start: str, end: str) -> tuple[list[dict], dict]:
    rows, counts = [], {}
    current, last = date.fromisoformat(start), date.fromisoformat(end)
    while current <= last:
        observed = current.isoformat()
        for region in EU_REGIONS:
            base = {**common_params(region, observed), "taxon_key": 5}
            total = int(request_json(session, {**base, "limit": 0})["count"])
            if total <= 600:
                offsets = list(range(0, total, 300))
            else:
                offsets = sorted({max(0, total // 3 - 150), max(0, 2 * total // 3 - 150)})
            fetched = []
            for offset in offsets:
                payload = request_json(session, {**base, "limit": 300, "offset": offset})
                fetched.extend(parse_records(payload, region))
            sample_weight = total / len(fetched) if fetched else 0.0
            for row in fetched:
                row["sample_weight"] = sample_weight
            rows.extend(fetched)
            counts[f"{region}:{observed}"] = {"total": total, "sampled": len(fetched)}
        if current.day == 1 or current.day % 10 == 0:
            print(f"background through {observed}", flush=True)
        current += timedelta(days=1)
    return rows, counts


def fetch_targets(session: requests.Session, start: str, end: str) -> list[dict]:
    rows = []
    for species_id, (_, taxon_key) in TARGETS.items():
        for region in EU_REGIONS:
            base = {**common_params(region, f"{start},{end}"), "taxon_key": taxon_key}
            total = int(request_json(session, {**base, "limit": 0})["count"])
            for offset in range(0, min(total, 100_000), 300):
                payload = request_json(session, {**base, "limit": 300, "offset": offset})
                rows.extend(parse_records(payload, region, species_id))
            print(f"target {species_id} {region}: {total}", flush=True)
    return rows


def cell_id(lat: float, lon: float) -> tuple[int, int]:
    # Fixed continental equirectangular grid; appropriate to the stated station resolution.
    return (math.floor(lat * 111.0 / CELL_KM), math.floor(lon * 111.0 * math.cos(math.radians(53)) / CELL_KM))


def collapse(rows: list[dict], include_species: bool) -> list[dict]:
    output = {}
    for row in rows:
        key = (row["region"], row["date"], cell_id(row["lat"], row["lon"]))
        if include_species:
            key += (row["species_id"],)
        existing = output.get(key)
        if existing is None:
            copy = dict(row)
            copy["cell"] = f"{key[2][0]}:{key[2][1]}"
            output[key] = copy
        elif not include_species:
            existing["sample_weight"] = max(existing["sample_weight"], row["sample_weight"])
    return list(output.values())


def attach_scores(region: str, rows: list[dict], target_rows: list[dict]) -> dict:
    url = EU_REGIONS[region][0]
    fs = fsspec.filesystem("https")
    all_rows = [row for row in rows + target_rows if row["region"] == region]
    with fs.open(url, "rb", block_size=16 * 1024 * 1024) as handle:
        parquet = pq.ParquetFile(handle)
        pieces = []
        for batch in parquet.iter_batches(columns=["Location_Id", "Latitude", "Longitude"]):
            pieces.append(batch.to_pandas().drop_duplicates("Location_Id"))
        import pandas as pd
        coordinates = pd.concat(pieces, ignore_index=True).drop_duplicates("Location_Id").reset_index(drop=True)
        tree = cKDTree(unit_xyz(coordinates.Latitude.to_numpy(), coordinates.Longitude.to_numpy()))
        query = unit_xyz(np.array([r["lat"] for r in all_rows]), np.array([r["lon"] for r in all_rows]))
        distance, index = tree.query(query, k=1)
        for row, dist, idx in zip(all_rows, chord_to_km(distance), index):
            row["distance_km"] = float(dist)
            row["location_id"] = coordinates.iloc[int(idx)].Location_Id

        wanted = {(r["date"], r["location_id"]) for r in all_rows if r["distance_km"] <= MAX_MATCH_KM}
        wanted_dates = {key[0] for key in wanted}; wanted_locations = {key[1] for key in wanted}
        score_lookup = {}
        columns = ["Location_Id", "Date", *[f"{s}_score" for s in TARGETS]]
        for batch in parquet.iter_batches(columns=columns):
            frame = batch.to_pandas(); frame["Date"] = frame.Date.dt.strftime("%Y-%m-%d")
            frame = frame[frame.Date.isin(wanted_dates) & frame.Location_Id.isin(wanted_locations)]
            for record in frame.to_dict("records"):
                score_lookup[(record["Date"], record["Location_Id"])] = record
        for row in all_rows:
            record = score_lookup.get((row["date"], row["location_id"]))
            row["scores"] = ({s: float(record[f"{s}_score"]) for s in TARGETS} if record else {})
    return {"grid_points": len(coordinates), "source_url": url}


def weighted_percentile(score: float, controls: list[dict], species_id: str) -> float | None:
    valid = [
        (row["scores"].get(species_id), row["sample_weight"])
        for row in controls
        if species_id in row["scores"] and math.isfinite(row["scores"][species_id])
    ]
    if not valid:
        return None
    below = sum(weight for value, weight in valid if value < score)
    equal = sum(weight for value, weight in valid if value == score)
    total = sum(weight for _, weight in valid)
    return (below + 0.5 * equal) / total


def analyse(background: list[dict], targets: list[dict]) -> tuple[list[dict], list[dict]]:
    background_by_day = defaultdict(list)
    for row in background:
        if row.get("scores") and row.get("distance_km", math.inf) <= MAX_MATCH_KM:
            background_by_day[row["date"]].append(row)
    detail, summary = [], []
    for species_id, (label, _) in TARGETS.items():
        positives = [
            r for r in targets
            if r["species_id"] == species_id and r.get("scores")
            and r["distance_km"] <= MAX_MATCH_KM
            and math.isfinite(r["scores"].get(species_id, math.nan))
        ]
        for row in positives:
            row["score"] = row["scores"][species_id]
            row["effort_percentile"] = weighted_percentile(row["score"], background_by_day[row["date"]], species_id)
            detail.append(row)
        pct = np.array([r["effort_percentile"] for r in positives if r["effort_percentile"] is not None])
        scores = np.array([r["score"] for r in positives])
        summary.append({
            "species_id": species_id, "label": label, "n": len(positives),
            "active_days": len({r["date"] for r in positives}),
            "mean_effort_adjusted_auc": round(float(pct.mean()), 3) if len(pct) else "",
            "median_score": round(float(np.median(scores)), 2) if len(scores) else "",
            "hit_rate_ge_4": round(float(np.mean(scores >= 4)), 3) if len(scores) else "",
            "ne_n": sum(r["region"] == "NE" for r in positives),
            "se_n": sum(r["region"] == "SE" for r in positives),
        })
    return detail, summary


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--start", default="2026-06-01")
    parser.add_argument("--end", default="2026-08-12")
    parser.add_argument("--output-dir", default="docs/qa/gbif-effort-background-2026-06-01_2026-08-12")
    args = parser.parse_args(); output = Path(args.output_dir); output.mkdir(parents=True, exist_ok=True)
    cache = output / "gbif-cache.json"
    session = requests.Session(); session.headers["User-Agent"] = "fung.es QA (https://fung.es)"
    if cache.exists():
        payload = json.loads(cache.read_text(encoding="utf-8"))
    else:
        background, counts = fetch_background(session, args.start, args.end)
        targets = fetch_targets(session, args.start, args.end)
        payload = {"background": background, "targets": targets, "counts": counts}
        cache.write_text(json.dumps(payload), encoding="utf-8")
    background = collapse(payload["background"], False); targets = collapse(payload["targets"], True)
    r2_meta = {region: attach_scores(region, background, targets) for region in EU_REGIONS}
    detail, summary = analyse(background, targets)
    for name, rows in (("species-summary.csv", summary), ("matched-targets.csv", detail)):
        with (output / name).open("w", newline="", encoding="utf-8") as handle:
            flat = [{k: v for k, v in row.items() if k != "scores"} for row in rows]
            writer = csv.DictWriter(handle, fieldnames=list(flat[0]), extrasaction="ignore")
            writer.writeheader(); writer.writerows(flat)
    background_rows = []
    for row in background:
        if not row.get("scores") or row.get("distance_km", math.inf) > MAX_MATCH_KM:
            continue
        flat = {k: v for k, v in row.items() if k != "scores"}
        flat.update({f"{species_id}_score": score for species_id, score in row["scores"].items()})
        background_rows.append(flat)
    with (output / "fungal-observer-background.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(background_rows[0]), extrasaction="ignore")
        writer.writeheader(); writer.writerows(background_rows)
    metadata = {
        "period": [args.start, args.end], "cell_km": CELL_KM, "max_match_km": MAX_MATCH_KM,
        "basis_of_record": "HUMAN_OBSERVATION",
        "max_coordinate_uncertainty_m": MAX_COORDINATE_UNCERTAINTY_M,
        "background_raw": len(payload["background"]), "background_cells": len(background),
        "target_raw": len(payload["targets"]), "target_cells": len(targets), "r2": r2_meta,
        "gbif_counts": payload["counts"],
    }
    (output / "run-metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
