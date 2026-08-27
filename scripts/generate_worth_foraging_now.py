import json
import math
from collections import defaultdict
from datetime import datetime
from pathlib import Path

import pyarrow.parquet as pq


PARQUET_PATH = Path("public/data/foraging_scores.parquet")
OUTPUT_PATH = Path("public/data/worth_foraging_now.json")
GRID_SIZE_DEGREES = 0.5
MIN_SCORE = 4.0
MAX_CELL_SPECIES = 8
SPECIES_REGISTRY_PATH = Path("backend/generated/species_registry.json")

def resolve_species_columns(available_columns: set[str]) -> dict[str, str]:
    """Choose the first available score alias for each manifest species."""
    registry = json.loads(SPECIES_REGISTRY_PATH.read_text(encoding="utf-8"))
    resolved = {}
    for species_id, config in registry["species"].items():
        column = next(
            (candidate for candidate in config["dataColumns"] if candidate in available_columns),
            None,
        )
        if column:
            resolved[species_id] = column
    return resolved


def infer_region(longitude: float, latitude: float) -> str:
    if longitude < -100:
        return "USW"
    if longitude < -25:
        return "USE"
    if latitude < 47:
        return "SE"
    return "NE"


def round_cell(value: float) -> float:
    return round(value / GRID_SIZE_DEGREES) * GRID_SIZE_DEGREES


def iso_date(value: object) -> str:
    if hasattr(value, "strftime"):
        return value.strftime("%Y-%m-%d")
    return str(value)


def main() -> None:
    schema_columns = set(pq.read_schema(PARQUET_PATH).names)
    species_columns = resolve_species_columns(schema_columns)
    columns = ["Date", "Latitude", "Longitude", *species_columns.values()]
    table = pq.read_table(PARQUET_PATH, columns=columns)
    rows = table.to_pylist()
    if not rows:
        raise RuntimeError("Parquet file does not contain any rows")

    # The parquet now holds a rolling forecast window [today .. today+6] plus
    # frozen past rows. "Worth foraging now" must reflect TODAY, not the far end
    # of the forecast (max(Date) == today+6). Pick today's rows; if today isn't
    # present yet, fall back to the earliest available forecast day, else latest.
    today = datetime.now().strftime("%Y-%m-%d")  # local, matches the pipeline's window
    available_dates = sorted({iso_date(row["Date"]) for row in rows})
    target_date = next((d for d in available_dates if d >= today), available_dates[-1])
    latest_rows = [row for row in rows if iso_date(row["Date"]) == target_date]

    region_best: dict[str, dict[str, dict[str, float]]] = {
        "NE": {},
        "SE": {},
        "USE": {},
        "USW": {},
    }
    cell_scores: dict[tuple[str, float, float], dict[str, float]] = defaultdict(dict)

    for row in latest_rows:
        latitude = float(row["Latitude"])
        longitude = float(row["Longitude"])
        region_id = infer_region(longitude, latitude)
        cell_key = (region_id, round_cell(latitude), round_cell(longitude))

        for species_id, column_name in species_columns.items():
            value = row.get(column_name)
            if value is None:
                continue

            score = round(float(value), 2)
            if not math.isfinite(score) or score < MIN_SCORE:
                continue

            current_best = region_best[region_id].get(species_id)
            if current_best is None or score > current_best["score"]:
                region_best[region_id][species_id] = {
                    "speciesId": species_id,
                    "score": score,
                    "lat": latitude,
                    "lng": longitude,
                }

            existing = cell_scores[cell_key].get(species_id)
            if existing is None or score > existing:
                cell_scores[cell_key][species_id] = score

    region_payload = {
        region_id: sorted(entries.values(), key=lambda item: item["score"], reverse=True)
        for region_id, entries in region_best.items()
    }

    point_payload = []
    for (region_id, latitude, longitude), scores in cell_scores.items():
        top_scores = dict(
            sorted(scores.items(), key=lambda item: item[1], reverse=True)[:MAX_CELL_SPECIES]
        )
        if not top_scores:
            continue
        point_payload.append(
            {
                "regionId": region_id,
                "lat": latitude,
                "lng": longitude,
                "scores": top_scores,
            }
        )
    point_payload.sort(
        key=lambda item: max(item["scores"].values(), default=0),
        reverse=True,
    )

    metadata_date = datetime.strptime(target_date, "%Y-%m-%d").isoformat() + "Z"
    payload = {
        "updated_at": metadata_date,
        "grid_size_degrees": GRID_SIZE_DEGREES,
        "min_score": MIN_SCORE,
        "regions": region_payload,
        "points": point_payload,
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_PATH.open("w", encoding="utf-8") as f:
        json.dump(payload, f, separators=(",", ":"))


if __name__ == "__main__":
    main()
