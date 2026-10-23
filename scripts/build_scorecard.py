"""The public scorecard: today's forecast against mushroom finds it never learned from.

Reads a scripts/qa_replay.py run and writes public/data/scorecard.json: for all regions together
(`all`) and per continent, all mushrooms and each mushroom with at least MIN_FINDS finds, the
finds and `place`, the replay's mean `where_absent`: how often the forecast rated the find's spot
higher that day than another spot where people reported mushrooms but none of this one nearby (a
broad flush puts the species at many of the other spots too, and those are not misses). Guessing
gets 0.5. Only totals leave the machine.

With --season (a scripts/qa_season_auc.py season_auc.json) it adds `season`: per mushroom and for
all of them, how often at the same spot a day in season scored above a day out of season.

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
    return {"finds": len(rows), "place": round(float(rows["where_absent"].mean()), 3)}


def card(rows: pd.DataFrame) -> dict | None:
    # Composites (Boletus, Chanterelles) stay off the page: their finds are their members' again,
    # and as the best of several species they point less sharply than any of them (23 Oct replay).
    single = rows[~rows["composite"].astype(bool)] if "composite" in rows else rows
    if len(single) < MIN_FINDS:
        return None
    species = {s: tally(g) for s, g in single.groupby("species") if len(g) >= MIN_FINDS}
    return {**tally(single), "species": species}


def season_card(path: Path) -> dict:
    report = json.loads(path.read_text(encoding="utf-8"))
    records = {}
    for row in report["rows"]:
        records[row["species"]] = records.get(row["species"], 0) + row["records"]
    return {"since": report["start"], "until": report["end"],
            "all": {"finds": sum(r["records"] for r in report["rows"] if not r.get("composite")), "auc": report["all"]},
            "species": {s: {"finds": records[s], "auc": auc} for s, auc in report["species"].items()
                        if s not in {r["species"] for r in report["rows"] if r.get("composite")}}}


def build(replay: Path, season: Path | None = None) -> dict:
    meta = json.loads((replay / "metadata.json").read_text(encoding="utf-8"))
    rows = pd.concat([pd.read_csv(replay / f"finds_{r}.csv", dtype={"loc": str, "date": str})
                      for r in meta["regions"]], ignore_index=True)
    rows = rows[(rows.source == "today") & (rows.kingdom == "Fungi") & rows["where_absent"].notna()]
    # Most regions are too thin on their own: the Data page and the species sheets read all of
    # them together, the landing its visitor's continent.
    everything = card(rows)
    continents = {k: c for k, members in CONTINENTS.items() if (c := card(rows[rows.region.isin(members)]))}
    return {"updated_at": date.today().isoformat(), "since": meta["start"],
            "until": rows.date.max() if len(rows) else meta["start"], "all": everything, "continents": continents,
            "season": season_card(season) if season else None}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("replay", type=Path, help="a qa_replay.py --out directory")
    parser.add_argument("--out", type=Path, default=ROOT / "public" / "data" / "scorecard.json")
    parser.add_argument("--season", type=Path, help="a qa_season_auc.py season_auc.json")
    args = parser.parse_args()
    result = build(args.replay, args.season)
    # As Prettier leaves it: two spaces, LF even on Windows.
    args.out.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8", newline="\n")
    for name, mine in {"all": result["all"] or {"finds": 0, "place": 0, "species": {}}, **result["continents"]}.items():
        print(f"{name}: {mine['finds']} finds, place {mine['place']:.2f}, {len(mine['species'])} mushrooms shown")


if __name__ == "__main__":
    main()
