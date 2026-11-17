"""Season review per place: how today's forecast did in each country and US state of the season atlas.

Reads a qa_replay.py --out directory of mushrooms (its finds_<region>.csv and scores_<region>.parquet)
and writes places.json and places.md there. Places and their usual season are the atlas's
(generated/season_atlas.json: outlines, and each species' 12-month curve). Per place:

  finds    2026 finds scored there (one per species, spot and day)
  where    mean `where_absent`: the find's spot against spots where people reported other mushrooms
           that day; `unseen` the same on finds from UNSEEN on, after the last finds any part of the
           forecast learned from
  beyond   timing minus its calendar control: the weather's own share within the season (95% CI)

and per mushroom with RECORDS there, its 2026 weeks in season (effort-normalised weekly GBIF rate
>= half its peak) and out of season (<= a tenth), from the place's own counts:

  auc      within-spot AUC, in-season days above out-of-season days (qa_season_auc's figure)
  usual    the same for the place's usual season, the atlas curve: what a calendar earns
  false    share of out-of-season days the forecast put at WORTH or more, at the species' own 2026 spots
  hit      share of in-season days at WORTH or more, at those spots
  shift    weeks from the place's usual peak to 2026's peak in the counts (`seen`) and in the forecast
           (`said`). Usual is the place's own records in PAST, by month and effort-normalised, so that
           all three lean on where people look (the atlas curve weighs the area: Sweden's north)

  python scripts/qa_season_places.py ../qa/season-review-2026/replay
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "backend"), str(ROOT / "scripts")]
import qa_replay as qr  # noqa: E402  first: it loads LightGBM before pandas and pyarrow

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
import requests  # noqa: E402
import shapely  # noqa: E402
from shapely.geometry import MultiPolygon, Polygon  # noqa: E402

import qa_season_truth as truth  # noqa: E402
from build_scorecard import LATER, UNSEEN  # noqa: E402
import r2  # noqa: E402
from qa_season_analysis import within_location_auc  # noqa: E402

RECORDS, MIN_WEEKS = 60, 2
IN_SEASON, OUT_OF_SEASON = 0.5, 0.10
WORTH = 4.0                # Worth Foraging Now's MIN_SCORE: the level the app says "go" from
SMOOTH = 3                 # weeks, before a peak is read
PAST, PAST_MONTHS = "2016,2025", range(4, 12)
MIDPOINTS = np.array([15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349])


def outlines(atlas):
    """The atlas's European countries and US states: (place, geometry, the key GBIF facets use)."""
    out = []
    for p in atlas["regions"]:
        if p.get("place") and p["continent"] in ("EU", "US"):
            geom = shapely.make_valid(MultiPolygon([Polygon(ring) for ring in p["rings"] if len(ring) >= 4]))
            out.append((p, geom, p["iso"] if p["kind"] == "country" else p["name"]))
    return out


def place_of(lat, lon, places):
    """Index into `places` of each point, -1 outside them all."""
    owner = np.full(len(lat), -1)
    for i, (_, geom, _) in enumerate(places):
        owner[(owner < 0) & shapely.contains_xy(geom, lon, lat)] = i
    return owner


def by_place(session, params):
    """GBIF records per country ISO code and US state name for these search parameters."""
    counts = {}
    for extra in ({"facet": "country"}, {"facet": "stateProvince", "country": "US"}):
        facets = truth.gbif(session, {"hasCoordinate": "true", "hasGeospatialIssue": "false", "occurrenceStatus": "PRESENT",
                                      "limit": 0, "facetLimit": 300, **params, **extra})["facets"]
        counts.update({c["name"]: c["count"] for c in (facets[0]["counts"] if facets else [])})
    return counts


def weekly_counts(session, keys, weeks):
    """{week: {place: records}} for these GBIF names (taxonKey 5: all fungi)."""
    return {str(w): by_place(session, {"taxonKey": keys, "eventDate": f"{w},{w + timedelta(days=6)}"}) for w in weeks}


def monthly_past(session, keys):
    """{month: {place: records}} over the years PAST, months PAST_MONTHS."""
    return {str(m): by_place(session, {"taxonKey": keys, "year": PAST, "month": m}) for m in PAST_MONTHS}


def curve_on(curve, days):
    """The atlas's monthly curve on each day, as production reads a season curve (through mid-months)."""
    xp = np.concatenate(([MIDPOINTS[-1] - 365], MIDPOINTS, [MIDPOINTS[0] + 365]))
    fp = np.concatenate(([curve[-1]], curve, [curve[0]]))
    return np.interp(pd.DatetimeIndex(days).dayofyear, xp, fp)


def peak(series):
    """The day of a weekly series' peak after a SMOOTH-week mean; None at the window's edges."""
    smooth = series.rolling(SMOOTH, center=True, min_periods=1).mean()
    if smooth.isna().all() or smooth.idxmax() in (smooth.index[0], smooth.index[-1]):
        return None
    return smooth.idxmax() + pd.Timedelta(days=3)


def species_line(rate, counts, days, own, curve, week_index, past=(None, 0)):
    """One place and mushroom: the figures in the module docstring, or None when it can't be told."""
    if counts.sum() < RECORDS or peak(rate) is None:
        return None
    label = pd.Series(np.where(rate >= IN_SEASON * rate.max(), 1, np.where(rate <= OUT_OF_SEASON * rate.max(), 0, -1)),
                      index=rate.index)
    if (label == 1).sum() < MIN_WEEKS or (label == 0).sum() < MIN_WEEKS:
        return None
    week = pd.DatetimeIndex(week_index.to_numpy())
    said = peak(days.score.groupby(week).mean())          # the forecast's week by week, every week
    days = days.assign(label=week_index.map(label).to_numpy())
    days = days[days.label >= 0].assign(in_season=lambda d: d.label == 1)
    auc, spots = within_location_auc(days, "score")
    if auc is None:
        return None
    line = {"records": int(counts.sum()), "auc": round(auc, 3), "spots": spots}
    if curve is not None:
        line["usual"] = round(within_location_auc(days.assign(usual=curve_on(curve, days.Date)), "usual")[0], 3)
    past_curve, past_records = past
    if past_curve is not None and past_records >= RECORDS:
        window = pd.date_range(rate.index[0], rate.index[-1] + pd.Timedelta(days=6))
        top = pd.Series(curve_on(past_curve, window), index=window).idxmax()
        if top not in (window[0], window[-1]):
            line["shift"] = {k: round((v - top).days / 7, 1) for k, v in (("seen", peak(rate)), ("said", said)) if v is not None}
            line["past_records"] = past_records
    mine = days[days.Location_Id.isin(own)]
    for name, flag in (("false", False), ("hit", True)):
        part = mine[mine.in_season == flag]
        if len(part):
            line[name] = round(float((part.score >= WORTH).mean()), 3)
    return line


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("replay", type=Path, help="a qa_replay.py --out directory")
    parser.add_argument("--masters", type=Path, default=ROOT.parent / "backups" / "masters")
    args = parser.parse_args()
    meta = json.loads((args.replay / "metadata.json").read_text(encoding="utf-8"))
    regions = [r for r in meta["regions"] if (args.replay / f"scores_{r}.parquet").exists()]
    atlas = json.loads(r2.generated(r2.GENERATED / "season_atlas.json").read_text(encoding="utf-8"))
    places = outlines(atlas)

    finds = pd.concat([pd.read_csv(args.replay / f"finds_{r}.csv", dtype={"loc": str, "date": str}) for r in regions])
    finds = finds[(finds.source == "today") & ~finds.composite.astype(bool) & np.isfinite(finds.score)]
    finds["place"] = place_of(finds.lat.to_numpy(), finds.lon.to_numpy(), places)
    scores = pd.concat([pd.read_parquet(args.replay / f"scores_{r}.parquet") for r in regions], ignore_index=True)
    scores["Date"] = pd.to_datetime(scores["Date"])
    grid = pd.concat([qr.places(args.masters, r, pd.Timestamp(meta["end"])) for r in qr.CONFIGS], ignore_index=True)
    grid = grid[grid.Location_Id.isin(scores.Location_Id.unique())].drop_duplicates("Location_Id")
    spot_place = pd.Series(place_of(grid.Latitude.to_numpy(), grid.Longitude.to_numpy(), places),
                           index=grid.Location_Id.to_numpy())
    scores["place"] = scores.Location_Id.map(spot_place).fillna(-1).astype(int)
    week_index = scores.Date - pd.to_timedelta(scores.Date.dt.weekday, unit="D")

    start = date.fromisoformat(meta["start"])
    first = start + timedelta(days=(7 - start.weekday()) % 7)
    weeks = [first + timedelta(days=7 * i) for i in range((date.fromisoformat(meta["end"]) - first).days // 7)]
    taxa = qr.gbif_taxa(ROOT.parent / "qa" / "gbif")
    species = sorted(s for s in finds.species.unique() if f"{s}_score" in scores)
    cache = args.replay / "gbif_weekly.json"
    weekly = json.loads(cache.read_text(encoding="utf-8")) if cache.exists() else {}
    session = requests.Session()
    session.headers["User-Agent"] = "fung.es season QA"
    for name, keys in [("_fungi", 5)] + [(s, taxa[s]["taxon_keys"]) for s in species]:
        for label, fetch in ((name, weekly_counts), (f"past:{name}", monthly_past)):
            if label not in weekly:
                weekly[label] = fetch(session, keys, weeks) if fetch is weekly_counts else fetch(session, keys)
                cache.write_text(json.dumps(weekly), encoding="utf-8")
                print(f"GBIF counts: {label}", flush=True)

    def series(name, key):
        return pd.Series([weekly[name][str(w)].get(key, 0) for w in weeks], index=pd.to_datetime(weeks), dtype=float)

    def past(name, key):
        """The place's usual season from its own records: the monthly rate (12, peak 1) and its records."""
        month = lambda label, m: weekly[label].get(str(m), {}).get(key, 0) if m in PAST_MONTHS else 0  # noqa: E731
        counts = np.array([month(f"past:{name}", m) for m in range(1, 13)], float)
        effort = np.array([month("past:_fungi", m) for m in range(1, 13)], float)
        rate = np.divide(counts, effort, out=np.zeros(12), where=effort > 0)
        return (list(rate / rate.max()) if rate.max() > 0 else None), int(counts.sum())

    out = []
    for i, (place, _, key) in enumerate(places):
        mine = finds[finds.place == i]
        here = scores[scores.place == i]
        if mine.empty and here.empty:
            continue
        unseen = mine[(mine.date >= UNSEEN) & ~mine.species.isin(LATER)]
        beyond = (mine.timing - mine.timing_calendar).dropna()
        row = {"id": place["id"], "name": place["name"], "kind": place["kind"], "continent": place["continent"],
               "finds": len(mine), "where": round(float(mine.where_absent.mean()), 3) if len(mine) else None,
               "unseen": {"finds": len(unseen), "where": round(float(unseen.where_absent.mean()), 3) if len(unseen) else None},
               "beyond": [round(float(beyond.mean()), 3), round(float(1.96 * beyond.sem()), 3)] if len(beyond) > 1 else None,
               "species": {}}
        effort = series("_fungi", key).replace(0, np.nan)
        for s in species:
            counts = series(s, key)
            days = here[["Location_Id", "Date", f"{s}_score"]].rename(columns={f"{s}_score": "score"})
            curve = place["species"].get(s, {}).get("curve") if "species" in place else None
            line = species_line(counts / effort, counts, days, set(mine.loc[mine.species == s, "loc"]), curve,
                                week_index.loc[here.index], past(s, key))
            if line:
                row["species"][s] = line
        lines = list(row["species"].values())
        if lines:
            weights = [x["records"] for x in lines]
            row["auc"] = round(float(np.average([x["auc"] for x in lines], weights=weights)), 3)
            usual = [(x["usual"], x["records"]) for x in lines if "usual" in x]
            if usual:
                row["usual"] = round(float(np.average([u for u, _ in usual], weights=[w for _, w in usual])), 3)
        out.append(row)
        print(f"{place['name']}: {len(mine)} finds, {len(row['species'])} species", flush=True)

    (args.replay / "places.json").write_text(json.dumps({"start": meta["start"], "end": meta["end"],
                                                          "commit": meta["commit"], "places": out}, indent=1),
                                             encoding="utf-8")
    write_markdown(args.replay / "places.md", out, meta)
    print(f"Places: {args.replay / 'places.md'}")


def write_markdown(path, rows, meta):
    fmt = lambda v: "–" if v is None else f"{v:.2f}"  # noqa: E731
    lines = [f"# Season review per place, {meta['start']} to {meta['end']} (`{meta['commit']}`)", "",
             "| place | finds | where | unseen (finds) | beyond cal. | season AUC | usual | mushrooms |",
             "|---|---:|---:|---:|---:|---:|---:|---|"]
    for r in sorted(rows, key=lambda r: -r["finds"]):
        beyond = "–" if r["beyond"] is None else f"{r['beyond'][0]:+.2f} ± {r['beyond'][1]:.2f}"
        lines.append(f"| {r['name']} | {r['finds']} | {fmt(r['where'])} | {fmt(r['unseen']['where'])} ({r['unseen']['finds']}) "
                     f"| {beyond} | {fmt(r.get('auc'))} | {fmt(r.get('usual'))} | {len(r['species'])} |")
    lines += ["", "## Per mushroom", "", "| place | mushroom | records | AUC | usual | false | hit | shift seen | shift said |",
              "|---|---|---:|---:|---:|---:|---:|---:|---:|"]
    for r in sorted(rows, key=lambda r: -r["finds"]):
        for s, x in sorted(r["species"].items(), key=lambda kv: -kv[1]["records"]):
            shift = x.get("shift", {})
            lines.append(f"| {r['name']} | {s} | {x['records']} | {fmt(x['auc'])} | {fmt(x.get('usual'))} | "
                         f"{fmt(x.get('false'))} | {fmt(x.get('hit'))} | {shift.get('seen', '–')} | {shift.get('said', '–')} |")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
