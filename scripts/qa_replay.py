"""Replay QA: this checkout's scoring code on the weather stored in the masters, against GBIF finds.

The stored scores cannot be the test: each day was scored by whatever code ran that night (on
1 Sep 2026 North Europe's stored porcini and the code of 16 Oct agree at r = 0.03). So the past
is scored again the way the nightly run on each day would have: species settings, curves,
priors and fits (_load_species_and_curves), 42-day lags, calculate_mushroom_score, the neighbour
region's blend and the spatial smoothing, one day at a time, as the fruiting GBM reads the run
date's normals and day of year.

Each sampled GBIF find (nearest place within 10 km, one per species, place and day) gets three
shares of scores below its own, ties counting half, so 0.5 is chance:
  where   the same day's scores at the other species' finds of its kingdom in the region: places
          people record fungi (or plants), so following observers earns nothing
  timing  the same place within 3 weeks either side of the find: the weather's timing
  season  the same place over the whole window: mostly the season curve
Each also for the stored scores and, with --against, for another run's.

Run from the checkout whose code is tested; for a branch, main first, the same day:
  python scripts/qa_replay.py --out ../qa/main
  python scripts/qa_replay.py --out ../qa/my-branch --against ../qa/main
--regions and --species narrow a run; --without drops parts of the score (fruiting_gbm brings
back the linear fit it replaced). Needs the masters the nightly upload keeps in
app_operation/backups/masters and a Python with LightGBM (the nightly scoring's, not backend/.venv).
"""

from __future__ import annotations

import argparse
import functools
import json
import runpy
import subprocess
import sys
import time
import warnings
from dataclasses import replace
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "backend"), str(ROOT / "scripts")]
import forecast_pipeline as fp  # noqa: E402  first: it loads LightGBM before pandas and pyarrow

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
import pyarrow.compute as pc  # noqa: E402
import pyarrow.parquet as pq  # noqa: E402
import requests  # noqa: E402
from scipy.spatial import cKDTree  # noqa: E402

import qa_gbif_scores as gbif  # noqa: E402
from species_registry import get_species_metadata  # noqa: E402

CONFIGS = {
    "NE": "backend/EU/North_Europe/NE_Scoring.py",
    "SE": "backend/EU/South_Europe/SE_Scoring.py",
    "USE": "backend/US/USE/USE_Scoring.py",
    "USW": "backend/US/USW/USW_Scoring.py",
}
PARTS = ("fruiting_gbm", "fruiting", "habitat", "local_season", "phenology", "range_prior", "host_prior")
INPUTS = [
    "Location_Id", "Date", "Latitude", "Longitude", "Elevation (m)", "Pressure (hPa)",
    "TotalPrecipitation_mm", "Humidity (%)", "Wind Speed (m/s)", "Temperature (C) Max",
    "Temperature (C) Min", "Temperature (C)", "Wind Speed Mean (kph)", "Rain Hours",
    "Snowfall (cm)", "Solar Radiation (Wh/m2)", "Rain Measured", "dist_m_water", "dist_m_sea",
    "climate_zone", "ph_level",
]
LAGS = ["Temperature (C)", "TotalPrecipitation_mm", "Pressure (hPa)", "Humidity (%)",
        "Wind Speed (m/s)", *fp.FRUITING_LAG_COLUMNS]
FINDS_CAP = 400          # finds per species and region, which bounds the places scored
MAX_KM = 10.0
NEIGHBOURS = 5           # the nightly smoothing reads each place's 5 nearest: score them too
CHUNK_DAYS = 14
TIMING_DAYS = 21
MIN_TIMING_DAYS = 15
MIN_FINDS = 30           # fewer and a species stays out of the report's tables


def on_day(params, day):
    """The settings as the nightly run on `day` had them: the GBM reads its run date's normals
    and day of year (its anchor), so a past day read with today's anchor is read in the wrong month."""
    return {s: {**p, "fruiting_gbm": {**p["fruiting_gbm"], "anchor": day}} if p.get("fruiting_gbm") else p
            for s, p in params.items()}


def _share(values, x, weights):
    """Weighted share of each column of `values` (n x k) below `x` (k), ties counting half; NaN left out."""
    w = weights[:, None] * np.isfinite(values)
    total = w.sum(axis=0)
    below = (w * (values < x)).sum(axis=0) + 0.5 * (w * (values == x)).sum(axis=0)
    out = np.full(len(x), np.nan)
    np.divide(below, total, out=out, where=total > 0)
    out[~np.isfinite(x)] = np.nan
    return out


def percentiles(matrix, rows, cols, background, weights):
    """where, timing and season (see the module docstring) for the finds at (rows, cols) of a
    place x day score matrix; `background` are rows, `weights` their number of finds."""
    x = matrix[rows, cols]
    where = _share(matrix[background][:, cols], x, np.asarray(weights, float))
    offsets = np.array([d for d in range(-TIMING_DAYS, TIMING_DAYS + 1) if d])
    around = cols[:, None] + offsets
    inside = (around >= 0) & (around < matrix.shape[1])
    window = np.where(inside, matrix[rows[:, None], np.clip(around, 0, matrix.shape[1] - 1)], np.nan).T
    timing = _share(window, x, np.ones(len(offsets)))
    timing[np.isfinite(window).sum(axis=0) < MIN_TIMING_DAYS] = np.nan
    season = matrix[rows].copy()
    season[np.arange(len(rows)), cols] = np.nan
    return where, timing, _share(season.T, x, np.ones(matrix.shape[1]))


def git(*args):
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True).stdout.strip()


def load_config(region):
    return runpy.run_path(str(ROOT / CONFIGS[region]), run_name="qa_replay")["CONFIG"]


def settings(config, species, without):
    """The species settings as the nightly run loads them, narrowed to `species`, less `without`."""
    params, zone_curves = fp._load_species_and_curves(config)
    params = {s: p for s, p in params.items() if not species or s in species}
    for p in params.values():
        for part in without:
            p.pop(part, None)
    if "fruiting_gbm" in without and "fruiting" not in without:
        fp.attach_fruiting_models(params, config.region)  # the GBM had replaced the linear fit
    return params, zone_curves


def places(masters, region, day):
    table = pq.read_table(masters / f"{region}_weather_data.parquet",
                          columns=["Location_Id", "Latitude", "Longitude"], filters=[("Date", "==", day)])
    return table.to_pandas().drop_duplicates("Location_Id").assign(region=region).reset_index(drop=True)


def gbif_finds(cache, start, end):
    """GBIF taxa (with their kingdom) and sampled finds for the window, cached."""
    cache.mkdir(parents=True, exist_ok=True)
    session = requests.Session()
    session.headers["User-Agent"] = "fung.es replay QA"
    taxa_path, finds_path = cache / "taxa.json", cache / f"finds_{start}_{end}.json"
    if not taxa_path.exists():
        taxa_path.write_text(json.dumps(gbif.match_taxa(session), indent=1), encoding="utf-8")
    taxa = json.loads(taxa_path.read_text(encoding="utf-8"))
    if not finds_path.exists():
        rows, _ = gbif.fetch_occurrences(session, taxa, start, end)
        finds_path.write_text(json.dumps(rows), encoding="utf-8")
    return pd.DataFrame(json.loads(finds_path.read_text(encoding="utf-8"))), taxa


def assign(finds, grid, taxa):
    """Each find to its nearest place (any region: the GBIF boxes are not the regions' lists), one
    per species, place and day, at most FINDS_CAP per species and region."""
    tree = cKDTree(gbif.unit_xyz(grid.Latitude.to_numpy(), grid.Longitude.to_numpy()))
    distance, index = tree.query(gbif.unit_xyz(finds.lat.to_numpy(), finds.lon.to_numpy()))
    finds = finds.assign(km=gbif.chord_to_km(distance), region=grid.region.to_numpy()[index],
                         loc=grid.Location_Id.to_numpy()[index])
    finds = finds[finds.km <= MAX_KM].drop_duplicates(["species_id", "date", "loc"])
    finds = finds.sample(frac=1, random_state=0).groupby(["species_id", "region"]).head(FINDS_CAP)
    return finds.assign(kingdom=finds.species_id.map(lambda s: taxa[s].get("kingdom"))).reset_index(drop=True)


def score_region(region, finds, grid, masters, species, without, days):
    """Today's scores and the stored ones at the finds' places, every day of the window."""
    config = load_config(region)
    params, zone_curves = settings(config, species, without)
    other = fp.NEIGHBOUR_REGION[region]
    neighbour = settings(replace(config, region=other, season_curves_env=f"{other}_SEASON_CURVES"),
                         species, without)
    columns = [f"{s}_score" for s in params]

    own = grid[grid.region == region].reset_index(drop=True)
    xyz = gbif.unit_xyz(own.Latitude.to_numpy(), own.Longitude.to_numpy())
    targets = finds["loc"].unique()
    _, near = cKDTree(xyz).query(xyz[np.flatnonzero(own.Location_Id.isin(targets))], k=NEIGHBOURS)
    wanted = own.Location_Id.to_numpy()[np.unique(near)]
    print(f"{region}: {len(finds)} finds at {len(targets)} places, {len(wanted)} with their neighbours", flush=True)

    master = masters / f"{region}_weather_data.parquet"
    names = set(pq.ParquetFile(master).schema_arrow.names)
    history = pq.read_table(master, columns=[c for c in INPUTS + columns if c in names], filters=[
        ("Location_Id", "in", list(wanted)),
        ("Date", ">=", days[0] - pd.Timedelta(days=config.lag_days)), ("Date", "<=", days[-1])]).to_pandas()
    history["Date"] = pd.to_datetime(history["Date"]).dt.normalize()
    history = history.drop_duplicates(["Location_Id", "Date"], keep="last").sort_values(["Location_Id", "Date"])
    stored = history.loc[history.Location_Id.isin(targets) & history.Date.isin(days),
                         ["Location_Id", "Date", *(c for c in columns if c in history)]]
    inputs = history[[c for c in INPUTS if c in history]]
    del history

    parts, started = [], time.time()
    for i in range(0, len(days), CHUNK_DAYS):
        chunk = days[i:i + CHUNK_DAYS]
        lookup = inputs[(inputs.Date >= chunk[0] - pd.Timedelta(days=config.lag_days)) & (inputs.Date <= chunk[-1])]
        frame = fp.compute_lag_features(lookup, LAGS, days=config.lag_days, target=lookup[lookup.Date >= chunk[0]])
        scored = []
        for day in chunk:
            day_frame = fp.calculate_mushroom_score(frame[frame.Date == day].copy(), on_day(params, day), zone_curves)
            scored.append(fp.blend_neighbour_settings(day_frame, params, config,
                                                      neighbour=(on_day(neighbour[0], day), neighbour[1])))
        frame = fp.spatial_smooth_scores(pd.concat(scored), columns)
        frame[columns] = frame[columns].round(2)
        parts.append(frame.loc[frame.Location_Id.isin(targets), ["Location_Id", "Date", *columns]])
        print(f"  {region}: {chunk[0].date()}..{chunk[-1].date()} ({time.time() - started:.0f}s)", flush=True)
    return {"today": pd.concat(parts, ignore_index=True), "stored": stored}


def evaluate(region, finds, tables, days):
    """One row per find and source: its score, where, timing and season. Every find is someone's
    background; species without a score column (not scored in this run) get no rows."""
    place, day = pd.Index(finds["loc"].unique()), pd.DatetimeIndex(days)
    rows, cols = place.get_indexer(finds["loc"]), day.get_indexer(pd.to_datetime(finds.date))
    out = []
    for source, table in tables.items():
        pi, dj = place.get_indexer(table.Location_Id), day.get_indexer(table.Date)
        keep = (pi >= 0) & (dj >= 0)
        for species, mine in finds.groupby("species_id").groups.items():
            column = f"{species}_score"
            if column not in table:
                continue
            matrix = np.full((len(place), len(day)), np.nan)
            matrix[pi[keep], dj[keep]] = table[column].to_numpy(float)[keep]
            kingdom = finds.kingdom[mine[0]]
            others = finds.loc[(finds.kingdom == kingdom) & (finds.species_id != species), "loc"].value_counts()
            index = finds.index.get_indexer(mine)
            where, timing, season = percentiles(matrix, rows[index], cols[index],
                                                place.get_indexer(others.index), others.to_numpy())
            out.append(pd.DataFrame({
                "region": region, "species": species, "kingdom": kingdom, "source": source,
                "date": finds.date.to_numpy()[index], "loc": finds["loc"].to_numpy()[index],
                "score": matrix[rows[index], cols[index]], "where": where, "timing": timing, "season": season}))
    return pd.concat(out, ignore_index=True)


def summarise(results, reference):
    """Per region and species (and 'all'): finds scored, mean where/timing/season of today's code,
    and today minus `reference` on the finds both scored."""
    key = ["region", "species", "date", "loc"]
    today = results[(results.source == "today") & np.isfinite(results.score)]
    paired = today.merge(results[results.source == reference], on=key, suffixes=("", "_ref"))
    paired = paired[np.isfinite(paired.score_ref)]
    out = []
    for group in (["region"], ["region", "species"]):
        mine = today.groupby(group)[["where", "timing", "season"]].mean().join(today.groupby(group).size().rename("n"))
        both = paired.assign(d_where=paired["where"] - paired.where_ref, d_timing=paired.timing - paired.timing_ref)
        both = both.groupby(group)[["d_where", "d_timing"]].mean().join(both.groupby(group).size().rename("paired"))
        out.append(mine.join(both).reset_index())
    summary = pd.concat(out, ignore_index=True)
    summary["species"] = summary.species.fillna("all")
    summary["paired"] = summary.paired.fillna(0).astype(int)
    return summary.sort_values(["region", "n"], ascending=[True, False])


def number(value, sign=False):
    return "–" if pd.isna(value) else f"{value:+.2f}" if sign else f"{value:.2f}"


def write_report(path, summary, meta):
    names = {s: c["name"] for s, c in get_species_metadata().items()}
    reference = f"`{meta['against']}`" if meta["against"] else "the stored scores"
    lines = [
        f"# Replay QA, {meta['start']} to {meta['end']}", "",
        f"Code: `{meta['branch']}` at `{meta['commit']}`{' (uncommitted changes)' if meta['dirty'] else ''}"
        + (f", without {', '.join(meta['without'])}" if meta["without"] else "")
        + f". Weather: the masters as of {meta['masters_date']}. Reference (Δ): {reference}, on the finds both scored.",
        "",
        "Shares of scores below the find's, ties half; 0.5 is chance. **where**: the same day at the other "
        "species' finds of its kingdom (fungi or plants) in the region. **timing**: the same place, 3 weeks "
        "either side. **season**: the same place, the whole window.",
        "",
        "Caveats: GBIF plant records include flowering and fruiting plants, not only the stage that is "
        f"foraged. Trained on finds up to: fruiting fits {meta['trained'].get('fruiting_fit')}, GBM "
        f"{meta['trained'].get('fruiting_gbm')}, habitat {meta['trained'].get('habitat_factor')}: this "
        "year's numbers flatter what learned from this year. The stored scores are each night's model.",
        "",
    ]
    for region in meta["regions"]:
        rows = summary[(summary.region == region) & ((summary.species == "all") | (summary.n >= MIN_FINDS))]
        lines += [f"## {region} ({meta['seconds'].get(region, 0) // 60} min)", "",
                  "| | finds | where | timing | season | Δ where | Δ timing | paired |",
                  "|---|---:|---:|---:|---:|---:|---:|---:|"]
        for r in sorted(rows.itertuples(), key=lambda r: (r.species != "all", -r.n)):
            label = "**all**" if r.species == "all" else names.get(r.species, r.species)
            lines.append(f"| {label} | {r.n} | {number(r.where)} | {number(r.timing)} | {number(r.season)} | "
                         f"{number(r.d_where, True)} | {number(r.d_timing, True)} | {r.paired} |")
        lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", type=Path)
    parser.add_argument("--against", type=Path, help="another run's --out, e.g. main's for a branch")
    parser.add_argument("--regions", default=",".join(CONFIGS))
    parser.add_argument("--species", default="", help="comma-separated ids; default all")
    parser.add_argument("--without", default="", help=f"comma-separated parts of {', '.join(PARTS)}")
    parser.add_argument("--start", help="default: the masters' first day + the lag days")
    parser.add_argument("--end", help="default: yesterday")
    parser.add_argument("--masters", type=Path, default=ROOT.parent / "backups" / "masters")
    parser.add_argument("--cache", type=Path, default=ROOT.parent / "qa" / "gbif")
    args = parser.parse_args()
    regions = args.regions.split(",")
    species = {s for s in args.species.split(",") if s}
    without = [p for p in args.without.split(",") if p]
    if set(without) - set(PARTS):
        parser.error(f"--without takes {', '.join(PARTS)}")
    if fp.lgb is None:
        raise SystemExit("No LightGBM here: GBM species would be scored with their linear fit. "
                         "Use the Python the nightly scoring runs with.")
    fp.load_dotenv(ROOT / ".env")
    fp.load_dotenv(ROOT / ".env.secret")
    # The blend reads both regions' place lists from R2 on every call: once per run is enough.
    fp._load_coords_any = functools.lru_cache(maxsize=None)(fp._load_coords_any)
    warnings.filterwarnings("ignore", category=pd.errors.PerformanceWarning)  # lag columns, one at a time
    branch = git("rev-parse", "--abbrev-ref", "HEAD")
    out = args.out or ROOT.parent / "qa" / f"{branch.replace('/', '-')}-{date.today()}"
    out.mkdir(parents=True, exist_ok=True)

    other = json.loads((args.against / "metadata.json").read_text(encoding="utf-8")) if args.against else {}
    if not args.start and not other:
        first = max(pc.min(pq.read_table(args.masters / f"{r}_weather_data.parquet", columns=["Date"])["Date"]).as_py()
                    for r in regions)
        args.start = (pd.Timestamp(first) + pd.Timedelta(days=load_config(regions[0]).lag_days)).date().isoformat()
    start = args.start or other["start"]
    end = args.end or other.get("end") or (date.today() - timedelta(days=1)).isoformat()
    days = pd.date_range(start, end)

    finds, taxa = gbif_finds(args.cache, start, end)
    finds = finds[finds.date.between(start, end)]
    grid = pd.concat([places(args.masters, r, days[-1]) for r in CONFIGS], ignore_index=True)
    finds = assign(finds, grid, taxa)
    results, seconds = [], {}
    for region in regions:
        started = time.time()
        mine = finds[finds.region == region].reset_index(drop=True)
        tables = score_region(region, mine, grid, args.masters, species, without, days)
        rows = evaluate(region, mine, tables, days)
        rows.to_csv(out / f"finds_{region}.csv", index=False)
        results.append(rows)
        seconds[region] = round(time.time() - started)
        print(f"{region}: done in {seconds[region]}s", flush=True)

    results = pd.concat(results, ignore_index=True)
    reference = "stored"
    if args.against:
        theirs = pd.concat([pd.read_csv(args.against / f"finds_{r}.csv", dtype={"loc": str, "date": str}) for r in regions
                            if (args.against / f"finds_{r}.csv").exists()], ignore_index=True)
        results = pd.concat([results, theirs[theirs.source == "today"].assign(source="against")], ignore_index=True)
        reference = "against"
    summary = summarise(results, reference)
    summary.to_csv(out / "summary.csv", index=False)
    generated = ROOT / "backend" / "generated"
    meta = {
        "start": start, "end": end, "regions": regions, "species": sorted(species), "without": without,
        "branch": branch, "commit": git("rev-parse", "--short", "HEAD"), "dirty": bool(git("status", "--porcelain")),
        "against": str(args.against) if args.against else None, "seconds": seconds,
        "masters_date": date.fromtimestamp((args.masters / f"{regions[0]}_weather_data.parquet").stat().st_mtime).isoformat(),
        "finds": {r: int((finds.region == r).sum()) for r in regions},
        "trained": {name: json.loads((generated / f"{name}.json").read_text(encoding="utf-8")).get("trained")
                    for name in ("fruiting_fit", "fruiting_gbm", "habitat_factor")},
    }
    (out / "metadata.json").write_text(json.dumps(meta, indent=1), encoding="utf-8")
    write_report(out / "report.md", summary, meta)
    print(f"Report: {out / 'report.md'}")


if __name__ == "__main__":
    main()
