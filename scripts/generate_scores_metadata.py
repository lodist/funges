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

    date_str = str(table.column("Date")[0].as_py()).strip()
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
