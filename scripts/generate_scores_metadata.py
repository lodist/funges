import json
from datetime import datetime
from pathlib import Path

import pyarrow.parquet as pq


def main() -> None:
    parquet_path = Path("public/data/foraging_scores.parquet")
    json_path = Path("public/data/scores_metadata.json")

    table = pq.read_table(parquet_path, columns=["Date"])
    if table.num_rows == 0:
        raise RuntimeError("Parquet file does not contain any rows")

    # The parquet now holds a rolling forecast window [today .. today+6]. The
    # "last updated" label must reflect TODAY, not the forecast end (max(Date) ==
    # today+6, which renders a broken future "in X minutes"). Pick today; if it
    # isn't present yet, fall back to the earliest available day, else latest.
    today = datetime.now().strftime("%Y-%m-%d")
    dates = sorted(str(d).strip() for d in table.column("Date").to_pylist())
    date_str = next((d for d in dates if d >= today), dates[-1])
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
