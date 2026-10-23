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
The same for the stored scores (compared with today's code on the place-days they have, a
species added in October having no stored September, and with each day's mean over the places
off both sides, as the stored scores step on the nights the code changed) and, with --against,
for another run's. Days the masters lack are filled from the days either side (up to 2).

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
from species_registry import get_composites, get_species_metadata  # noqa: E402

CONFIGS = {
    "NE": "backend/EU/North_Europe/NE_Scoring.py",
    "SE": "backend/EU/South_Europe/SE_Scoring.py",
    "USE": "backend/US/USE/USE_Scoring.py",
    "USW": "backend/US/USW/USW_Scoring.py",
}
PARTS = ("fruiting_gbm", "fruiting", "habitat", "local_season", "phenology", "range_prior", "host_prior")
# Weather the masters lack on whole days (1 May, 22 May and 3 Jun 2026 in every region): read
# across such a hole, a day's lags would come from nothing. The nightly run no longer reads them.
WEATHER = ["Pressure (hPa)", "TotalPrecipitation_mm", "Humidity (%)", "Wind Speed (m/s)", "Temperature (C) Max",
           "Temperature (C) Min", "Temperature (C)", "Wind Speed Mean (kph)", "Rain Hours", "Snowfall (cm)",
           "Solar Radiation (Wh/m2)"]
GAP_DAYS = 2
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
ABSENT_KM = 10.0         # where_absent: background spots this close to a find of the species are left out


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


def fill_gaps(inputs):
    """Each place's missing days, up to GAP_DAYS in a row, as the days either side interpolated
    (weather) or carried (the place's own columns); longer holes stay holes."""
    inputs = inputs.sort_values(["Location_Id", "Date"])
    locs, days = inputs.Location_Id.unique(), pd.date_range(inputs.Date.min(), inputs.Date.max())
    frame = inputs.set_index(["Location_Id", "Date"]).reindex(pd.MultiIndex.from_product([locs, days]))
    present = frame["Latitude"].notna().to_numpy().reshape(len(locs), len(days))
    position = np.broadcast_to(np.arange(len(days)), present.shape)
    before = np.maximum.accumulate(np.where(present, position, -1), axis=1)
    after = np.minimum.accumulate(np.where(present, position, len(days))[:, ::-1], axis=1)[:, ::-1]
    fill = ~present & (before >= 0) & (after < len(days)) & (after - before - 1 <= GAP_DAYS)
    rows, cols = np.nonzero(fill)
    b, a = before[rows, cols], after[rows, cols]
    share = (cols - b) / (a - b)
    for column in frame.columns:
        values = frame[column].to_numpy().reshape(len(locs), len(days)).copy()
        if column in WEATHER:
            start, end = values[rows, b].astype(float), values[rows, a].astype(float)
            values[rows, cols] = start + share * (end - start)
        else:
            values[rows, cols] = values[rows, b]
        frame[column] = values.reshape(-1)
    keep = (present | fill).reshape(-1)
    return frame[keep].rename_axis(["Location_Id", "Date"]).reset_index()


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


def with_composites(finds):
    """Each composite's finds are its members' finds (one per place and day), marked so that they
    are never anyone's background and never counted twice in a pooled figure."""
    extra = [finds[(finds.region == region) & finds.species_id.isin(members)].assign(species_id=composite)
             for region in finds.region.unique() for composite, members in get_composites(region).items()]
    extra = pd.concat(extra, ignore_index=True).drop_duplicates(["species_id", "date", "loc"]) if extra else finds.iloc[:0]
    return pd.concat([finds.assign(composite=False), extra.assign(composite=True)], ignore_index=True)


def score_region(region, finds, grid, masters, species, without, days):
    """Today's scores and the stored ones at the finds' places, every day of the window."""
    config = load_config(region)
    params, zone_curves = settings(config, species, without)
    other = fp.NEIGHBOUR_REGION[region]
    neighbour = settings(replace(config, region=other, season_curves_env=f"{other}_SEASON_CURVES"),
                         species, without)
    columns = [f"{s}_score" for s in params]
    # A composite is the best of its members at each place and day, as the nightly run makes it;
    # only when every member is scored, or it would be a different layer.
    composites = {c: [f"{m}_score" for m in members] for c, members in get_composites(region).items()
                  if all(m in params for m in members)}

    own = grid[grid.region == region].reset_index(drop=True)
    xyz = gbif.unit_xyz(own.Latitude.to_numpy(), own.Longitude.to_numpy())
    targets = finds["loc"].unique()
    _, near = cKDTree(xyz).query(xyz[np.flatnonzero(own.Location_Id.isin(targets))], k=NEIGHBOURS)
    wanted = own.Location_Id.to_numpy()[np.unique(near)]
    print(f"{region}: {len(finds)} finds at {len(targets)} places, {len(wanted)} with their neighbours", flush=True)

    master = masters / f"{region}_weather_data.parquet"
    names = set(pq.ParquetFile(master).schema_arrow.names)
    stored_columns = columns + [f"{c}_score" for c in composites]
    history = pq.read_table(master, columns=[c for c in INPUTS + stored_columns if c in names], filters=[
        ("Location_Id", "in", list(wanted)),
        ("Date", ">=", days[0] - pd.Timedelta(days=config.lag_days)), ("Date", "<=", days[-1])]).to_pandas()
    history["Date"] = pd.to_datetime(history["Date"]).dt.normalize()
    history = history.drop_duplicates(["Location_Id", "Date"], keep="last").sort_values(["Location_Id", "Date"])
    stored = history.loc[history.Location_Id.isin(targets) & history.Date.isin(days),
                         ["Location_Id", "Date", *(c for c in stored_columns if c in history)]]
    inputs = fill_gaps(history[[c for c in INPUTS if c in history]])
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
        for composite, members in composites.items():
            frame[f"{composite}_score"] = frame[members].max(axis=1)
        parts.append(frame.loc[frame.Location_Id.isin(targets), ["Location_Id", "Date", *stored_columns]])
        print(f"  {region}: {chunk[0].date()}..{chunk[-1].date()} ({time.time() - started:.0f}s)", flush=True)
    return {"today": pd.concat(parts, ignore_index=True), "stored": stored}


def day_steps_off(values):
    """A place x day matrix less each day's mean over the places (days without any stay NaN)."""
    counts = np.isfinite(values).sum(axis=0)
    means = np.divide(np.nansum(values, axis=0), counts, out=np.full(values.shape[1], np.nan), where=counts > 0)
    return values - means


def evaluate(region, finds, tables, days):
    """One row per find and source: its score, where, timing and season, for today's code, the
    stored scores, and today's code on the place-days the stored scores have ("today@stored"): a
    species added in October has no stored September, and its 3 weeks must be the same days on
    both sides. Every find is someone's background; species this run did not score get no rows."""
    place, day = pd.Index(finds["loc"].unique()), pd.DatetimeIndex(days)
    located = {"lat", "lon"} <= set(finds.columns)   # GBIF finds always are; test frames may not be
    spots = finds.groupby("loc")[["lat", "lon"]].mean() if located else None
    rows, cols = place.get_indexer(finds["loc"]), day.get_indexer(pd.to_datetime(finds.date))
    cells = {}
    for source, table in tables.items():
        pi, dj = place.get_indexer(table.Location_Id), day.get_indexer(table.Date)
        cells[source] = (pi >= 0) & (dj >= 0), pi, dj

    def matrix(source, column):
        keep, pi, dj = cells[source]
        values = np.full((len(place), len(day)), np.nan)
        if column in tables[source]:
            values[pi[keep], dj[keep]] = tables[source][column].to_numpy(float)[keep]
        return values

    composite = finds["composite"].to_numpy(bool) if "composite" in finds else np.zeros(len(finds), bool)
    members = get_composites(region) if composite.any() else {}
    out = []
    for species, mine in finds.groupby("species_id").groups.items():
        column = f"{species}_score"
        if column not in tables["today"]:
            continue
        today, stored = matrix("today", column), matrix("stored", column)
        kingdom = finds.kingdom[mine[0]]
        own = {species, *members.get(species, ())}
        others = finds.loc[(finds.kingdom == kingdom) & ~composite & ~finds.species_id.isin(own), "loc"].value_counts()
        index = finds.index.get_indexer(mine)
        r, c = rows[index], cols[index]
        # In a broad flush the species also stands at many of the other species' spots, and those
        # are not misses: `where_absent` keeps only background spots with no find of the species
        # within ABSENT_KM in the window.
        absent = others
        if located:
            tree = cKDTree(gbif.unit_xyz(finds.lat.to_numpy()[index], finds.lon.to_numpy()[index]))
            distance, _ = tree.query(gbif.unit_xyz(spots.lat.reindex(others.index).to_numpy(),
                                                   spots.lon.reindex(others.index).to_numpy()))
            absent = others[gbif.chord_to_km(distance) > ABSENT_KM]
        # Against the stored scores, each day's mean over the places comes off both sides: the
        # stored scores step on the nights the code changed (winter chanterelle North Europe -1.0
        # on 12 Oct), and read as timing those steps are the code's, not the weather's.
        for source, values in (("today", today), ("stored", day_steps_off(stored)),
                               ("today@stored", day_steps_off(np.where(np.isfinite(stored), today, np.nan)))):
            where, timing, season = percentiles(values, r, c, place.get_indexer(others.index), others.to_numpy())
            where_absent = percentiles(values, r, c, place.get_indexer(absent.index), absent.to_numpy())[0]
            out.append(pd.DataFrame({
                "region": region, "species": species, "kingdom": kingdom, "composite": bool(composite[index[0]]),
                "source": source,
                "date": finds.date.to_numpy()[index], "loc": finds["loc"].to_numpy()[index],
                "score": values[r, c], "where": where, "where_absent": where_absent,
                "timing": timing, "season": season}))
    return pd.concat(out, ignore_index=True)


def summarise(results, reference):
    """Per region, kingdom ('all Fungi', 'all Plantae') and species: finds scored and the mean
    where/timing/season of today's code; and today minus `reference` ('stored' or 'against') on
    the finds both scored, today's read on the stored scores' place-days against 'stored'."""
    key = ["region", "species", "date", "loc"]
    results = results.assign(composite=results.get("composite", False)).fillna({"composite": False})
    today = results[(results.source == "today") & np.isfinite(results.score)]
    mine = results[results.source == ("today@stored" if reference == "stored" else "today")]
    paired = mine.merge(results[results.source == reference], on=key, suffixes=("", "_ref"))
    paired = paired[np.isfinite(paired.score) & np.isfinite(paired.score_ref)]
    paired = paired.assign(d_where=paired["where"] - paired.where_ref, d_timing=paired.timing - paired.timing_ref)
    out = []
    for group in (["region", "kingdom"], ["region", "species"]):
        # A composite's finds are its members' again: they stay out of the kingdom's pooled figure.
        mine = today[~today.composite.astype(bool)] if "kingdom" in group else today
        pairs = paired[~paired.composite.astype(bool)] if "kingdom" in group else paired
        means = mine.groupby(group)[["where", "timing", "season"]].mean().join(mine.groupby(group).size().rename("n"))
        deltas = pairs.groupby(group)[["d_where", "d_timing"]].mean().join(pairs.groupby(group).size().rename("paired"))
        out.append(means.join(deltas).reset_index())
    summary = pd.concat(out, ignore_index=True)
    pooled = summary.species.isna()
    summary.loc[pooled, "species"] = "all " + summary.kingdom[pooled].fillna("other")
    summary["paired"] = summary.paired.fillna(0).astype(int)
    return summary.drop(columns="kingdom").sort_values(["region", "n"], ascending=[True, False])


def number(value, sign=False):
    return "–" if pd.isna(value) else f"{value:+.2f}" if sign else f"{value:.2f}"


def write_report(path, summary, meta):
    names = {s: c["name"] for s, c in get_species_metadata().items()}
    reference = (f"`{meta['against']}`, on the finds both scored" if meta["against"] else
                 "the stored scores, on the finds and place-days they have, each day's mean off both")
    lines = [
        f"# Replay QA, {meta['start']} to {meta['end']}", "",
        f"Code: `{meta['branch']}` at `{meta['commit']}`{' (uncommitted changes)' if meta['dirty'] else ''}"
        + (f", without {', '.join(meta['without'])}" if meta["without"] else "")
        + f". Weather: the masters as of {meta['masters_date']}. Δ: today minus {reference}.",
        "",
        "Shares of scores below the find's, ties half; 0.5 is chance. **where**: the same day at the other "
        "species' finds of its kingdom (fungi or plants) in the region. **timing**: the same place, 3 weeks "
        "either side. **season**: the same place, the whole window.",
        "",
        "Caveats: GBIF plant records include flowering and fruiting plants, not only the stage people "
        f"forage. The years of finds the models learned from: fruiting fits {meta['trained'].get('fruiting_fit')}, "
        f"GBM {meta['trained'].get('fruiting_gbm')}, habitat factor {meta['trained'].get('habitat_factor')}; "
        "where that includes this year, its numbers flatter them a little. The stored scores are each night's model.",
        "",
    ]
    for region in meta["regions"]:
        mine = summary[summary.region == region]
        pooled = mine.species.str.startswith("all ")
        rows = pd.concat([mine[pooled], mine[~pooled & (mine.n >= MIN_FINDS)]])
        lines += [f"## {region} ({meta['seconds'].get(region, 0) // 60} min)", "",
                  "| | finds | where | timing | season | Δ where | Δ timing | paired |",
                  "|---|---:|---:|---:|---:|---:|---:|---:|"]
        for r in rows.itertuples():
            label = f"**{r.species}**" if r.species.startswith("all ") else names.get(r.species, r.species)
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
    finds = with_composites(assign(finds, grid, taxa))
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
