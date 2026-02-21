import csv
import gzip
import json
from datetime import datetime
from pathlib import Path


def main() -> None:
    csv_path = Path("public/data/foraging_scores.csv.gz")
    json_path = Path("public/data/scores_metadata.json")

    with gzip.open(csv_path, "rt", encoding="utf-8", newline="") as f:
        reader = csv.reader(f)
        next(reader, None)  # skip header
        row = next(reader, None)
    if not row:
        raise RuntimeError("CSV does not contain a second line")

    date_str = row[0].strip()
    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        iso = dt.isoformat() + "Z"
    except ValueError:
        iso = date_str

    metadata = {"updated_at": iso}
    json_path.parent.mkdir(parents=True, exist_ok=True)
    with json_path.open("w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)


if __name__ == "__main__":
    main()

