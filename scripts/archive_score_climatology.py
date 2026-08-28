"""Append monthly score aggregates to a durable archive, so seasons stay testable.

R2 keeps roughly four months of score history, which means the autumn peak of every
autumn species (parasol in October, black chanterelle in September, truffle in winter)
has always aged out by the time anyone tries to validate it. Season QA can therefore
never see the model's hardest cases.

This costs a few kilobytes per month and fixes that permanently. Run it on the same
schedule as the site data; it is idempotent, and re-running within a month overwrites
that month's partial entry rather than duplicating it.
"""

from __future__ import annotations

import argparse
import json
import math
from collections import defaultdict
from pathlib import Path

import pyarrow.parquet as pq

GOOD_SCORE = 4.0
DEFAULT_PARQUET = Path("public/data/foraging_scores.parquet")
DEFAULT_ARCHIVE = Path("docs/qa/model-evaluation-2026/climatology/score-climatology.json")


def infer_region(longitude: float, latitude: float) -> str:
    # Same boundaries as scripts/generate_worth_foraging_now.py.
    if longitude < -100:
        return "USW"
    if longitude < -25:
        return "USE"
    if latitude < 47:
        return "SE"
    return "NE"


def iso_month(value: object) -> str:
    if hasattr(value, "strftime"):
        return value.strftime("%Y-%m")
    return str(value)[:7]


def summarise(parquet_path: Path) -> dict:
    parquet = pq.ParquetFile(parquet_path)
    names = [parquet.schema_arrow.field(i).name for i in range(len(parquet.schema_arrow))]
    species_columns = [n for n in names if n not in {"Date", "Latitude", "Longitude"}]

    buckets: dict[tuple[str, str, str], list[float]] = defaultdict(list)
    for batch in parquet.iter_batches(columns=["Date", "Latitude", "Longitude", *species_columns]):
        rows = batch.to_pylist()
        for row in rows:
            region = infer_region(float(row["Longitude"]), float(row["Latitude"]))
            month = iso_month(row["Date"])
            for column in species_columns:
                value = row.get(column)
                if value is None:
                    continue
                score = float(value)
                if math.isfinite(score):
                    buckets[(month, region, column)].append(score)

    summary: dict = {}
    for (month, region, species), values in buckets.items():
        values.sort()
        count = len(values)
        summary.setdefault(month, {}).setdefault(region, {})[species] = {
            "n": count,
            "mean": round(sum(values) / count, 3),
            "median": round(values[count // 2], 3),
            "p90": round(values[min(count - 1, int(0.9 * count))], 3),
            "share_ge4": round(sum(1 for v in values if v >= GOOD_SCORE) / count, 4),
            "share_zero": round(sum(1 for v in values if v <= 0.0) / count, 4),
        }
    return summary


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--parquet", default=str(DEFAULT_PARQUET))
    parser.add_argument("--archive", default=str(DEFAULT_ARCHIVE))
    args = parser.parse_args()
    parquet_path, archive_path = Path(args.parquet), Path(args.archive)
    if not parquet_path.exists():
        raise SystemExit(f"score parquet not found: {parquet_path}")

    archive = {"schema": 1, "good_score": GOOD_SCORE, "months": {}}
    if archive_path.exists():
        archive = json.loads(archive_path.read_text(encoding="utf-8"))
        archive.setdefault("months", {})

    fresh = summarise(parquet_path)
    # Later runs in the same month legitimately replace that month's partial aggregate;
    # earlier months are already complete and are left untouched.
    archive["months"].update(fresh)
    archive["months"] = dict(sorted(archive["months"].items()))

    archive_path.parent.mkdir(parents=True, exist_ok=True)
    archive_path.write_text(json.dumps(archive, indent=1, sort_keys=True), encoding="utf-8")
    added = ", ".join(sorted(fresh))
    print(f"archived {len(fresh)} month(s) [{added}] -> {archive_path} "
          f"({archive_path.stat().st_size / 1024:.0f} KB, {len(archive['months'])} months total)")


if __name__ == "__main__":
    main()
