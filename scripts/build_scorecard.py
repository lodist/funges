"""The public scorecard: how today's forecast did on 2026 mushroom finds.

Writes public/data/scorecard.json from a scripts/qa_season_auc.py season_auc.json: per mushroom and
for all of them, how often at the same spot a day in its 2026 season scored above a day out of
season, and how many finds and spots that rests on. Only totals leave the machine.

With --place (a scripts/qa_replay.py --out directory) it also writes the place figures: for all
regions together (`all`) and per continent, each mushroom with at least MIN_FINDS finds, `place`
= the replay's mean `where_absent`, how often the forecast rated the find's spot higher that day
than another spot where people reported mushrooms but none of this one nearby. The page does not
show them for now (porcini reads low within an area, funges-lab qa/porcini-host-2026-10-23); the
replay keeps measuring them. Its window must start after the last find any part of the forecast
learned from (the training finds' last day, the last local season build).

  python scripts/qa_season_auc.py ../qa/season-auc --regions NE,SE
  python scripts/build_scorecard.py ../qa/season-auc/season_auc.json [--place ../qa/scorecard]
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
    singles = [r for r in report["rows"] if not r.get("composite")]
    records = {}
    for row in singles:
        records[row["species"]] = records.get(row["species"], 0) + row["records"]
    spots = {}
    for row in singles:                     # every species of a region is read at the same places
        spots[row["region"]] = max(spots.get(row["region"], 0), row["locations"])
    return {"since": report["start"], "until": report["end"], "spots": sum(spots.values()),
            "all": {"finds": sum(records.values()), "auc": report["all"]},
            "species": {s: {"finds": records[s], "auc": auc} for s, auc in report["species"].items() if s in records}}


def place_card(replay: Path) -> dict:
    meta = json.loads((replay / "metadata.json").read_text(encoding="utf-8"))
    rows = pd.concat([pd.read_csv(replay / f"finds_{r}.csv", dtype={"loc": str, "date": str})
                      for r in meta["regions"]], ignore_index=True)
    rows = rows[(rows.source == "today") & (rows.kingdom == "Fungi") & rows["where_absent"].notna()]
    continents = {k: c for k, members in CONTINENTS.items() if (c := card(rows[rows.region.isin(members)]))}
    return {"since": meta["start"], "until": rows.date.max() if len(rows) else meta["start"],
            "all": card(rows), "continents": continents}


def build(season: Path, replay: Path | None = None) -> dict:
    out = {"updated_at": date.today().isoformat(), "season": season_card(season)}
    if replay:
        out["place"] = place_card(replay)
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("season", type=Path, help="a qa_season_auc.py season_auc.json")
    parser.add_argument("--place", type=Path, help="a qa_replay.py --out directory (not shown on the page for now)")
    parser.add_argument("--out", type=Path, default=ROOT / "public" / "data" / "scorecard.json")
    args = parser.parse_args()
    result = build(args.season, args.place)
    # As Prettier leaves it: two spaces, LF even on Windows.
    args.out.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8", newline="\n")
    season = result["season"]
    print(f"season: {season['all']['auc']:.2f} on {season['all']['finds']} finds at {season['spots']} spots, "
          f"{len(season['species'])} mushrooms")


if __name__ == "__main__":
    main()
