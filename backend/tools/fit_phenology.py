#!/usr/bin/env python3
"""When a plant is in the stage people pick it: a learned season per place, from
iNaturalist's plant-phenology annotations (flowering, fruiting, budding, no flowers).

A species' sightings tagged in the stage people pick (fruit for berries, flowers for
elderflower) are compared with every tagged sighting of the app's plants at the same places
and times, the record of people out looking, so effort cancels as in the fungi season curves
(tools/build_season_curves.py: a species' finds against all fungi finds). Read alone, a
species' own share of sightings in the stage stays high out of season: a wild strawberry
photographed in October usually has a fruit, though North Europe reports a 24th of July's.
A LightGBM classifier per species learns the stage's share among all those sightings from
the day of the year, day length, latitude and the place's yearly ERA5 normals: a calendar
that follows climate, where today's season_months are one calendar per region. Production
reads it per 0.25 degree cell and week as a ratio to the place's own peak week
(seasonality.phenology_ratio), with a flat multiplier (0.8-1.0) and a gate of its own.

Each year is held out in turn: does the learned season, as production computes it, rank the
species' stage sightings above everyone's sightings that year better than today's season
factor? A species ships if it does in more years than chance would give (sign test p < 0.1,
at least 6 years), and if its learned season stays shut, in each latitude band where it grows, in the months where the tags show
under a tenth of its peak per sighting (DEAD_MONTH): fruit that hangs on for months, nuts on
the ground and green fruit tagged as fruiting can spread a stage over half the year.

The stage people pick, per plant (STAGE): fruit for berries and nuts, flowers for elderflower,
daisy, dandelion and violets, the bud for wild artichoke, leaves before flowering for wild
garlic, ramps, nettle, sorrel and asparagus, and any sighting for the plants eaten whatever
their stage (chickweed, plantain, amaranth, masterwort, wild mint), which with dandelion
keep their months (SEASON). Fiddleheads carry no tags: ferns do not flower.

    python backend/tools/fit_phenology.py --out ../plant_training --download   # iNaturalist, resumable
    python backend/tools/fit_phenology.py --out ../plant_training               # table, test, report
    python backend/tools/fit_phenology.py --out ../plant_training --export      # R2 + generated/phenology.json
"""
import lightgbm as lgb  # before pandas/pyarrow: see tests/conftest.py
import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT / "backend")]
import era5_normals  # noqa: E402
import forecast_pipeline as fp  # noqa: E402
import seasonality as sn  # noqa: E402
from species_registry import get_species_params, infer_region  # noqa: E402
from tag_ripeness import RIPE  # noqa: E402

STAGE = {**dict.fromkeys(("blackberry", "cloudberry", "huckleberry", "lingonb", "pawpaw", "raspberry",
                          "rose_hips", "sea_buckthorn", "strawberry", "chestnut", "hazelnut", "walnut"), "fruiting"),
         # fruiting sightings whose photo shows ripe fruit (tools/tag_ripeness.py)
         **dict.fromkeys(("blueberry", "elderberry", "sloes"), "ripe"),
         **dict.fromkeys(("daisy", "dandelion", "elderflower", "violets"), "flowering"),
         **dict.fromkeys(("garlic", "nettle", "sorrel", "asparagus"), "leaves"),
         "ramps": "leaves_unbudded",      # its June buds stand on bare stalks, the leaves gone
         "artichoke": "budding",
         **dict.fromkeys(("chickweed", "plantain", "amaranth", "masterwort", "wild-mint"), "any")}
# A learned season only where the tagged stage is what people pick, in a window: a plant eaten
# whatever its stage (chickweed, plantain, wild mint) is seen most when it flowers and stands
# out, and dandelion's flowers are a short part of a leaf season; their learned seasons shut
# them in their best months (wild mint, North Europe, 25 June: 100% of places at 4+ to 1%).
SEASON = [s for s, stage in STAGE.items() if stage != "any" and s != "dandelion"]
# Fruiting tags include green fruit. Where it hangs green for weeks the learned season opened
# that early, at 35-80% of places at 4+ on 25 June for hazelnut, walnut, pawpaw and sloes, 45%
# for elderberry, whose green berries are toxic. The dark berries now read only the sightings
# whose photo shows them ripe (stage "ripe"), and elderberry ships. Sloes still keep their
# months: they colour in July in the south and August in the north, but are picked from
# September, after the first frosts, so dark is not ripe (20 August, South Europe: 41% to 90% of
# places at 4+). Blueberry opens a June band in South Europe, and US West has under 20 ripe tags
# a band, so its 45% on 12 October there is US East's clock. The nuts and pawpaw keep their
# months: their ripest-looking photos are last year's husks, shells and seeds on winter ground.
# US blackberries mix spring dewberries with late Pacific blackberries, and the learned season
# kept Kansas and Nebraska at 6-7 on 12 October: blackberry ships in Europe only. Sorrel's leaves
# stay up all winter, so its share peaks in December, when few other plants are photographed,
# and its spring reads under half of that. (Ramps, read as "leaves", counted its June budding
# stalks and opened on 25 June; leaves_unbudded fixed that.)
HELD_BACK = {"blueberry", "hazelnut", "pawpaw", "sloes", "sorrel", "walnut"}
HELD_BACK_IN = {("blackberry", "US")}
# Elderflower and elderberry are one plant: its sightings, read for flowers or for fruit.
TAXA = {"elderflower": "elderberry"}
DEAD_MONTH, OPEN = 0.10, 0.5     # a month under a tenth of the peak per sighting must stay below half open
# Dead months are judged per region and BAND_DEGREES latitude band, against the band's own peak,
# where the band holds at least BAND_MIN_STAGE stage sightings: across a whole region, February
# was "dead" for violets in US East although it is their peak at 32-36 N, while daisy's January
# opening at 32-40 N hid in the average.
BAND_DEGREES, BAND_MIN_STAGE = 4, 20
INAT = "https://api.inaturalist.org"
FIELDS = ("id,observed_on,location,positional_accuracy,quality_grade,taxon.id,taxon.name,"
          "annotations.controlled_attribute_id,annotations.controlled_value_id,annotations.vote_score")
BOXES = {"EU": (27.0, -25.0, 72.0, 46.0), "US": (24.0, -126.0, 50.5, -66.0)}
STAGES = {13: "flowering", 14: "fruiting", 15: "budding", 21: "no_flowers"}
CALENDAR = ["doy", "daylength_h", "lat", "norm_tmean_year", "norm_rain_year", "norm_tmean_day", "gdd_normal"]
# The season's clock is warmth: day of year and latitude alone let a southern spring leak north
# (violets open in February at 36-44 N in US East, where the tags show none). Each place's normal
# temperature on the day and its normal degree-days over GDD_BASE since 1 January say when its own
# spring arrives.
GDD_BASE = 5.0
PARAMS = {"objective": "binary", "learning_rate": 0.05, "num_leaves": 15, "min_data_in_leaf": 50,
          "feature_fraction": 0.9, "bagging_fraction": 0.8, "bagging_freq": 1, "verbose": -1, "seed": 291}
MIN_TEST, SHIP_P, SHIP_MIN_YEARS = 30, 0.1, 6
R2_FOLDER = "models/phenology"


def daylength(lat, doy):
    decl = 23.44 * np.sin(np.radians(360 / 365 * (np.asarray(doy, float) - 81)))
    x = -np.tan(np.radians(np.asarray(lat, float))) * np.tan(np.radians(decl))
    return 24 / np.pi * np.arccos(np.clip(x, -1, 1))


def thermal(grid, lats, lons, doys):
    """(normal temperature on the day, normal degree-days over GDD_BASE since 1 January) per row,
    from its cell's monthly normals blended between mid-months; worked out once per cell."""
    lat, lon = grid["lat"], grid["lon"]
    i = np.rint((lat[0] - lats) / (lat[0] - lat[1])).astype(int)
    j = np.rint((lons - lon[0]) / (lon[1] - lon[0])).astype(int)
    inside = (i >= 0) & (i < len(lat)) & (j >= 0) & (j < len(lon))
    cell = np.where(inside, np.clip(i, 0, len(lat) - 1) * len(lon) + np.clip(j, 0, len(lon) - 1), -1)
    cells, at = np.unique(cell, return_inverse=True)
    monthly = np.full((12, len(cells)), np.nan)
    monthly[:, cells >= 0] = np.asarray(grid["tmean"], float).reshape(12, -1)[:, cells[cells >= 0]]
    position = (np.arange(1, 366) - 15.0) / (365.25 / 12)               # 0 = mid-January
    before = np.floor(position).astype(int)
    weight = (position - before)[:, None]
    daily = (1 - weight) * monthly[before % 12] + weight * monthly[(before + 1) % 12]
    gdd = np.cumsum(np.clip(daily - GDD_BASE, 0, None), axis=0)
    day = np.clip(np.asarray(doys, int), 1, 365) - 1
    return daily[day, at], gdd[day, at]


def calendar_rows(lats, lons, doys, grid):
    """The calendar features for places and days of the year, from one continent's normals."""
    lats, lons, doys = (np.asarray(v, float) for v in (lats, lons, doys))
    months = [era5_normals.lookup(grid, lats, lons, np.full(len(lats), m)) for m in range(1, 13)]
    t_day, gdd = thermal(grid, lats, lons, doys)
    return pd.DataFrame({"doy": doys, "daylength_h": daylength(lats, doys), "lat": lats,
                         "norm_tmean_year": np.mean([m["norm_tmean"] for m in months], axis=0),
                         "norm_rain_year": np.mean([m["norm_rain"] for m in months], axis=0),
                         "norm_tmean_day": t_day, "gdd_normal": gdd})


def week_ratio(model, lats, lons, grid):
    """[place, week]: the stage's share each week, smoothed over three weeks, against its
    yearly peak at that place (1 = the peak week), as production reads it."""
    n, weeks = len(lats), len(sn.PHENOLOGY_WEEK_DOY)
    rows = calendar_rows(np.repeat(lats, weeks), np.repeat(lons, weeks), np.tile(sn.PHENOLOGY_WEEK_DOY, n), grid)
    p = model.predict(rows[CALENDAR]).reshape(n, weeks)
    p = (np.roll(p, 1, axis=1) + p + np.roll(p, -1, axis=1)) / 3
    return p / np.maximum(p.max(axis=1, keepdims=True), 1e-9)


def download(out: Path) -> None:
    """Every tagged sighting of each plant of the app, in the Europe and US boxes, 2016 on:
    the candidates and the background of people out looking. One parquet per species."""
    import requests
    http = requests.Session()
    http.headers["User-Agent"] = "fung.es plant phenology research"

    def get(url, params):
        for attempt in range(8):
            try:
                r = http.get(url, params=params, timeout=120)
                if r.status_code == 200:
                    time.sleep(1.0)
                    return r.json()
                wait = int(r.headers.get("Retry-After", 30 * (attempt + 1)))
            except requests.RequestException:
                wait = 30 * (attempt + 1)
            time.sleep(wait)
        raise RuntimeError(f"gave up on {url}")

    def taxon_id(name):
        for t in get(f"{INAT}/v1/taxa", {"q": name, "per_page": 10})["results"]:
            if t["name"] == name and t["rank"] in ("species", "genus", "subspecies", "variety"):
                return t["id"]
        return None

    registry = json.loads((ROOT / "backend" / "generated" / "species_registry.json").read_text(encoding="utf-8"))["species"]
    plants = [m["id"] for m in (json.loads(f.read_text(encoding="utf-8")) for f in (ROOT / "content" / "species").glob("*/species.json"))
              if m["catalog"]["category"] != "mushroom" and m["forecast"]["enabled"] and not m["forecast"].get("compositeOf")]
    (out / "inat").mkdir(parents=True, exist_ok=True)
    for species in sorted(plants):
        path = out / "inat" / f"{species}.parquet"
        if path.exists():
            continue
        names = [get(f"https://api.gbif.org/v1/species/{k}", {}).get("canonicalName") for k in registry[species]["rangeTaxonKeys"]]
        ids = ([i for i in (taxon_id(n) for n in names if n) if i]
               or [i for i in [taxon_id(registry[species]["scientificName"])] if i])
        rows = []
        for box, (s, w, n, e) in BOXES.items() if ids else ():
            last = 0
            while True:
                page = get(f"{INAT}/v2/observations", {
                    "taxon_id": ",".join(map(str, ids)), "term_id": 12, "verifiable": "true", "d1": "2016-01-01",
                    "swlat": s, "swlng": w, "nelat": n, "nelng": e, "order_by": "id", "order": "asc",
                    "id_above": last, "per_page": 200, "fields": FIELDS})
                for o in page["results"]:
                    if not o.get("location") or not o.get("observed_on"):
                        continue
                    lat, lon = map(float, o["location"].split(","))
                    tags = {STAGES[a["controlled_value_id"]] for a in o.get("annotations") or []
                            if a.get("controlled_attribute_id") == 12 and a.get("controlled_value_id") in STAGES
                            and (a.get("vote_score") or 0) >= 0}
                    rows.append({"id": o["id"], "date": o["observed_on"], "lat": lat, "lon": lon, "box": box,
                                 "accuracy_m": o.get("positional_accuracy"), "quality": o.get("quality_grade"),
                                 "taxon": (o.get("taxon") or {}).get("name"), **{v: v in tags for v in STAGES.values()}})
                if len(page["results"]) < 200:
                    break
                last = page["results"][-1]["id"]
        pd.DataFrame(rows).to_parquet(path, index=False)
        print(f"{species}: {len(rows):,} tagged sightings", flush=True)


def stages(s: pd.DataFrame, ripe=()) -> dict:
    """Each stage's sightings, read off their tags; ripe: the ids whose photo shows ripe fruit."""
    leaves = s["no_flowers"] | s["budding"]
    return {"fruiting": s["fruiting"], "flowering": s["flowering"], "budding": s["budding"],
            "ripe": s["fruiting"] & s["id"].isin(set(ripe)),
            "leaves": leaves & ~s["flowering"] & ~s["fruiting"],
            "leaves_unbudded": s["no_flowers"] & ~s["budding"] & ~s["flowering"] & ~s["fruiting"],
            "any": pd.Series(True, index=s.index)}


def table(out: Path) -> pd.DataFrame:
    """Every tagged sighting of the app's plants once, with its calendar features and, per
    candidate, whether it is that species in the stage people pick."""
    frames = [pd.read_parquet(f).assign(species=f.stem) for f in sorted((out / "inat").glob("*.parquet"))]
    s = pd.concat([f for f in frames if len(f)], ignore_index=True)
    ripeness = out / "ripeness.parquet"
    tagged = stages(s, pd.read_parquet(ripeness).query(f"p_ripe >= {RIPE}")["id"] if ripeness.exists() else ())
    for species, stage in STAGE.items():
        own = s["species"] == TAXA.get(species, species)
        s[species] = s["id"].isin(set(s.loc[own & tagged[stage], "id"]))
    s = s.groupby("id", as_index=False).agg({"date": "first", "lat": "first", "lon": "first", "box": "first",
                                            "accuracy_m": "first", **{c: "max" for c in STAGE}})
    s["date"] = pd.to_datetime(s["date"], errors="coerce")
    s = s[s["date"].between("2016-03-01", pd.Timestamp.now()) & (s["accuracy_m"].fillna(0) <= 5000)].reset_index(drop=True)
    s["doy"], s["year"] = s["date"].dt.dayofyear, s["date"].dt.year
    for box, region in (("EU", "NE"), ("US", "USE")):
        rows = s["box"] == box
        s.loc[rows, CALENDAR] = calendar_rows(s.loc[rows, "lat"], s.loc[rows, "lon"], s.loc[rows, "doy"],
                                              era5_normals.load(region)).to_numpy()
    s = s.dropna(subset=CALENDAR).reset_index(drop=True)
    s["cell_lat"] = (np.round(s["lat"] / 0.25) * 0.25).round(2)
    s["cell_lon"] = (np.round(s["lon"] / 0.25) * 0.25).round(2)
    s["region"] = [infer_region(lon, lat) for lon, lat in zip(s["lon"], s["lat"])]
    return s


def scope(s: pd.DataFrame, species: str, params: dict) -> pd.DataFrame:
    """The sightings in the regions where the species is scored."""
    return s[s["region"].isin([r for r in params if species in params[r]])].reset_index(drop=True)


def today_factor(rows: pd.DataFrame, species: str, params: dict) -> np.ndarray:
    """Today's season factor (multiplier x gate) for these sightings, region by region."""
    out = np.full(len(rows), np.nan)
    for region, where in rows.groupby("region").groups.items():
        p = params[region].get(species)
        if p is None:
            continue
        frame = pd.DataFrame({"Date": pd.to_datetime(rows.loc[where, "date"]).reset_index(drop=True), "climate_zone": np.nan})
        out[rows.index.get_indexer(where)] = (sn.season_multiplier_for_species(frame, species, p, {})
                                              * sn.season_gate_for_species(frame, species, p, {}))
    return out


def shipped_factor(model, rows: pd.DataFrame, grids: dict) -> np.ndarray:
    """The learned season as production computes it: each sighting's cell, its week ratio
    blended between weeks, then the curve multiplier and the plant gate."""
    out = np.full(len(rows), np.nan)
    for box, region in (("EU", "NE"), ("US", "USE")):
        here = rows.index[rows["box"] == box]
        if not len(here):
            continue
        cells = rows.loc[here, ["cell_lat", "cell_lon"]].drop_duplicates()
        ratio = week_ratio(model, cells["cell_lat"].to_numpy(), cells["cell_lon"].to_numpy(), grids[region])
        at = pd.MultiIndex.from_frame(cells).get_indexer(pd.MultiIndex.from_frame(rows.loc[here, ["cell_lat", "cell_lon"]]))
        r = sn.blend_weeks(lambda week: ratio[at, week], rows.loc[here, "doy"].to_numpy())
        out[rows.index.get_indexer(here)] = sn.phenology_multiplier(r) * sn.phenology_gate(r)
    return out


def fit(train: pd.DataFrame, species: str) -> lgb.Booster:
    valid = train.sample(frac=0.15, random_state=291)
    rest = train.drop(valid.index)
    return lgb.train(PARAMS, lgb.Dataset(rest[CALENDAR], rest[species].astype(int)), 1000,
                     valid_sets=[lgb.Dataset(valid[CALENDAR], valid[species].astype(int))],
                     callbacks=[lgb.early_stopping(50, verbose=False)])


def dead_months(t: pd.DataFrame, species: str, grids: dict) -> list:
    """Region-band-months where the tags show under DEAD_MONTH of the band's peak per sighting,
    yet the learned season, fitted on every year, is on average at least OPEN at the sightings and
    opens more than today's factor there: a month today's months open as well is no reason to keep
    them (elderflower at 44-48 N in US West in May: learned 0.77, its months 1.0)."""
    g = t.assign(factor=shipped_factor(fit(t, species), t, grids), month=t["date"].dt.month,
                 band=(t["lat"] // BAND_DEGREES * BAND_DEGREES).astype(int)).groupby(["region", "band", "month"]).agg(
        n=(species, "size"), share=(species, "mean"), opened=("factor", "mean"), today=("today", "mean"))
    peak = g["share"].groupby(level=["region", "band"]).transform("max")
    stage = (g["n"] * g["share"]).groupby(level=["region", "band"]).transform("sum")
    dead = g[(stage >= BAND_MIN_STAGE) & (g["n"] >= 30) & (g["share"] < DEAD_MONTH * peak)
             & (g["opened"] >= OPEN) & (g["opened"] > g["today"])]
    return [f"{region}-{band}N-{month}" for region, band, month in dead.index]


def evaluate(s: pd.DataFrame, only=None) -> pd.DataFrame:
    from scipy.stats import binomtest
    from sklearn.metrics import roc_auc_score
    params = {r: get_species_params(r) for r in ("NE", "SE", "USE", "USW")}
    grids = {r: era5_normals.load(r) for r in ("NE", "USE")}
    results = []
    for species in [sp for sp in SEASON if not only or sp in only]:
        t = scope(s, species, params)
        t["today"] = today_factor(t, species, params)
        years = []
        for year in sorted(t["year"].unique()):
            test, train = t[t["year"] == year], t[t["year"] != year]
            if test[species].sum() < MIN_TEST or train[species].sum() < MIN_TEST:
                continue
            model = fit(train, species)
            years.append({"year": int(year), "today": roc_auc_score(test[species], test["today"]),
                          "learned": roc_auc_score(test[species], shipped_factor(model, test, grids))})
        y = pd.DataFrame(years)
        dead = dead_months(t, species, grids) if len(y) else []
        wins = int((y["learned"] > y["today"]).sum()) if len(y) else 0
        p = binomtest(wins, len(y), 0.5, alternative="greater").pvalue if len(y) else 1.0
        entry = {"species": species, "stage": STAGE[species], "stage_sightings": int(t[species].sum()),
                 "all_sightings": len(t), "years": len(y), "today": y["today"].mean() if len(y) else np.nan,
                 "learned": y["learned"].mean() if len(y) else np.nan, "wins": wins, "p": round(p, 4),
                 "dead_months_open": " ".join(dead)}
        entry["ships"] = bool(len(y) >= SHIP_MIN_YEARS and p < SHIP_P and entry["learned"] > entry["today"] and not dead)
        results.append(entry)
        print({k: (round(v, 3) if isinstance(v, float) else v) for k, v in entry.items()}, flush=True)
    return pd.DataFrame(results)


def shipping(result: pd.DataFrame) -> dict:
    """{continent: species} that ship there: better than today's months on the held-out years,
    no dead band-month open in that continent, not held back. A dead month belongs to a place:
    elderflower opens early at 44-48 N in US West in May and stays on its months there, not in Europe."""
    won = result[(result["years"] >= SHIP_MIN_YEARS) & (result["p"] < SHIP_P) & (result["learned"] > result["today"])]
    out = {}
    for continent, regions in (("EU", ("NE", "SE")), ("US", ("USE", "USW"))):
        out[continent] = sorted(
            r.species for r in won.itertuples()
            if r.species not in HELD_BACK and (r.species, continent) not in HELD_BACK_IN
            and not any(d.split("-")[0] in regions for d in str(r.dead_months_open if isinstance(r.dead_months_open, str) else "").split()))
    return out


def export(s: pd.DataFrame, result: pd.DataFrame) -> None:
    """Per continent one file on R2 (R2_FOLDER/<date>/phenology_<EU|US>.npz: the normals
    grid's lat/lon, the species, and each week's ratio x 254 as uint8, 255 off the grid)
    and backend/generated/phenology.json naming each with its sha256."""
    import hashlib
    import io
    fp.load_dotenv(ROOT / ".env")
    fp.load_dotenv(ROOT / ".env.secret")
    client, bucket = fp._r2_client(), fp.get_required_env("R2_BUCKET_NAME")
    folder = f"{R2_FOLDER}/{time.strftime('%Y%m%d-%H%M')}"
    params = {r: get_species_params(r) for r in ("NE", "SE", "USE", "USW")}
    ships = shipping(result)
    species = sorted(set(ships["EU"]) | set(ships["US"]))
    models = {sp: fit(scope(s, sp, params), sp) for sp in species}
    spec = {"features": CALENDAR, "weeks": sn.PHENOLOGY_WEEK_DOY.tolist(), "trained": f"2016-{s['year'].max()}",
            "shipped_if": f"ranks the species' stage sightings above all plant sightings better than today's season "
                          f"factor in more held-out years than chance (sign test p < {SHIP_P}, at least {SHIP_MIN_YEARS} years)",
            "continents": {}}
    for continent, region in (("EU", "NE"), ("US", "USE")):
        here = [sp for sp in ships[continent]
                if any(params[r].get(sp) for r in (("NE", "SE") if continent == "EU" else ("USE", "USW")))]
        grid = era5_normals.load(region)
        la, lo = np.meshgrid(grid["lat"], grid["lon"], indexing="ij")
        lats, lons = la.ravel(), lo.ravel()
        mapped = np.isfinite(calendar_rows(lats, lons, np.ones(len(lats)), grid)["norm_tmean_year"].to_numpy())
        weeks = len(sn.PHENOLOGY_WEEK_DOY)
        ratio = np.full((len(here), weeks, len(lats)), 255, np.uint8)
        for k, sp in enumerate(here):
            ratio[k][:, mapped] = np.rint(week_ratio(models[sp], lats[mapped], lons[mapped], grid).T * 254).astype(np.uint8)
        buffer = io.BytesIO()
        np.savez_compressed(buffer, lat=grid["lat"], lon=grid["lon"], species=np.array(here),
                            ratio=ratio.reshape(len(here), weeks, len(grid["lat"]), len(grid["lon"])))
        data = buffer.getvalue()
        key = f"{folder}/phenology_{continent}.npz"
        client.put_object(Bucket=bucket, Key=key, Body=data, ContentType="application/octet-stream")
        spec["continents"][continent] = {"file": key, "sha256": hashlib.sha256(data).hexdigest(), "species": here}
        print(f"uploaded {key}: {len(here)} species, {len(data) / 1e6:.1f} MB", flush=True)
    (ROOT / "backend" / "generated" / "phenology.json").write_text(json.dumps(spec, indent=1) + "\n", encoding="utf-8", newline="\n")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True, help="the plant training folder (iNaturalist downloads, table, results)")
    parser.add_argument("--download", action="store_true", help="fetch every plant's tagged sightings from iNaturalist")
    parser.add_argument("--export", action="store_true", help="upload the shipped species' grids, write generated/phenology.json")
    parser.add_argument("--reuse", action="store_true", help="read phenology_table.parquet and phenology_result.csv instead of building them")
    parser.add_argument("--only", help="test only these species (comma-separated) and write phenology_result_only.csv")
    args = parser.parse_args()
    out = Path(args.out)
    if args.download:
        download(out)
        return
    if args.reuse:
        s = pd.read_parquet(out / "phenology_table.parquet")
    else:
        s = table(out)
        s.to_parquet(out / "phenology_table.parquet", index=False)
    if args.only:
        result = evaluate(s, args.only.split(","))
        result.to_csv(out / "phenology_result_only.csv", index=False)
        print(result.round(3).to_string(index=False))
        return
    if args.reuse and (out / "phenology_result.csv").exists():
        result = pd.read_csv(out / "phenology_result.csv")
    else:
        result = evaluate(s)
        result.to_csv(out / "phenology_result.csv", index=False)
    pd.set_option("display.width", 220)
    print(result.round(3).to_string(index=False))
    if args.export:
        export(s, result)


if __name__ == "__main__":
    main()
