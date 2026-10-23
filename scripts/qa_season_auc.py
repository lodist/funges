"""Right season: does today's forecast rate a mushroom's real season above the weeks without it?

For each region and mushroom: the 2026 weeks in season (effort-normalised GBIF rate >= 50% of
its peak) and out of season (<= 10%), from exact weekly counts divided by all fungal records
(qa_season_truth's filters), and today's daily scores at the places of the window's finds (a
qa_replay.score_region run, kept as scores_<region>.parquet). The figure is the season-timing
QA's within-location AUC: how often, at the same spot, a day in season scored above a day out
of season. 0.5 is a coin toss. Only species whose season peaks inside the window are tested.
A composite (Boletus, Chanterelles) scores the best of its members, as the nightly run makes it,
against its members' finds added up; it stays out of the pooled figure.

  python -I scripts/qa_season_auc.py ../qa/season-auc-2026-10-23 --regions NE,SE
writes season_auc.json there (and the scores, if it had to replay them); build_scorecard.py
--season reads it.
"""

from __future__ import annotations

import argparse
import functools
import json
import sys
import warnings
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "backend"), str(ROOT / "scripts")]
import qa_replay as qr  # noqa: E402  first: it loads LightGBM before pandas and pyarrow

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
import requests  # noqa: E402

import qa_season_truth as truth  # noqa: E402
from qa_season_analysis import within_location_auc  # noqa: E402
from species_registry import get_composites  # noqa: E402

START, END = "2026-05-24", "2026-10-15"     # the masters' first day + the lag days .. finds caught up
IN_SEASON, OUT_OF_SEASON = 0.5, 0.10        # share of the peak weekly rate, as season-timing QA
MIN_RECORDS, MIN_WEEKS = 60, 2
LEFT_OUT = {"chicken-of-the-woods"}       # hand-set, its season runs backwards in SE: #389


def scores(out: Path, region: str, taxa: dict) -> pd.DataFrame:
    """Today's daily scores at the places of the window's fungi finds, replayed once and kept."""
    path = out / f"scores_{region}.parquet"
    if not path.exists():
        cache = ROOT.parent / "qa" / "gbif" / f"finds_{START}_{END}.json"
        finds = pd.DataFrame(json.loads(cache.read_text(encoding="utf-8")))
        fungi = {s for s, t in taxa.items() if t.get("kingdom") == "Fungi"}
        finds = finds[finds.species_id.isin(fungi) & finds.date.between(START, END)]
        days, masters = pd.date_range(START, END), ROOT.parent / "backups" / "masters"
        grid = pd.concat([qr.places(masters, r, days[-1]) for r in qr.CONFIGS], ignore_index=True)
        finds = qr.assign(finds, grid, taxa)
        mine = finds[finds.region == region].reset_index(drop=True)
        qr.score_region(region, mine, grid, masters, fungi, [], days)["today"].to_parquet(path)
    frame = pd.read_parquet(path)
    frame["Date"] = pd.to_datetime(frame["Date"])
    return frame


def weekly_rate(session, region: str, key: int, weeks: list[date], effort: pd.Series | None):
    counts = pd.Series([int(truth.gbif(session, {**truth.region_filter(region), "taxonKey": key, "limit": 0,
                                                 "eventDate": f"{w},{w + timedelta(days=6)}"})["count"])
                        for w in weeks], index=pd.to_datetime(weeks))
    return counts if effort is None else (counts, counts / effort.replace(0, np.nan))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("out", type=Path)
    parser.add_argument("--regions", default="NE,SE")
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    qr.fp.load_dotenv(ROOT / ".env")
    qr.fp.load_dotenv(ROOT / ".env.secret")
    qr.fp._load_coords_any = functools.lru_cache(maxsize=None)(qr.fp._load_coords_any)
    warnings.filterwarnings("ignore")

    taxa = json.loads((ROOT.parent / "qa" / "gbif" / "taxa.json").read_text(encoding="utf-8"))
    first = date.fromisoformat(START) + timedelta(days=(7 - date.fromisoformat(START).weekday()) % 7)
    weeks = [first + timedelta(days=7 * i) for i in range((date.fromisoformat(END) - first).days // 7)]
    session = requests.Session()
    session.headers["User-Agent"] = "fung.es season QA"
    rows = []
    for region in args.regions.split(","):
        frame = scores(args.out, region, taxa)
        effort = weekly_rate(session, region, 5, weeks, None)
        counted = {}

        def counts_of(species):
            if species not in counted:
                counted[species] = weekly_rate(session, region, taxa[species]["taxon_key"], weeks, None)
            return counted[species]

        single = [(s, [s]) for s, meta in sorted(taxa.items()) if meta.get("kingdom") == "Fungi" and s not in LEFT_OUT]
        for species, members in single + sorted(get_composites(region).items()):
            columns = [f"{m}_score" for m in members]
            if not all(c in frame for c in columns) or not all(m in taxa for m in members):
                continue
            counts = sum(counts_of(m) for m in members)
            rate = counts / effort.replace(0, np.nan)
            peak = rate.idxmax() if counts.sum() >= MIN_RECORDS else None
            if peak is None or peak in (rate.index[0], rate.index[-1]):
                continue                                      # too few, or the season lies outside
            label = pd.Series(np.where(rate >= IN_SEASON * rate.max(), 1,
                                       np.where(rate <= OUT_OF_SEASON * rate.max(), 0, -1)), index=rate.index)
            if (label == 1).sum() < MIN_WEEKS or (label == 0).sum() < MIN_WEEKS:
                continue
            column = "score"
            days = frame[["Location_Id", "Date"]].assign(score=frame[columns].max(axis=1))
            days["week"] = days.Date - pd.to_timedelta(days.Date.dt.weekday, unit="D")
            days["label"] = days.week.map(label)
            days = days[days.label >= 0].assign(in_season=lambda d: d.label == 1)
            auc, locations = within_location_auc(days, column)
            if auc is None:
                continue
            pairs = days.groupby("Location_Id").in_season.agg(lambda s: s.sum() * (~s).sum()).sum()
            rows.append({"region": region, "species": species, "composite": species not in taxa,
                         "records": int(counts.sum()), "auc": round(auc, 3),
                         "locations": locations, "pairs": int(pairs),
                         "in_season_weeks": [str(w.date()) for w in label.index[label == 1]],
                         "out_of_season_weeks": [str(w.date()) for w in label.index[label == 0]]})
            print({k: rows[-1][k] for k in ("region", "species", "records", "auc", "locations")}, flush=True)

    table = pd.DataFrame(rows)
    # Pooled over regions by the finds behind each figure: weighting by day pairs let 69 South European
    # chanterelle finds outweigh 1,644 North European ones, because the south has more spots.
    pooled = lambda g: round(float(np.average(g.auc, weights=g.records)), 3)  # noqa: E731
    result = {"start": START, "end": END, "commit": qr.git("rev-parse", "--short", "HEAD"),
              "all": pooled(table[~table.composite]), "species": {s: pooled(g) for s, g in table.groupby("species")},
              "rows": rows}
    (args.out / "season_auc.json").write_text(json.dumps(result, indent=1), encoding="utf-8")
    print(table[["region", "species", "records", "auc", "locations"]].to_string(index=False))
    print("all:", result["all"], "| median over region-species:", round(float(table.auc.median()), 3))


if __name__ == "__main__":
    main()
