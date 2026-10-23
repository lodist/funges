"""The public scorecard: today's forecast against mushroom finds it never learned from.

Reads a scripts/qa_replay.py run and writes public/data/scorecard.json: per region, all mushrooms
and each mushroom with at least MIN_FINDS finds, the finds and the share of them at spots the
forecast ranked in its top quarter that day (the replay's `where` >= 0.75, among the spots where
people reported other mushrooms; a quarter is chance). Only totals leave the machine.

The replay window must start after the last find any part of the forecast learned from: the
training finds' last day (era5_training/finds_2016_2026.parquet) and the last build of the local
season curves, which count this year's records. A retrain moves the start.

  python scripts/qa_replay.py --out ../qa/scorecard --regions NE,SE --species <the mushrooms> --start <day after>
  python scripts/build_scorecard.py ../qa/scorecard
"""

from __future__ import annotations

import argparse
import json
from datetime import date
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
MIN_FINDS = 30
TOP_QUARTER = 0.75


def tally(rows: pd.DataFrame) -> dict:
    return {"finds": len(rows), "top_quarter": round(float((rows["where"] >= TOP_QUARTER).mean()), 3)}


def build(replay: Path) -> dict:
    meta = json.loads((replay / "metadata.json").read_text(encoding="utf-8"))
    regions, last = {}, meta["start"]
    for region in meta["regions"]:
        rows = pd.read_csv(replay / f"finds_{region}.csv", dtype={"loc": str, "date": str})
        rows = rows[(rows.source == "today") & (rows.kingdom == "Fungi") & rows["where"].notna()]
        if len(rows) < MIN_FINDS:
            continue
        species = {s: tally(g) for s, g in rows.groupby("species") if len(g) >= MIN_FINDS}
        regions[region] = {**tally(rows), "species": species}
        last = max(last, rows.date.max())
    return {"updated_at": date.today().isoformat(), "since": meta["start"], "until": last, "regions": regions}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("replay", type=Path, help="a qa_replay.py --out directory")
    parser.add_argument("--out", type=Path, default=ROOT / "public" / "data" / "scorecard.json")
    args = parser.parse_args()
    card = build(args.replay)
    # As Prettier leaves it: two spaces, LF even on Windows.
    args.out.write_text(json.dumps(card, indent=2) + "\n", encoding="utf-8", newline="\n")
    for region, mine in card["regions"].items():
        print(f"{region}: {mine['finds']} finds, {mine['top_quarter']:.0%} in the top quarter, "
              f"{len(mine['species'])} mushrooms shown")


if __name__ == "__main__":
    main()
