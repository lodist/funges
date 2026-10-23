"""The public scorecard: today's forecast against mushroom finds it never learned from.

Reads a scripts/qa_replay.py run and writes public/data/scorecard.json: per region and per
continent, all mushrooms and each mushroom with at least MIN_FINDS finds, the finds and `place`,
the replay's mean `where`: how often the forecast rated the find's spot higher that day than
another spot where people reported mushrooms. Guessing gets 0.5. Only totals leave the machine.

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
CONTINENTS = {"EU": ("NE", "SE"), "US": ("USE", "USW")}


def tally(rows: pd.DataFrame) -> dict:
    return {"finds": len(rows), "place": round(float(rows["where"].mean()), 3)}


def card(rows: pd.DataFrame) -> dict | None:
    if len(rows) < MIN_FINDS:
        return None
    species = {s: tally(g) for s, g in rows.groupby("species") if len(g) >= MIN_FINDS}
    return {**tally(rows), "species": species}


def build(replay: Path) -> dict:
    meta = json.loads((replay / "metadata.json").read_text(encoding="utf-8"))
    rows = pd.concat([pd.read_csv(replay / f"finds_{r}.csv", dtype={"loc": str, "date": str})
                      for r in meta["regions"]], ignore_index=True)
    rows = rows[(rows.source == "today") & (rows.kingdom == "Fungi") & rows["where"].notna()]
    regions = {r: c for r in meta["regions"] if (c := card(rows[rows.region == r]))}
    continents = {k: c for k, members in CONTINENTS.items() if (c := card(rows[rows.region.isin(members)]))}
    return {"updated_at": date.today().isoformat(), "since": meta["start"],
            "until": rows.date.max() if len(rows) else meta["start"], "regions": regions, "continents": continents}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("replay", type=Path, help="a qa_replay.py --out directory")
    parser.add_argument("--out", type=Path, default=ROOT / "public" / "data" / "scorecard.json")
    args = parser.parse_args()
    result = build(args.replay)
    # As Prettier leaves it: two spaces, LF even on Windows.
    args.out.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8", newline="\n")
    for name, mine in {**result["regions"], **result["continents"]}.items():
        print(f"{name}: {mine['finds']} finds, place {mine['place']:.2f}, {len(mine['species'])} mushrooms shown")


if __name__ == "__main__":
    main()
