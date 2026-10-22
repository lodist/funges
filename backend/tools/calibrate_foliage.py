#!/usr/bin/env python3
"""Calibrate a peak fall-foliage forecast ("leaf peeping") for the US.

The fourth "spectacle" after cherry blossom (backend/bloom.py), bluebells and the
desert superbloom, fitted the same way: on NASA POWER daily mean temperature (MERRA-2
T2M), the source of the forecast's 1991-2020 normals, moved from POWER's grid
elevation to the median ground elevation of the observations (HydroSHEDS 3" DEM) at
bloom.LAPSE. A season runs from 1 July (index 0) to 31 December (index 183).

Observations: iNaturalist research-grade records of the colour trees (GENERA plus
Cornus florida; evergreen oaks out) in the US, August-December 2016-2026, carrying the
"Leaves" annotation (controlled term 36: 38 Green Leaves, 39 Colored Leaves, 40 No
Live Leaves). Per POWER grid cell (0.5 x 0.625 degrees) and year, the observed peak is
the median date of the colored-leaf records (MIN_COLORED at least); two alternatives
are scored beside it: the day the colored share of green + colored records crosses
50% (a logistic with one slope shared by all cell-years), and the middle of the
colored phase (that crossing and the colored -> bare one). Eastern hardwoods are the
records east of EAST_LON; the Rockies' golden aspens are Populus tremuloides west of
WEST_LON. 2026 is still running on the day the cache was filled (11 October): its
records are scored apart and never fitted on.

Independent series, never fitted on: PhenoCam deciduous-broadleaf (DB) cameras'
autumn transition dates (the 3-day gcc_90 "falling" spline: 50%, 25% and 10% of the
summer greenness left), and USA-NPN Nature's Notebook "Colored leaves" (phenophase
498) status records: per individual, the first day with at least 50% of its leaves
coloured, per site the median over its colour trees.

Model family (the requirement is always the median of the model's sum on the observed
day of the training cell-years, as for the earlier spectacles):

- cold degree-days: from a fixed start, each day adds BASE minus its mean, if
  positive; the peak is the day the sum reaches the requirement;
- Delpierre et al. (2009): from the day the photoperiod falls below Pstart, each day
  adds (BASE - T)^x * (P / Pstart)^y, or with (1 - P / Pstart)^y;
- a photoperiod-dependent requirement (as in Jeong & Medvigy 2014's day-length term):
  cold degree-days plus b * (12 h - P), so shorter days need less cold.

Tests, printed as tables:

1. Leave one year out (2016-2025).
2. Geographic transfer: fitted on New England + New York ("NE", north of 40.5 N and
   east of 80.5 W), tested on the Appalachians, the South-East, the Great Lakes and
   the Midwest, and back.
3. Baselines on the same folds: one fixed date, a latitude + elevation line, each
   cell's own median in its other years; year-to-year (within-cell anomalies) and
   place-to-place skill.
4. PhenoCam and NPN: with the iNaturalist requirement, and with their own (leave one
   year out); the same on each site's mean-year weather (what this year's weather
   adds); within-site year-to-year r; their own site medians as the baseline.
   PhenoCam's 25%-left day is the one closest to the iNaturalist median where both
   see the same cell, so it is the PhenoCam target in the grid's total.
5. Grid over the family (--grid prints every setting and writes grid.csv and
   grid_aspen.csv to the cache); the recommended model is the best total of the
   leave-one-year-out, transfer and PhenoCam (25%) errors, or the best plain
   cold-degree-day setting if it is within 0.5 days of that, as for bluebells.
6. The aspens: the eastern model and requirement as they are, the eastern model with
   their own requirement, and their own best setting; north (>= 40 N) <-> south.
7. A normal year (normals only) at well-known places, on production's 0.1-degree cells
   (base points' mean elevation from the master).
8. WeatherAPI (the master, September - 7 October 2026) against POWER at the cells.
9. Where to draw it (skipped with --no-where): the share of colored-leaf sightings
   within 0, 300 and 1,000 m of the wilderness polygons by NLCD class (41 deciduous,
   42 evergreen, 43 mixed), the named places, and the polygons and file size.

    python backend/tools/calibrate_foliage.py [--cache DIR] [--grid] [--model SPEC] [--estimator NAME]
        [--min-colored N] [--tmean t2m|minmax] [--no-lapse] [--strict-accuracy] [--no-where]
        [--no-master] [--master-use PARQUET] [--master-usw PARQUET]

--model reports one setting instead of the recommended one: "cdd,START,BASE",
"dp,PSTART,BASE,X,Y", "dpi,PSTART,BASE,X,Y" or "cddp,START,BASE,B" (START a season
index). --estimator picks the observed peak: median (default), t50 or middle.
--tmean minmax fits on (T2M_MAX + T2M_MIN) / 2 instead of T2M.

Requests, all cached and sequential: 261 iNaturalist pages (1.1 s apart,
Retry-After honoured), 610 POWER series (0.5 s apart), 4 PhenoCam ROI list pages
and 248 transition files (0.5 s apart), 55 NPN months (a whole autumn per request
times out), and the USE and USW masters from data.fung.es (or local copies; only their
base-point elevations and September - 7 October 2026 temperatures are kept). The DEM
and the wilderness polygons are read locally (the polygons from data.fung.es if
missing). A response is cached only once it is complete, so a failed one is fetched
again on the next run.

The run on 11 October 2026 recommends cold degree-days below 33 °C from 15 August:
1031 °C·days for the eastern hardwoods, 897 for the aspens (cells west of 102 W).
"""
import argparse
import gzip
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

_TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(_TOOLS.parent))
sys.path.insert(0, str(_TOOLS))
import bloom  # noqa: E402
import r2  # noqa: E402

ROOT = _TOOLS.parents[1]
APP = ROOT.parent  # app_operation: the local data next to the repo
DEM = APP / "US" / "Static Info" / "na_con_3s.tif"  # HydroSHEDS 3" DEM, conterminous US
WILDERNESS = {r: APP / "US" / r.upper() / f"{r.upper()}_wilderness_data.geojson" for r in ("use", "usw")}
WILDERNESS_URL = "https://data.fung.es/USA/{R}/{R}_wilderness_data.geojson"
MASTER_URL = "https://data.fung.es/USA/{R}/{R}_weather_data.parquet"
UA = {"User-Agent": "funges-calibrate-foliage/1.0 (+https://www.fung.es)"}

# ------------------------------------------------------------------ the model -------------
# What backend/foliage.py would hold: pure numpy over cells x days from 1 July.
FIRST = (7, 1)  # the season's arrays start on 1 July (index 0) ...
LAST = (12, 31)  # ... and end on 31 December (index 183)
N_DAYS = 184


def daylength(lat, n_days=N_DAYS):
    """Hours of daylight (sunrise to sunset of the sun's centre), points x days from 1 July."""
    doy = 182 + np.arange(n_days)  # 1 July is day 182 of a common year
    decl = np.radians(23.44) * np.sin(2 * np.pi * (284 + doy) / 365)
    x = -np.tan(np.radians(np.asarray(lat, float)))[:, None] * np.tan(decl)[None, :]
    return 24 / np.pi * np.arccos(np.clip(x, -1, 1))


def cold_sum(tmean, model, lat=None):
    """The model's running sum (points x days from 1 July), NaN before it starts counting."""
    kind, *p = model
    days = np.arange(tmean.shape[1])[None, :]
    if kind in ("cdd", "cddp"):
        start, base = int(p[0]), p[1]
        on = days >= start
        out = np.cumsum(np.where(on, np.maximum(base - tmean, 0.0), 0.0), axis=1)
        if kind == "cddp":
            out = out + p[2] * (12.0 - daylength(lat, tmean.shape[1]))
        return np.where(on, out, np.nan)
    pstart, base, x, y = p
    photo = daylength(lat, tmean.shape[1])
    on = photo < pstart
    g = photo / pstart if kind == "dp" else 1.0 - photo / pstart
    rate = np.maximum(base - tmean, 0.0) ** x * np.clip(g, 0.0, None) ** y
    out = np.cumsum(np.where(on, rate, 0.0), axis=1)
    return np.where(np.cumsum(on, axis=1) > 0, out, np.nan)


def predict(curve, requirement):
    """First index where the sum reaches the requirement (a number or one per row), NaN if never."""
    done = curve >= np.asarray(requirement, float).reshape(-1, 1)
    idx = done.argmax(axis=1).astype(float)
    idx[~done.any(axis=1)] = np.nan
    return idx


def at(curve, obs):
    i = np.clip(np.rint(obs).astype(int), 0, curve.shape[1] - 1)
    return curve[np.arange(len(curve)), i]


# ------------------------------------------------------------------ settings --------------
INAT_V2 = "https://api.inaturalist.org/v2/observations?"
FIELDS = ("id,observed_on,location,obscured,positional_accuracy,taxon.id,taxon.name,"
          "annotations.controlled_attribute_id,annotations.controlled_value_id,annotations.vote_score")
# Canopy trees whose colour makes the eastern and Rocky Mountain autumn (iNaturalist genus ids),
# and flowering dogwood (54777). Vines and shrubs that colour early (poison ivy, sumacs, Virginia
# creeper) and the larches stay out.
GENERA = {"Acer": 47727, "Quercus": 47851, "Betula": 49156, "Fagus": 49203, "Populus": 47566,
          "Liriodendron": 53580, "Nyssa": 54804, "Oxydendrum": 133355, "Sassafras": 54796, "Carya": 54788,
          "Fraxinus": 54806, "Hamamelis": 51971, "Liquidambar": 49661}
DOGWOOD = 54777  # Cornus florida
ASPEN = 54840  # Populus tremuloides
# Oaks that keep (most of) their leaves through the winter: their "green" records say nothing.
EVERGREEN = {"Quercus virginiana", "Quercus geminata", "Quercus hemisphaerica", "Quercus laurifolia",
             "Quercus myrtifolia", "Quercus chapmanii", "Quercus minima", "Quercus fusiformis",
             "Quercus agrifolia", "Quercus chrysolepis", "Quercus wislizeni", "Quercus berberidifolia",
             "Quercus dumosa", "Quercus john-tuckeri", "Quercus cornelius-mulleri", "Quercus palmeri",
             "Quercus turbinella", "Quercus emoryi", "Quercus arizonica", "Quercus oblongifolia",
             "Quercus hypoleucoides", "Quercus rugosa", "Quercus vacciniifolia", "Quercus parvula",
             "Quercus pacifica", "Quercus tomentella", "Quercus engelmannii", "Quercus ilex",
             "Quercus suber", "Quercus pungens", "Quercus vaseyana", "Quercus sinuata", "Quercus toumeyi",
             "Quercus inopina", "Quercus durata", "Quercus sadleriana", "Quercus grisea"}
YEARS = range(2016, 2027)
FIT_YEARS = range(2016, 2026)  # 2026 is still running
EAST_LON = -100.0  # eastern hardwoods: records east of this
WEST_LON = -102.0  # aspens: Populus tremuloides records west of this
WINDOW = (45, 167)  # 15 August - 15 December: the records an estimator looks at
MIN_COLORED = 6  # colored-leaf records a cell-year needs for a median date
MIN_LEAF = 10  # green + colored records a cell-year needs for the 50% crossing (>= 2 of each)
POWER = ("https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M,T2M_MAX,T2M_MIN&community=AG"
         "&longitude={lon}&latitude={lat}&start={start}&end={end}&format=JSON")
POWER_SPAN = (date(2007, 7, 1), date(2026, 10, 7))  # POWER's daily series ended on 7 October on 11 October 2026
PHENOCAM_ROIS = "https://phenocam.nau.edu/api/roilists/?format=json&limit=500&offset={}"
PHENOCAM_TD = "https://phenocam.nau.edu/data/archive/{site}/ROI/{roi}_3day_transition_dates.csv"
NPN = "https://services.usanpn.org/npn_portal/observations/getObservations.json?"
NPN_COLORED = 498  # "Colored leaves"
NPN_HALF = {"50-74%", "75-94%", "95% or more"}
NE_BOX = dict(lat=40.5, lon=-80.5)  # New England + New York (+ NJ, eastern PA): north and east of this

# Well-known places for the dry run; their published windows and sources are in the write-up.
PLACES = [
    ("Stowe, VT", 44.465, -72.685, "east"),
    ("North Conway, NH", 44.054, -71.128, "east"),
    ("Kancamagus Pass, NH", 44.012, -71.502, "east"),
    ("Acadia (Bar Harbor), ME", 44.350, -68.240, "east"),
    ("Berkshires (Lenox), MA", 42.356, -73.285, "east"),
    ("Adirondacks (Lake Placid), NY", 44.280, -73.980, "east"),
    ("Catskills (Hunter), NY", 42.205, -74.215, "east"),
    ("Blue Ridge Pkwy (Blowing Rock), NC", 36.132, -81.678, "east"),
    ("Blue Ridge Pkwy (Mt Pisgah), NC", 35.403, -82.751, "east"),
    ("Smokies (Newfound Gap), TN/NC", 35.611, -83.425, "east"),
    ("Smokies (Cades Cove), TN", 35.600, -83.810, "east"),
    ("Upper Peninsula (Porcupine Mts), MI", 46.760, -89.780, "east"),
    ("Upper Peninsula (Munising), MI", 46.411, -86.648, "east"),
    ("Door County (Fish Creek), WI", 45.128, -87.245, "east"),
    ("Ozarks (Buffalo River, Jasper), AR", 36.008, -93.186, "east"),
    ("Ozarks (Branson), MO", 36.644, -93.218, "east"),
    ("Maroon Bells, CO", 39.099, -106.941, "aspen"),
    ("Aspen, CO", 39.191, -106.818, "aspen"),
    ("Kenosha Pass, CO", 39.413, -105.758, "aspen"),
    ("Wasatch (Guardsman Pass), UT", 40.606, -111.555, "aspen"),
    ("Wasatch (Alpine Loop), UT", 40.437, -111.620, "aspen"),
]


# ------------------------------------------------------------------ fetching --------------

def fetch(url, path, valid=lambda body: True, pause=0.0, tries=7, missing_ok=False):
    """GET through a disk cache. Only a response that passes `valid` is written (via a
    temporary file), so a failed or partial one is fetched again next time. With
    `missing_ok`, a 404 is an answer (an empty body), cached as such."""
    if path.exists():
        return gzip.decompress(path.read_bytes())
    path.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(tries):
        wait = 5.0 * 2 ** attempt
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=300) as r:
                body = r.read() if r.status == 200 else b""
            if valid(body):
                tmp = path.with_suffix(".part")
                tmp.write_bytes(gzip.compress(body))
                tmp.replace(path)
                time.sleep(pause)
                return body
            print(f"  incomplete response, retrying: {url[:120]}", file=sys.stderr)
        except urllib.error.HTTPError as e:
            if e.code == 404 and missing_ok:
                tmp = path.with_suffix(".part")
                tmp.write_bytes(gzip.compress(b""))
                tmp.replace(path)
                time.sleep(pause)
                return b""
            ra = e.headers.get("Retry-After")
            wait = float(ra) if ra and ra.isdigit() else wait
            print(f"  HTTP {e.code}, waiting {wait:.0f} s: {url[:120]}", file=sys.stderr)
        except Exception as e:  # dropped connections, timeouts
            print(f"  {type(e).__name__}, waiting {wait:.0f} s: {url[:120]}", file=sys.stderr)
        time.sleep(wait)
    raise RuntimeError(f"failed after {tries} tries: {url}")


def fetch_json(url, path, check=lambda js: True, pause=0.0):
    def valid(body):
        try:
            return check(json.loads(body))
        except Exception:
            return False
    return json.loads(fetch(url, path, valid, pause))


def inat_pages(cache):
    """Every research-grade, leaf-annotated record of the colour trees in the US, August-December."""
    taxa = ",".join(str(t) for t in [*GENERA.values(), DOGWOOD])
    id_above = 0
    while True:
        q = {"taxon_id": taxa, "place_id": 1, "quality_grade": "research", "term_id": 36,
             "month": "8,9,10,11,12", "d1": f"{YEARS[0]}-01-01", "d2": f"{YEARS[-1]}-12-31",
             "per_page": 200, "order_by": "id", "order": "asc", "id_above": id_above, "fields": FIELDS}
        js = fetch_json(INAT_V2 + urllib.parse.urlencode(q), cache / "inat" / f"leaves_{id_above}.json.gz",
                        lambda j: "results" in j and "total_results" in j, pause=1.1)
        yield from js["results"]
        if len(js["results"]) < 200:
            break
        id_above = js["results"][-1]["id"]


def leaf_state(o):
    """'colored', 'bare', 'green', 'buds' or '' from the Leaves annotation (votes not against it)."""
    values = {a.get("controlled_value_id") for a in o.get("annotations") or []
              if a.get("controlled_attribute_id") == 36 and (a.get("vote_score") or 0) >= 0}
    return ("colored" if 39 in values else "bare" if 40 in values else "green" if 38 in values
            else "buds" if 37 in values else "")


def dem_at(lat, lon, cache):
    """HydroSHEDS ground elevation at each point, cached by its 0.001-degree position."""
    import rasterio

    store = cache / "elevation.json"
    found = json.loads(store.read_text()) if store.exists() else {}
    keys = [f"{a:.3f},{b:.3f}" for a, b in zip(np.asarray(lat, float), np.asarray(lon, float))]
    missing = sorted(set(keys) - set(found))
    if missing:
        with rasterio.open(DEM) as r:
            pts = [tuple(map(float, k.split(",")))[::-1] for k in missing]
            vals = [float(v[0]) for v in r.sample(pts)]
        found.update({k: (None if v == 32767 or v < -500 else v) for k, v in zip(missing, vals)})
        store.with_suffix(".part").write_text(json.dumps(found))
        store.with_suffix(".part").replace(store)
    return np.array([np.nan if found[k] is None else found[k] for k in keys], float)


def records(cache, strict_accuracy=False):
    """All leaf-annotated records as one table, with the season index (days from 1 July)."""
    rows = []
    for o in inat_pages(cache):
        if not o.get("location") or o.get("obscured") or not o.get("observed_on"):
            continue
        acc = o.get("positional_accuracy")
        if (acc is None and strict_accuracy) or (acc or 0) > 1000:
            continue
        taxon = o.get("taxon") or {}
        lat, lon = map(float, o["location"].split(","))
        rows.append((o["id"], o["observed_on"], lat, lon, taxon.get("id"), taxon.get("name") or "", leaf_state(o)))
    df = pd.DataFrame(rows, columns=["id", "date", "lat", "lon", "taxon", "name", "state"]).drop_duplicates("id")
    df["date"] = pd.to_datetime(df.date, errors="coerce")
    df = df.dropna(subset=["date"])
    df = df[df.state.isin(["green", "colored", "bare"]) & ~df.name.isin(EVERGREEN)
            & df.lat.between(24, 50) & df.lon.between(-125, -66)].reset_index(drop=True)
    df["genus"] = df.name.str.split().str[0]
    df["year"] = df.date.dt.year
    df["idx"] = (df.date - pd.to_datetime(df.year.astype(str) + "-07-01")).dt.days
    df["ground"] = dem_at(df.lat, df.lon, cache)
    return df


def power(lat, lon, cache):
    """POWER daily T2M, T2M_MAX and T2M_MIN (NaN where missing) and the grid cell's elevation."""
    start, end = POWER_SPAN
    n = (end - start).days + 1
    js = fetch_json(POWER.format(lat=lat, lon=lon, start=f"{start:%Y%m%d}", end=f"{end:%Y%m%d}"),
                    cache / "power" / f"{lat}_{lon}.json.gz",
                    lambda j: all(len(j["properties"]["parameter"][k]) == n for k in ("T2M", "T2M_MAX", "T2M_MIN")),
                    pause=0.5)
    p = js["properties"]["parameter"]
    df = pd.DataFrame({k: pd.Series(p[k], dtype=float) for k in ("T2M", "T2M_MAX", "T2M_MIN")})
    df.index = pd.to_datetime(df.index, format="%Y%m%d")
    return df.where(df > -900).interpolate(limit=5, limit_area="inside"), float(js["geometry"]["coordinates"][2])


def power_cell(lat, lon):
    """The POWER grid point (0.5 x 0.625 degrees) nearest each point."""
    return ((np.round(np.asarray(lat, float) / 0.5) * 0.5).round(3),
            (np.round(np.asarray(lon, float) / 0.625) * 0.625).round(4))


def phenocam_rois(cache):
    """Every PhenoCam ROI list entry, through the API's pages."""
    out, offset = [], 0
    while True:
        js = fetch_json(PHENOCAM_ROIS.format(offset), cache / "phenocam" / f"rois_{offset}.json.gz",
                        lambda j: "results" in j, pause=0.5)
        out += js["results"]
        if not js.get("next"):
            return pd.DataFrame(out)
        offset += 500


def phenocam(cache):
    """Autumn transition dates (gcc_90, falling) of the US deciduous-broadleaf ROIs, one row per
    site and year: the median over the site's DB ROIs of each threshold's season index."""
    import io

    rois = phenocam_rois(cache)
    rois = rois[(rois.roitype == "DB") & rois.lat.between(24, 50) & rois.lon.between(-125, -66)]
    rows = []
    for r in rois.itertuples():
        body = fetch(PHENOCAM_TD.format(site=r.site, roi=r.roi_name),
                     cache / "phenocam" / f"td_{r.roi_name}.csv.gz",
                     lambda b: b"transition_50" in b, pause=0.5,
                     missing_ok=True)
        if not body:
            continue
        td = pd.read_csv(io.BytesIO(body), comment="#")
        td = td[(td.direction == "falling") & (td.gcc_value == "gcc_90")]
        for x in td.itertuples():
            d = {k: pd.Timestamp(getattr(x, k)) for k in ("transition_50", "transition_25", "transition_10")}
            year = d["transition_50"].year
            first = pd.Timestamp(year, 7, 1)
            rows.append(dict(site=r.site, roi=r.roi_name, lat=r.lat, lon=r.lon, year=year,
                             amplitude=x.max_gcc - x.min_gcc,
                             **{f"t{k[11:]}": (v - first).days for k, v in d.items()}))
    pc = pd.DataFrame(rows)
    # One autumn per ROI and year: the largest falling transition whose 50% day is in the season,
    # not a summer drought's browning or a spring frost.
    pc = pc[pc.t50.between(*WINDOW)].sort_values("amplitude").groupby(["roi", "year"]).tail(1)
    pc = pc.groupby(["site", "year"], as_index=False).agg(lat=("lat", "first"), lon=("lon", "first"),
                                                          t50=("t50", "median"), t25=("t25", "median"),
                                                          t10=("t10", "median"), rois=("roi", "size"))
    pc["ground"] = dem_at(pc.lat, pc.lon, cache)
    return pc.reset_index(drop=True)


def npn(cache):
    """Nature's Notebook "Colored leaves" of the colour trees: per individual and year, the first
    day reported with >= 50% of its leaves coloured; per site and year, the median of those."""
    rows = []
    keep = ["site_id", "latitude", "longitude", "genus", "species", "individual_id", "observation_date",
            "phenophase_status", "intensity_value"]
    for year in YEARS:
        for month in range(8, 13):  # a month per request: a whole autumn times out
            end = (date(year, month, 28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
            q = [("request_src", "funges_foliage_calibration"), ("start_date", f"{year}-{month:02d}-01"),
                 ("end_date", f"{end:%Y-%m-%d}"), ("phenophase_id[]", str(NPN_COLORED))]
            js = fetch_json(NPN + urllib.parse.urlencode(q), cache / "npn" / f"colored_{year}_{month:02d}.json.gz",
                            lambda j: isinstance(j, list), pause=2.0)
            rows += [{k: o.get(k) for k in keep} for o in js
                     if o.get("genus") in GENERA or (o.get("genus"), o.get("species")) == ("Cornus", "florida")]
    df = pd.DataFrame(rows)
    df["date"] = pd.to_datetime(df.observation_date)
    df["year"] = df.date.dt.year
    df["idx"] = (df.date - pd.to_datetime(df.year.astype(str) + "-07-01")).dt.days
    df["half"] = (df.phenophase_status == 1) & df.intensity_value.isin(NPN_HALF)
    half = df[df.half]
    ind = half.groupby(["site_id", "individual_id", "year"], as_index=False).agg(
        idx=("idx", "min"), lat=("latitude", "first"), lon=("longitude", "first"), genus=("genus", "first"))
    # The tree was seen under 50% within the two weeks before, so the day is known to two weeks.
    before = df[~df.half & df.phenophase_status.isin([0, 1])][["individual_id", "year", "idx"]]
    j = ind.merge(before, on=["individual_id", "year"], suffixes=("", "_before"))
    j = j[(j.idx_before < j.idx) & (j.idx_before >= j.idx - 14)]
    ind = ind[ind.set_index(["individual_id", "year"]).index.isin(j.set_index(["individual_id", "year"]).index)]
    site = ind.groupby(["site_id", "year"], as_index=False).agg(
        lat=("lat", "first"), lon=("lon", "first"), obs=("idx", "median"), trees=("idx", "size"))
    site = site[site.obs.between(*WINDOW) & site.lat.between(24, 50) & site.lon.between(-125, -66)]
    site["ground"] = dem_at(site.lat, site.lon, cache)
    return site.reset_index(drop=True)


def master(region, cache, local=None):
    """The region's master (a local copy, or downloaded once into the cache)."""
    if local:
        return Path(local)
    path = cache / "master" / f"{region.upper()}_weather_data.parquet"
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        name, _ = bloom._local_master(MASTER_URL.format(R=region.upper()))
        import pyarrow.parquet as pq

        pq.ParquetFile(name).metadata  # a truncated file fails here, before it is kept
        Path(name).replace(path)
    return path


def forests(region, cache):
    """The region's wilderness polygons of NLCD classes 41, 42 and 43 (raster_val), cached as GeoParquet."""
    import geopandas as gpd
    import pyogrio

    path = cache / "ground" / f"{region}_forest.parquet"
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        src = WILDERNESS[region]
        if not src.exists():
            src = cache / "ground" / src.name
            if not src.exists():
                name, _ = bloom._local_master(WILDERNESS_URL.format(R=region.upper()))
                Path(name).replace(src)
        df = pyogrio.read_dataframe(src, where="raster_val IN (41, 42, 43)")
        df = gpd.GeoDataFrame({"nlcd": df.raster_val.astype("int16").to_numpy()}, geometry=df.geometry.values,
                              crs="EPSG:4326")
        df.to_parquet(path.with_suffix(".part"), compression="zstd")
        path.with_suffix(".part").replace(path)
    return gpd.read_parquet(path)


# ------------------------------------------------------------------ observed peaks --------

SLOPES = np.arange(3.0, 21.0, 2.0)


def crossing(groups, rounds=3):
    """Per group (an array of season indices, an array of booleans: past the transition), the
    day the share crosses 50% under a logistic with one slope shared by all groups.
    Returns the days and the slope (days)."""
    grid = np.arange(20.0, 200.0, 0.5)
    slope = 7.0
    for _ in range(rounds):
        days = []
        for d, y in groups:
            z = (d[None, :] - grid[:, None]) / slope
            ll = np.where(y[None, :], -np.logaddexp(0, -z), -np.logaddexp(0, z)).sum(axis=1)
            days.append(grid[ll.argmax()])
        total = np.zeros(len(SLOPES))
        for k, s in enumerate(SLOPES):
            for (d, y), t in zip(groups, days):
                z = (d - t) / s
                total[k] += np.where(y, -np.logaddexp(0, -z), -np.logaddexp(0, z)).sum()
        slope = float(SLOPES[total.argmax()])
    return np.array(days), slope


def observed(df, min_colored=MIN_COLORED, min_leaf=MIN_LEAF):
    """One row per POWER cell and year: the three observed peaks (NaN where there are too few
    records), the record counts and the records' median ground elevation."""
    df = df[df.idx.between(*WINDOW)]
    clat, clon = power_cell(df.lat, df.lon)
    df = df.assign(clat=clat, clon=clon)
    rows, gc_groups, gc_keys, cb_groups, cb_keys = [], [], [], [], []
    for key, g in df.groupby(["clat", "clon", "year"]):
        col = g[g.state == "colored"].idx.to_numpy(float)
        gc = g[g.state.isin(["green", "colored"])]
        cb = g[g.state.isin(["colored", "bare"])]
        rows.append(dict(lat=key[0], lon=key[1], year=key[2], n=len(g), colored=len(col),
                         green=int((g.state == "green").sum()), bare=int((g.state == "bare").sum()),
                         median=float(np.median(col)) if len(col) >= min_colored else np.nan,
                         weekday=float(np.median(g[(g.state == "colored") & (g.date.dt.dayofweek < 5)].idx))
                         if ((g.state == "colored") & (g.date.dt.dayofweek < 5)).sum() >= min_colored else np.nan,
                         ground=float(np.nanmedian(g.ground)) if g.ground.notna().any() else np.nan,
                         weekend=float(g.date.dt.dayofweek.ge(5).mean())))
        if len(gc) >= min_leaf and min(len(col), len(gc) - len(col)) >= 2:
            gc_groups.append((gc.idx.to_numpy(float), (gc.state == "colored").to_numpy()))
            gc_keys.append(key)
        if len(cb) >= min_leaf and min(len(col), len(cb) - len(col)) >= 2:
            cb_groups.append((cb.idx.to_numpy(float), (cb.state == "bare").to_numpy()))
            cb_keys.append(key)
    c = pd.DataFrame(rows).set_index(["lat", "lon", "year"])
    c["t50"], c["cb50"] = np.nan, np.nan
    slopes = {}
    if gc_groups:
        t, slopes["green -> colored"] = crossing(gc_groups)
        c.loc[gc_keys, "t50"] = t
    if cb_groups:
        t, slopes["colored -> bare"] = crossing(cb_groups)
        c.loc[cb_keys, "cb50"] = t
    c["middle"] = (c.t50 + c.cb50) / 2
    return c.reset_index(), slopes


def group_of(lat, lon):
    """NE: New England + New York (north of 40.5 N, east of 80.5 W); else the Appalachians, the
    South-East, the Great Lakes and the Midwest ("rest")."""
    return np.where((np.asarray(lat) > NE_BOX["lat"]) & (np.asarray(lon) > NE_BOX["lon"]), "NE", "rest")


def load_normals():
    return dict(np.load(r2.generated(ROOT / "backend" / "generated" / "bloom_normals_US.npz")))


def series(lat, lon, years, ground, cache, kind="t2m", lapse=True, normals=None):
    """Daily means 1 July - 31 December (one row per year) at the POWER cell, moved to `ground`.
    Days POWER does not have yet (2026 after 7 October) are the 1991-2020 normals."""
    df, elev = power(lat, lon, cache)
    t = df.T2M if kind == "t2m" else (df.T2M_MAX + df.T2M_MIN) / 2
    ground = np.where(np.isfinite(ground), ground, elev)
    out = []
    for y, z in zip(years, ground):
        a = t.reindex(pd.date_range(f"{y}-07-01", f"{y}-12-31")).to_numpy()
        if np.isnan(a).any():
            normals = normals or load_normals()
            fill = bloom.daily_normals(normals, [lat], [lon], [elev], date(y, 7, 1), N_DAYS)[0]
            a = np.where(np.isfinite(a), a, fill)
        out.append(a + (bloom.LAPSE * (elev - z) if lapse else 0.0))
    return np.array(out), elev


def temperatures(c, cache, kind="t2m", lapse=True, keys=("lat", "lon")):
    """The series of each row of `c` (POWER cell `keys`, year, ground) and its cell's POWER elevation."""
    t = np.full((len(c), N_DAYS), np.nan)
    elev = np.full(len(c), np.nan)
    normals = load_normals()
    for (lat, lon), g in c.groupby(list(keys)):
        t[g.index], elev[g.index] = series(lat, lon, g.year, g.ground.to_numpy(), cache, kind, lapse, normals)
    return t, elev


# ------------------------------------------------------------------ tests -----------------

def folds(c, kind):
    """(train, test) mask pairs: leave one year out, or NE <-> the rest."""
    if kind == "loyo":
        return [((c.year != y).to_numpy(), (c.year == y).to_numpy()) for y in sorted(c.year.unique())]
    ne = (c.group == "NE").to_numpy()
    return [(ne, ~ne), (~ne, ne)]


def evaluate(c, curve, kind):
    """Errors (predicted - observed, days) of the model and the baselines over the folds."""
    obs = c.obs.to_numpy()
    f_at = at(curve, obs)
    err = {k: np.full(len(c), np.nan) for k in ("model", "fixed", "line")}
    req = []
    X = np.column_stack([c.lat, c.ground.fillna(c.ground.median()), np.ones(len(c))])
    for train, test in folds(c, kind):
        f = np.nanmedian(f_at[train])
        req.append(f)
        err["model"][test] = predict(curve[test], f) - obs[test]
        err["fixed"][test] = np.median(obs[train]) - obs[test]
        coef = np.linalg.lstsq(X[train], obs[train], rcond=None)[0]
        err["line"][test] = X[test] @ coef - obs[test]
    return err, req


def own_median(c, key=("lat", "lon")):
    """Each row's error if it took its cell's (site's) median day in the other years (NaN if none)."""
    out = np.full(len(c), np.nan)
    for _, g in c.groupby(list(key)):
        for i in g.index:
            other = g.obs[g.year != g.year[i]]
            if len(other):
                out[i] = other.median() - g.obs[i]
    return out


def skill(c, pred, key=("lat", "lon")):
    """In-sample year-to-year (within-cell anomalies, cells with >= 3 years) and place-to-place
    (cell means) skill: r, and the slope of observed on predicted."""
    d = c.assign(pred=pred, key=c[list(key)].astype(str).agg(",".join, axis=1))
    d = d[np.isfinite(d.pred)]
    cm = d.groupby("key")[["obs", "pred"]].mean()
    d = d[d.key.map(d.key.value_counts()) >= 3]
    if len(d) < 10 or len(cm) < 5:
        return dict(anom_r=np.nan, anom_slope=np.nan, anom_mae=np.nan, anom_zero=np.nan, anom_n=len(d),
                    space_r=np.nan, space_slope=np.nan)
    oa, pa = d.obs - d.groupby("key").obs.transform("mean"), d.pred - d.groupby("key").pred.transform("mean")
    return dict(anom_r=np.corrcoef(oa, pa)[0, 1], anom_slope=np.polyfit(pa, oa, 1)[0] if pa.std() > 0 else np.nan,
                anom_mae=float(np.mean(np.abs(oa - pa))), anom_zero=float(np.mean(np.abs(oa))), anom_n=len(d),
                space_r=np.corrcoef(cm.pred, cm.obs)[0, 1], space_slope=np.polyfit(cm.pred, cm.obs, 1)[0])


def mae(e, mask=None):
    e = e if mask is None else e[mask]
    return float(np.nanmean(np.abs(e))), int(np.isnan(e).sum())


def site_temperatures(s, cache, kind="t2m", lapse=True):
    """POWER series for independent site-years (lat, lon, year, ground)."""
    clat, clon = power_cell(s.lat, s.lon)
    return temperatures(s.assign(plat=clat, plon=clon), cache, kind, lapse, ("plat", "plon"))[0]


def independent(s, t, model, f_inat):
    """A site series' errors: with the iNaturalist requirement, with its own requirement fitted
    leaving the year out, its own fixed date (leave one year out) and each site's own median in
    its other years; and the within-site year-to-year skill on its own requirement."""
    cv = cold_sum(t, model, s.lat.to_numpy())
    obs = s.obs.to_numpy()
    f_at = at(cv, obs)
    e_inat = predict(cv, f_inat) - obs
    # The same model on each site's mean year (its own years' temperatures averaged): what is
    # left when this year's weather is taken away.
    mean_year = pd.DataFrame(t).groupby(s.site.to_numpy()).transform("mean").to_numpy()
    cm = cold_sum(mean_year, model, s.lat.to_numpy())
    cm_at = at(cm, obs)
    e_own, e_fixed, e_clim = (np.full(len(s), np.nan) for _ in range(3))
    for y in s.year.unique():
        k = (s.year == y).to_numpy()
        e_own[k] = predict(cv[k], np.nanmedian(f_at[~k])) - obs[k]
        e_clim[k] = predict(cm[k], np.nanmedian(cm_at[~k])) - obs[k]
        e_fixed[k] = np.median(obs[~k]) - obs[k]
    return dict(inat=e_inat, own=e_own, fixed=e_fixed, clim=e_clim, site=own_median(s, ("site",)),
                skill=skill(s, obs + e_own, ("site",)), req=float(np.nanmedian(f_at)))


# ------------------------------------------------------------------ report ----------------

def table(header, rows):
    print("| " + " | ".join(header) + " |")
    print("|" + "|".join("---" for _ in header) + "|")
    for r in rows:
        print("| " + " | ".join(str(x) for x in r) + " |")
    print()


def day_name(idx):
    """Season index -> '7 Oct'."""
    if idx is None or not np.isfinite(idx):
        return "none"
    d = date(2025, 7, 1) + timedelta(days=int(round(idx)))
    return f"{d.day} {d:%b}"


def model_name(m):
    kind, *p = m
    if kind == "cdd":
        return f"cold degree-days below {p[1]:g} °C from {day_name(p[0])}"
    if kind == "cddp":
        return f"cold degree-days below {p[1]:g} °C from {day_name(p[0])} + {p[2]:g} x (12 h - day length)"
    g = "P/Pstart" if kind == "dp" else "1 - P/Pstart"
    if p[3] == 0:
        return f"cold degree-days below {p[1]:g} °C from day length < {p[0]:g} h"
    return f"Delpierre: from day length < {p[0]:g} h, ({p[1]:g} °C - T)^{p[2]:g} x ({g})^{p[3]:g}"


def parse_model(spec):
    kind, *p = spec.split(",")
    return (kind, *[float(x) for x in p])


def model_grid():
    grid = [("cdd", s, b) for s in (0, 14, 31, 45, 62, 76) for b in (15, 17, 19, 20, 21, 22, 23, 25, 27, 30, 33, 36)]
    grid += [("cddp", s, b, k) for s in (31, 62) for b in (17, 20, 23, 25) for k in (10, 25, 50, 100, 150, 200)]
    grid += [("dp", p, b, 1, 0) for p in (13.0, 13.5, 14.0, 14.5, 15.0) for b in (17, 20, 23, 25)]
    grid += [(kind, p, b, x, y) for kind in ("dp", "dpi") for p in (13.0, 13.5, 14.0, 14.5, 15.0)
             for b in (17, 20, 23, 25) for x in (1, 2) for y in (1, 2)]
    return grid


# ------------------------------------------------------------------ production's cells ----

COMPARE = (date(2026, 9, 1), date(2026, 10, 7))  # WeatherAPI days POWER also has


def master_summary(region, cache, local=None):
    """From the region's master: production's 0.1-degree cells (base points' mean elevation),
    and WeatherAPI's daily (Tmax + Tmin) / 2 and base-point elevation per POWER cell over COMPARE."""
    import pyarrow.parquet as pq

    cells_path = cache / "master" / f"{region}_cells.parquet"
    wapi_path = cache / "master" / f"{region}_wapi.parquet"
    if not (cells_path.exists() and wapi_path.exists()):
        pf = pq.ParquetFile(master(region, cache, local))
        pts, days = [], []
        for rg in range(pf.num_row_groups):
            df = pf.read_row_group(rg, columns=bloom._COLS).to_pandas()
            pts.append(df[["Latitude", "Longitude", "Elevation (m)"]].drop_duplicates())
            df["Date"] = pd.to_datetime(df.Date).dt.normalize()
            df = df[df.Date.between(pd.Timestamp(COMPARE[0]), pd.Timestamp(COMPARE[1]))]
            df["t"] = (df["Temperature (C) Max"] + df["Temperature (C) Min"]) / 2
            df["plat"], df["plon"] = power_cell(df.Latitude, df.Longitude)
            days.append(df.groupby(["plat", "plon", "Date"]).agg(t=("t", "sum"), z=("Elevation (m)", "sum"),
                                                                  n=("t", "size")))
        pts = pd.concat(pts).drop_duplicates()
        pts["cy"], pts["cx"] = np.rint(pts.Latitude / bloom.CELL).astype(int), np.rint(pts.Longitude / bloom.CELL).astype(int)
        pts.groupby(["cy", "cx"])["Elevation (m)"].mean().rename("elev").reset_index().to_parquet(cells_path)
        w = pd.concat(days).groupby(level=[0, 1, 2]).sum()
        w = w.assign(t=w.t / w.n, z=w.z / w.n).reset_index()
        w.to_parquet(wapi_path)
    return pd.read_parquet(cells_path), pd.read_parquet(wapi_path)


def wapi_offset(cells, cache, wapi):
    """WeatherAPI minus POWER (both (Tmax + Tmin) / 2, and against POWER's T2M), WeatherAPI moved to
    POWER's grid elevation, per POWER cell over COMPARE: DataFrame lat, lon, d_minmax, d_t2m, r, days."""
    rows = []
    for lat, lon in cells:
        w = wapi[(wapi.plat == lat) & (wapi.plon == lon)].set_index("Date")
        if len(w) < 20:
            continue
        p, elev = power(lat, lon, cache)
        j = w.join(p, how="inner")
        tw = j.t + bloom.LAPSE * (j.z - elev)
        rows.append(dict(lat=lat, lon=lon, d_minmax=float((tw - (j.T2M_MAX + j.T2M_MIN) / 2).mean()),
                         d_t2m=float((tw - j.T2M).mean()), r=float(np.corrcoef(tw, j.T2M)[0, 1]), days=len(j)))
    return pd.DataFrame(rows)


def cell_elevation(prod, lat, lon, cache):
    """Production's 0.1-degree cell elevation at each place (the DEM where no base point is)."""
    cy, cx = np.rint(np.asarray(lat) / bloom.CELL).astype(int), np.rint(np.asarray(lon) / bloom.CELL).astype(int)
    e = prod.set_index(["cy", "cx"]).elev.reindex(list(zip(cy, cx))).to_numpy()
    return np.where(np.isfinite(e), e, dem_at(lat, lon, cache))


# ------------------------------------------------------------------ where to draw ---------

def where(east_col, aspen_col, cache, model, f_east, f_aspen, prod):
    """Distance of the colored-leaf sightings to the wilderness forests, by NLCD class."""
    import geopandas as gpd
    import shapely

    print("# Where to draw it\n")
    woods = pd.concat([forests("use", cache).assign(region="use"), forests("usw", cache).assign(region="usw")],
                      ignore_index=True)
    woods = gpd.GeoDataFrame(woods, crs="EPSG:4326")
    # The two regions' files overlap (USW reaches 81.7 W between 35 and 40 N): a polygon in both counts once.
    key = pd.Series(shapely.to_wkb(shapely.set_precision(woods.geometry.values, 1e-5)))
    twice = key.duplicated().to_numpy()
    print(f"Wilderness forest polygons (NLCD 41, 42, 43): USE {int((woods.region == 'use').sum())}, USW "
          f"{int((woods.region == 'usw').sum())}; in both files: {int(twice.sum())}, counted once.\n")
    woods = woods[~twice].reset_index(drop=True)
    albers = woods.to_crs(5070)
    sets = {"east": east_col, "aspen": aspen_col}
    hits = {}
    for name, s in sets.items():
        pts = gpd.GeoSeries(gpd.points_from_xy(s.lon, s.lat), crs=4326).to_crs(5070).values
        for cls in (41, 42, 43):
            tree = shapely.STRtree(albers.geometry.values[(albers.nlcd == cls).to_numpy()])
            for d in (0, 300, 1000):
                if d:
                    i = tree.query(pts, predicate="dwithin", distance=d)[0]
                else:
                    i = tree.query(pts, predicate="intersects")[0]
                hit = np.zeros(len(pts), bool)
                hit[np.unique(i)] = True
                hits[name, cls, d] = hit
    rows = []
    for name, s in sets.items():
        for label, classes in (("41 deciduous", (41,)), ("43 mixed", (43,)), ("42 evergreen", (42,)),
                               ("41 + 43", (41, 43)), ("41 + 42 + 43", (41, 42, 43))):
            rows.append([name, label, len(s)] + [f"{np.mean(np.any([hits[name, k, d] for k in classes], axis=0)):.1%}"
                                                 for d in (0, 300, 1000)])
    table(["sightings", "classes", "colored-leaf records", "inside", "within 300 m", "within 1 km"], rows)

    # West of WEST_LON, the aspens' heights against the deciduous and mixed polygons' (their middle's).
    dm = woods[woods.nlcd.isin([41, 43])].geometry.representative_point()
    westside = woods.nlcd.isin([41, 43]).to_numpy().copy()
    westside[westside] = dm.x.to_numpy() < WEST_LON
    west = albers[westside].reset_index(drop=True)
    mid = woods[westside].geometry.representative_point()
    z = dem_at(mid.y.round(3), mid.x.round(3), cache)
    pts = gpd.GeoSeries(gpd.points_from_xy(aspen_col.lon, aspen_col.lat), crs=4326).to_crs(5070).values
    rows = []
    for floor in (0, 1200, 1500, 1800, 2100):
        keep = np.nan_to_num(z) >= floor
        tree = shapely.STRtree(west.geometry.values[keep])
        near = np.zeros(len(pts), bool)
        near[np.unique(tree.query(pts, predicate="dwithin", distance=300)[0])] = True
        pac = mid.x.to_numpy() < -121
        rows.append((f">= {floor} m", f"{(aspen_col.ground >= floor).mean():.1%}", f"{near.mean():.1%}",
                     int(keep.sum()), int((keep & pac).sum())))
    table([f"west of {WEST_LON:g}: 41 + 43 polygons whose middle is at", "aspen sightings at that height",
           "aspen sightings within 300 m of a kept polygon", "polygons kept", "of them west of 121 W"], rows)
    return woods, westside, z


def ground_files(woods, westside, z_west, cache, floor):
    """The recommended ground (41 + 43; west of WEST_LON only where the polygon's middle is at
    `floor` or higher), written to the cache, not the repo, to measure it: as it is, and
    simplified to 0.0005 degrees on a 0.0001-degree grid."""
    import geopandas as gpd
    import shapely

    east = woods[woods.nlcd.isin([41, 43]).to_numpy() & ~westside]
    west = woods[westside][np.nan_to_num(z_west) >= floor]
    out = {}
    for name, g in (("east", east), ("west", west), ("US", pd.concat([east, west]))):
        path = cache / "ground" / f"foliage_woods_{name}.parquet"
        gpd.GeoDataFrame(geometry=g.geometry.values, crs="EPSG:4326").to_parquet(path, compression="zstd")
        small = shapely.set_precision(shapely.simplify(g.geometry.values, 0.0005, preserve_topology=True), 1e-4)
        gpd.GeoDataFrame(geometry=small, crs="EPSG:4326").to_parquet(path.with_suffix(".small.parquet"),
                                                                     compression="zstd")
        out[name] = (len(g), path.stat().st_size / 1e6, path.with_suffix(".small.parquet").stat().st_size / 1e6,
                     g.to_crs(5070).area.sum() / 1e6)
    return out


# ------------------------------------------------------------------ main ------------------

def score(c, t, m, ind, cost_on="phenocam"):
    """One setting's numbers: leave-one-year-out and transfer MAE, the independent series on their
    own requirement, the requirement on all cell-years and the in-sample skill."""
    lat = c.lat.to_numpy()
    cv = cold_sum(t, m, lat)
    e_l, _ = evaluate(c, cv, "loyo")
    e_t, _ = evaluate(c, cv, "transfer")
    f_all = float(np.nanmedian(at(cv, c.obs.to_numpy())))
    out = dict(model=m, loyo=mae(e_l["model"])[0], loyo_none=mae(e_l["model"])[1], transfer=mae(e_t["model"])[0],
               transfer_none=mae(e_t["model"])[1], requirement=f_all, **skill(c, predict(cv, f_all)))
    for name, (s, st) in ind.items():
        r = independent(s, st, m, f_all)
        out[f"{name}_own"], out[f"{name}_inat"] = mae(r["own"])[0], mae(r["inat"])[0]
        out[f"{name}_bias"], out[f"{name}_r"] = float(np.nanmean(r["inat"])), r["skill"]["anom_r"]
    out["cost"] = (out["loyo"] + out["transfer"] + out[f"{cost_on}_own"]
                   + 30 * (out["loyo_none"] + out["transfer_none"]) / len(c))
    return out


def line_of(r, ind_names):
    return ([model_name(r["model"]), f"{r['loyo']:.2f}", f"{r['transfer']:.2f}"]
            + [f"{r[f'{n}_own']:.2f}" for n in ind_names]
            + [f"{r['cost']:.2f}", r["loyo_none"] + r["transfer_none"], f"{r['requirement']:.0f}",
               f"{r['anom_r']:.2f}", f"{r['space_slope']:.2f}"])


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cache", type=Path, default=Path.home() / ".cache" / "funges-foliage")
    ap.add_argument("--grid", action="store_true")
    ap.add_argument("--model", help="report this setting instead of the recommended one (see above)")
    ap.add_argument("--estimator", choices=("median", "t50", "middle"), default="median")
    ap.add_argument("--min-colored", type=int, default=MIN_COLORED)
    ap.add_argument("--tmean", choices=("t2m", "minmax"), default="t2m")
    ap.add_argument("--no-lapse", action="store_true", help="keep POWER at its grid elevation")
    ap.add_argument("--strict-accuracy", action="store_true")
    ap.add_argument("--no-where", action="store_true")
    ap.add_argument("--no-master", action="store_true", help="skip the WeatherAPI check and production's cells")
    ap.add_argument("--master-use", help="a local USE master parquet instead of data.fung.es")
    ap.add_argument("--master-usw", help="a local USW master parquet instead of data.fung.es")
    args = ap.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    lapse = not args.no_lapse
    pd.set_option("display.width", 200)

    # --- records and observed peaks ---
    rec = records(args.cache, args.strict_accuracy)
    east = rec[rec.lon > EAST_LON]
    aspen = rec[(rec.taxon == ASPEN) & (rec.lon < WEST_LON)]
    print(f"# Records: {len(rec)} research-grade, leaf-annotated records of the colour trees, US, August-December "
          f"2016-2026, not obscured, coordinates good to 1 km{'' if args.strict_accuracy else ' or unknown'}, "
          f"evergreen oaks out; east of {EAST_LON:g}: {len(east)}; aspens west of {WEST_LON:g}: {len(aspen)}\n")
    table(["year", "east: green", "colored", "bare", "aspens west: green", "colored", "bare"],
          [(y, *[int(((d.year == y) & (d.state == k)).sum()) for d in (east, aspen) for k in ("green", "colored", "bare")])
           for y in YEARS])
    table(["genus (east)", "records", "colored", "median colored date (all years)"],
          [(g, len(d), int((d.state == "colored").sum()), day_name(d[d.state == "colored"].idx.median()))
           for g, d in sorted(east.groupby("genus"), key=lambda x: -len(x[1]))[:12]])
    col = east[east.state == "colored"]
    dow = col.date.dt.dayofweek.value_counts(normalize=True).sort_index()
    print(f"Colored-leaf records by weekday (Mon..Sun): {', '.join(f'{x:.1%}' for x in dow)} "
          f"(an even spread is 14.3%); weekend share {col.date.dt.dayofweek.ge(5).mean():.1%}.\n")

    ce, slopes = observed(east, args.min_colored)
    ca, slopes_a = observed(aspen, args.min_colored)
    print(f"Shared logistic slopes (days): east {', '.join(f'{k} {v:g}' for k, v in slopes.items())}; "
          f"aspens {', '.join(f'{k} {v:g}' for k, v in slopes_a.items())}\n")
    fit = ce[ce.year.isin(FIT_YEARS)]
    rows = []
    for k in ("median", "weekday", "t50", "middle"):
        ok = fit[k].notna() & fit["median"].notna()
        d = fit[ok]
        rows.append((k, int(fit[k].notna().sum()), f"{(d[k] - d['median']).mean():+.1f}" if len(d) else "-",
                     f"{np.corrcoef(d[k], d['median'])[0, 1]:.2f}" if len(d) > 2 else "-"))
    print("## The observed peak: estimators on the eastern cell-years 2016-2025\n")
    table(["estimator", "cell-years", "minus the median date (mean, days)", "r with the median date"], rows)
    # Split-half reliability of the median: two random halves of each cell-year's colored records.
    rng = np.random.default_rng(0)
    w = east[east.idx.between(*WINDOW) & (east.state == "colored") & east.year.isin(FIT_YEARS)]
    w = w.assign(plat=power_cell(w.lat, w.lon)[0], plon=power_cell(w.lat, w.lon)[1],
                 half=rng.integers(0, 2, len(w)))
    h = w.groupby(["plat", "plon", "year", "half"]).idx.agg(["median", "size"]).unstack("half")
    h = h[(h["size"] >= args.min_colored / 2).all(axis=1)]
    print(f"Split-half reliability of the median date (cell-years with >= {args.min_colored / 2:g} colored records "
          f"in each random half, n = {len(h)}): r = {np.corrcoef(h['median'][0], h['median'][1])[0, 1]:.2f}, "
          f"mean absolute difference {np.mean(np.abs(h['median'][0] - h['median'][1])):.1f} d\n")

    c = ce[ce[args.estimator].notna()].assign(obs=lambda d: d[args.estimator]).reset_index(drop=True)
    c["group"] = group_of(c.lat, c.lon)
    t, pelev = temperatures(c, args.cache, args.tmean, lapse)
    c["elev"] = pelev
    c["ground"] = c.ground.fillna(c.elev)
    now = (c.year == 2026).to_numpy()
    c26, t26 = c[now].reset_index(drop=True), t[now]
    c, t = c[~now].reset_index(drop=True), t[~now]
    dz = c.ground - c.elev
    print(f"Cell-years ({args.estimator}, >= {args.min_colored} colored records): {len(c)} in "
          f"{c[['lat', 'lon']].drop_duplicates().shape[0]} cells, 2016-2025 (NE {int((c.group == 'NE').sum())}, "
          f"rest {int((c.group == 'rest').sum())}); 2026 so far: {len(c26)}. Records' median ground minus POWER's "
          f"grid elevation: median {np.median(dz):+.0f} m, 10-90% {np.percentile(dz, 10):+.0f} to "
          f"{np.percentile(dz, 90):+.0f} m; {'moved' if lapse else 'not moved'} at 6.5 °C/km.\n")
    table(["year", "cell-years", "median observed peak"],
          [(y, len(g), day_name(g.obs.median())) for y, g in c.groupby("year")])

    # --- independent series ---
    pc = phenocam(args.cache)
    pc = pc[(pc.lon > EAST_LON) & pc.year.isin(FIT_YEARS)].reset_index(drop=True)
    pct = site_temperatures(pc, args.cache, args.tmean, lapse)
    nn = npn(args.cache).rename(columns={"site_id": "site"})
    nn = nn[(nn.lon > EAST_LON) & nn.year.isin(FIT_YEARS)].reset_index(drop=True)
    nnt = site_temperatures(nn, args.cache, args.tmean, lapse)
    # PhenoCam's 25%-left day is the closest to iNaturalist's median where both see a cell (section 4).
    ind = {"phenocam": (pc.assign(obs=pc.t25), pct), "npn": (nn, nnt)}
    print(f"PhenoCam: {len(pc)} site-years at {pc.site.nunique()} DB sites east of {EAST_LON:g}, 2008-2025. "
          f"NPN: {len(nn)} site-years at {nn.site.nunique()} sites, {int(nn.trees.sum())} tree-years.\n")

    # --- the grid ---
    grid = model_grid()
    s = pd.DataFrame([score(c, t, m, ind) for m in grid])
    s["kind"] = s.model.str[0]
    s["simple"] = s.model.map(lambda m: m[0] == "cdd")
    best = s.loc[s.cost.idxmin()]
    best_cdd = s[s.simple].loc[s[s.simple].cost.idxmin()]
    m = best_cdd.model if best_cdd.cost <= best.cost + 0.5 else best.model
    if args.model:
        m = parse_model(args.model)
    names = list(ind)
    head = (["model", "LOYO", "transfer"] + [f"{n} (own req.)" for n in names]
            + ["total", "no peak", "requirement", "year-to-year r", "spatial slope"])
    cdd = s[s.kind == "cdd"].assign(start=s.model.str[1], base=s.model.str[2])
    for col_, title in (("loyo", "leave-one-year-out MAE"), ("transfer", "geographic transfer MAE"),
                        ("phenocam_own", "PhenoCam MAE, own requirement, leave one year out"),
                        ("phenocam_r", "PhenoCam within-site year-to-year r"), ("anom_r", "iNaturalist year-to-year r")):
        print(f"## 5. Cold degree-days: {title}, by start and base\n")
        piv = cdd.pivot(index="start", columns="base", values=col_)
        table(["start"] + [f"{b:g} °C" for b in piv.columns],
              [[day_name(i)] + [f"{v:.2f}" for v in r] for i, r in piv.iterrows()])
    for kind, title in (("cdd", "cold degree-days"), ("cddp", "cold degree-days + day-length term"),
                        ("dp", "Delpierre, (P/Pstart)^y"), ("dpi", "Delpierre, (1 - P/Pstart)^y")):
        print(f"## 5. Best settings: {title}\n")
        table(head, [line_of(r, names) for _, r in s[s.kind == kind].sort_values("cost").head(5 if not args.grid else 99).iterrows()])
    near = s[s.cost <= best.cost + 0.5]
    print(f"{len(near)} settings within 0.5 days of the best total ({best.cost:.2f}); plain cold degree-days among "
          f"them: {int(near.simple.sum())}\n")
    if args.grid:
        s.sort_values("cost").to_csv(args.cache / "grid.csv", index=False)

    # --- the recommended model ---
    print(f"# {'Chosen with --model' if args.model else 'Recommended'}: {model_name(m)}\n")
    lat = c.lat.to_numpy()
    cv = cold_sum(t, m, lat)
    f_all = float(np.nanmedian(at(cv, c.obs.to_numpy())))
    pred = predict(cv, f_all)
    sk = skill(c, pred)
    print(f"Requirement on all {len(c)} cell-years: {f_all:.1f} °C·days. In-sample MAE "
          f"{mae(pred - c.obs.to_numpy())[0]:.2f} d (bias {np.nanmean(pred - c.obs.to_numpy()):+.1f}).\n")
    print(f"Year to year, {sk['anom_n']} cell-years in cells with >= 3 years: r = {sk['anom_r']:.2f}, slope of observed "
          f"on predicted {sk['anom_slope']:.2f}, anomaly MAE {sk['anom_mae']:.2f} d against {sk['anom_zero']:.2f} d for "
          f"'a normal year'. Place to place (cell means): r = {sk['space_r']:.2f}, slope {sk['space_slope']:.2f}.\n")
    reg = np.select([c.group == "NE", c.lon < -90, c.lat < 37.5], ["NE", "MW / plains", "South"], "Mid-Atlantic + Lakes")
    table(["region (in-sample)", "cell-years", "bias, predicted - observed (d)", "MAE (d)"],
          [(k, len(g), f"{g.mean():+.1f}", f"{g.abs().mean():.1f}")
           for k, g in pd.Series(pred - c.obs.to_numpy()).groupby(reg)])

    # 1. leave one year out
    e, req = evaluate(c, cv, "loyo")
    clim = own_median(c)
    rows = []
    for i, y in enumerate(sorted(c.year.unique())):
        k = (c.year == y).to_numpy()
        rows.append((y, int(k.sum()), f"{req[i]:.0f}", *(f"{mae(e[x], k)[0]:.1f}" for x in e),
                     f"{np.nanmean(e['model'][k]):+.1f}"))
    rows.append(("all", len(c), f"{np.median(req):.0f}", *(f"**{mae(e[x])[0]:.2f}**" for x in e),
                 f"{np.nanmean(e['model']):+.1f}"))
    print("## 1. Leave one year out (MAE, days)\n")
    table(["held-out year", "cell-years", "requirement", "model", "fixed date", "latitude + elevation line",
           "model bias"], rows)
    has = np.isfinite(clim)
    print(f"Cell-years whose cell has other years: {int(has.sum())}. On those: model {mae(e['model'], has)[0]:.2f}, "
          f"the cell's own median in its other years {mae(clim, has)[0]:.2f}, fixed date {mae(e['fixed'], has)[0]:.2f}, "
          f"line {mae(e['line'], has)[0]:.2f} d; without a peak: {mae(e['model'])[1]}\n")
    yr = c.assign(pred=e["model"] + c.obs).groupby("year")[["obs", "pred"]].mean()
    print(f"Year means, observed vs predicted (LOYO): r = {np.corrcoef(yr.obs, yr.pred)[0, 1]:.2f}, observed SD "
          f"{yr.obs.std():.1f} d, predicted {yr.pred.std():.1f} d\n")
    big = (c.colored >= 20).to_numpy()
    print(f"Cell-years with >= 20 colored records ({int(big.sum())}): model {mae(e['model'], big)[0]:.2f}, fixed "
          f"{mae(e['fixed'], big)[0]:.2f}, line {mae(e['line'], big)[0]:.2f}, own median "
          f"{mae(clim, big & has)[0]:.2f} (on {int((big & has).sum())}) d\n")

    # 2. transfer
    e, req = evaluate(c, cv, "transfer")
    ne = (c.group == "NE").to_numpy()
    print("## 2. Geographic transfer (MAE, days)\n")
    table(["fitted on", "tested on", "cell-years", "requirement", "model", "fixed date", "line", "model bias"],
          [("NE (New England + NY)", "the rest", int((~ne).sum()), f"{req[0]:.0f}",
            *(f"{mae(e[x], ~ne)[0]:.2f}" for x in e), f"{np.nanmean(e['model'][~ne]):+.1f}"),
           ("the rest", "NE (New England + NY)", int(ne.sum()), f"{req[1]:.0f}",
            *(f"{mae(e[x], ne)[0]:.2f}" for x in e), f"{np.nanmean(e['model'][ne]):+.1f}")])

    # 4. the independent series
    print("## 4. Independent series (MAE, days)\n")
    rows = []
    for name, (sv, st) in (("PhenoCam 50% green-down (t50)", (pc.assign(obs=pc.t50), pct)),
                           ("PhenoCam 25% left (t25)", (pc.assign(obs=pc.t25), pct)),
                           ("PhenoCam 10% left (t10)", (pc.assign(obs=pc.t10), pct)),
                           ("NPN >= 50% coloured", (nn, nnt))):
        r = independent(sv, st, m, f_all)
        rows.append((name, len(sv), f"{mae(r['inat'])[0]:.2f} ({np.nanmean(r['inat']):+.1f})",
                     f"{mae(r['own'])[0]:.2f}", f"{mae(r['clim'])[0]:.2f}", f"{r['req']:.0f}", f"{mae(r['fixed'])[0]:.2f}",
                     f"{mae(r['site'])[0]:.2f}", f"{mae(r['own'], np.isfinite(r['site']))[0]:.2f}",
                     f"{r['skill']['anom_r']:.2f} (n {r['skill']['anom_n']})", f"{r['skill']['space_r']:.2f}"))
    table(["series", "site-years", "iNat requirement (bias)", "own requirement, LOYO",
           "the same on each site's mean-year weather", "own requirement",
           "own fixed date, LOYO", "site's own median, other years", "model on those", "year-to-year r",
           "place-to-place r"], rows)
    # PhenoCam vs iNaturalist where both see the same cell and year.
    pcc = pc.assign(lat=power_cell(pc.lat, pc.lon)[0], lon=power_cell(pc.lat, pc.lon)[1])
    pcm = pcc.groupby(["lat", "lon", "year"])[["t50", "t25", "t10"]].median().add_prefix("pc_").reset_index()
    j = c.merge(pcm, on=["lat", "lon", "year"])
    if len(j) >= 5:
        print(f"Same POWER cell and year in iNaturalist and PhenoCam: {len(j)}. iNaturalist's {args.estimator} minus "
              + ", ".join(f"{k} {np.mean(j.obs - j['pc_' + k]):+.1f} d (r {np.corrcoef(j.obs, j['pc_' + k])[0, 1]:.2f})"
                          for k in ("t50", "t25", "t10")) + "\n")

    # 2026 so far
    if len(c26):
        p26 = predict(cold_sum(t26, m, c26.lat.to_numpy()), f_all)
        print(f"## 2026 so far (records to 10 October; POWER to 7 October, normals after)\n\n{len(c26)} cell-years "
              f"with >= {args.min_colored} colored records: predicted (median) {day_name(np.nanmedian(p26))}, "
              f"records so far {day_name(c26.obs.median())}; predicted minus observed "
              + ", ".join(f"{x:+.0f}" for x in p26 - c26.obs.to_numpy()) + " d.\n")

    # --- 6. the aspens ---
    a = ca[ca[args.estimator].notna()].assign(obs=lambda d: d[args.estimator]).reset_index(drop=True)
    a = a[a.year.isin(FIT_YEARS)].reset_index(drop=True)
    a["group"] = np.where(a.lat >= 40, "NE", "rest")  # transfer: north (WY, MT, ID, n UT) <-> south (CO, s UT, NM, AZ)
    if len(a) >= 10:
        at_, aelev = temperatures(a, args.cache, args.tmean, lapse)
        a["elev"], a["ground"] = aelev, a.ground.fillna(pd.Series(aelev))
        acv = cold_sum(at_, m, a.lat.to_numpy())
        print(f"## 6. Aspens (Populus tremuloides west of {WEST_LON:g}): {len(a)} cell-years in "
              f"{a[['lat', 'lon']].drop_duplicates().shape[0]} cells, median ground {a.ground.median():.0f} m\n")
        rows = []
        e_e = predict(acv, f_all) - a.obs.to_numpy()
        rows.append(("the eastern model and requirement", f"{mae(e_e)[0]:.2f}", f"{np.nanmean(e_e):+.1f}", f"{f_all:.0f}"))
        e, req = evaluate(a, acv, "loyo")
        rows.append(("the eastern model, own requirement (LOYO)", f"{mae(e['model'])[0]:.2f}",
                     f"{np.nanmean(e['model']):+.1f}", f"{np.median(req):.0f}"))
        rows.append(("fixed date (LOYO)", f"{mae(e['fixed'])[0]:.2f}", "", ""))
        rows.append(("latitude + elevation line (LOYO)", f"{mae(e['line'])[0]:.2f}", "", ""))
        cl = own_median(a)
        rows.append(("cell's own median, other years", f"{mae(cl)[0]:.2f} (on {int(np.isfinite(cl).sum())})", "",
                     f"model on those {mae(e['model'], np.isfinite(cl))[0]:.2f}"))
        res = []
        for mm in grid:
            cvv = cold_sum(at_, mm, a.lat.to_numpy())
            el, rq = evaluate(a, cvv, "loyo")
            et, _ = evaluate(a, cvv, "transfer")
            res.append((mm, mae(el["model"])[0], mae(et["model"])[0], mae(el["model"])[1], float(np.median(rq))))
        res = pd.DataFrame(res, columns=["model", "loyo", "transfer", "none", "req"])
        res["cost"] = res.loyo + res.transfer + 30 * res.none / len(a)
        ab = res.loc[res.cost.idxmin()]
        rows.append((f"own best: {model_name(ab.model)} (LOYO; transfer {ab.transfer:.2f})", f"{ab.loyo:.2f}", "",
                     f"{ab.req:.0f}"))
        abc = res[res.model.str[0] == "cdd"].loc[res[res.model.str[0] == "cdd"].cost.idxmin()]
        rows.append((f"own best cold degree-days: {model_name(abc.model)} (LOYO; transfer {abc.transfer:.2f})",
                     f"{abc.loyo:.2f}", "", f"{abc.req:.0f}"))
        table(["aspens", "MAE (d)", "bias", "requirement"], rows)
        ska = skill(a, predict(acv, np.median(req)))
        print(f"Aspens, the eastern model on their own requirement: year-to-year r = {ska['anom_r']:.2f} "
              f"(n {ska['anom_n']}), place-to-place r = {ska['space_r']:.2f}. North (>= 40 N) <-> south transfer "
              f"{mae(evaluate(a, acv, 'transfer')[0]['model'])[0]:.2f} d.\n")
        f_aspen = float(np.median(req))
        if args.grid:
            res.sort_values("cost").to_csv(args.cache / "grid_aspen.csv", index=False)
    else:
        f_aspen = f_all

    # --- 7. the normal year at well-known places, and 8. WeatherAPI ---
    normals = load_normals()
    if args.no_master:
        return
    prod = {}
    wapi = {}
    for r, local in (("use", args.master_use), ("usw", args.master_usw)):
        prod[r], wapi[r] = master_summary(r, args.cache, local)
    rows = []
    for name, la, lo, kind in PLACES:
        here = (int(np.rint(la / bloom.CELL)), int(np.rint(lo / bloom.CELL)))
        r = "use" if here in set(zip(prod["use"].cy, prod["use"].cx)) else "usw"
        ze = cell_elevation(prod[r], [la], [lo], args.cache)[0]
        clat, clon = np.rint(la / bloom.CELL) * bloom.CELL, np.rint(lo / bloom.CELL) * bloom.CELL
        nt = bloom.daily_normals(normals, [clat], [clon], [ze], date(2026, 7, 1), N_DAYS)
        pe = predict(cold_sum(nt, m, [clat]), f_all)[0]
        pa = predict(cold_sum(nt, m, [clat]), f_aspen)[0]
        rows.append((name, r.upper(), f"{dem_at([la], [lo], args.cache)[0]:.0f} m", f"{ze:.0f} m", day_name(pe),
                     day_name(pa) if kind == "aspen" else ""))
    print("## 7. A normal year (1991-2020 normals only) at well-known places, on production's 0.1° cells\n")
    table(["place", "region", "site elevation", "cell elevation", "predicted peak (eastern requirement)",
           "aspen requirement"], rows)

    # the normal year over production's cells: how far into the season, and where it never peaks
    allc = pd.concat([prod["use"].assign(region="use"), prod["usw"].assign(region="usw")], ignore_index=True)
    shared = allc.duplicated(["cy", "cx"], keep=False)
    print(f"Production's 0.1° cells: USE {int((allc.region == 'use').sum())}, USW {int((allc.region == 'usw').sum())}, "
          f"in both {int(shared.sum() // 2)} (both regions would draw the layer there).\n")
    nt = bloom.daily_normals(normals, allc.cy * bloom.CELL, allc.cx * bloom.CELL, allc.elev.to_numpy(),
                             date(2026, 7, 1), N_DAYS)
    req_cell = np.where(allc.cx * bloom.CELL < WEST_LON, f_aspen, f_all)  # the aspens' requirement west of 102 W
    allc["peak"] = predict(cold_sum(nt, m, (allc.cy * bloom.CELL).to_numpy()), req_cell)
    rows = []
    for r, g in allc.groupby("region"):
        p = g.peak
        rows.append((r.upper(), len(g), day_name(p.quantile(0.01)), day_name(p.quantile(0.5)), day_name(p.quantile(0.99)),
                     f"{p.isna().mean():.1%}", f"{(p > (date(2026, 11, 30) - date(2026, 7, 1)).days).mean():.1%}",
                     f"{(p > (date(2026, 12, 15) - date(2026, 7, 1)).days).mean():.1%}"))
    print("## A normal year over production's 0.1° cells (the aspens' requirement west of 102 W)\n")
    table(["region", "cells", "1st percentile", "median", "99th percentile", "no peak by 31 Dec",
           "after 30 Nov", "after 15 Dec"], rows)
    look = allc.drop_duplicates(["cy", "cx"]).set_index(["cy", "cx"]).peak
    for name, d in (("east", east), ("aspens", aspen)):
        d = d[d.state == "colored"]
        p = look.reindex(list(zip(np.rint(d.lat / bloom.CELL).astype(int), np.rint(d.lon / bloom.CELL).astype(int))))
        p = p.to_numpy()
        q = p[np.isfinite(p)]
        print(f"Colored-leaf sightings ({name}, {len(d)}) whose 0.1° cell peaks in a normal year ({len(q)}; the "
              f"rest have no cell or no peak by 31 Dec): after 15 Nov "
              f"{np.mean(q > (date(2026, 11, 15) - date(2026, 7, 1)).days):.1%}, after 30 Nov "
              f"{np.mean(q > (date(2026, 11, 30) - date(2026, 7, 1)).days):.1%}, after 15 Dec "
              f"{np.mean(q > (date(2026, 12, 15) - date(2026, 7, 1)).days):.1%}\n")
    print(f"The observed peaks: 1st-99th percentile {day_name(np.percentile(c.obs, 1))} - "
          f"{day_name(np.percentile(c.obs, 99))} (east), {day_name(np.percentile(a.obs, 1)) if len(a) else '-'} - "
          f"{day_name(np.percentile(a.obs, 99)) if len(a) else '-'} (aspens); latest {day_name(c.obs.max())}.\n")

    # WeatherAPI minus POWER at the cells
    rows = []
    shift = {}
    for name, cc, r, tt, cvf in (("east", c, "use", t, f_all), ("aspens", a, "usw", at_ if len(a) >= 10 else None, f_aspen)):
        cells = sorted(set(zip(cc.lat, cc.lon)))
        both = pd.concat([wapi["use"], wapi["usw"]]).assign(t=lambda d: d.t * d.n, z=lambda d: d.z * d.n)
        both = both.groupby(["plat", "plon", "Date"])[["t", "z", "n"]].sum()
        both = both.assign(t=both.t / both.n, z=both.z / both.n).reset_index()
        off = wapi_offset(cells, args.cache, both)
        if not len(off):
            continue
        d = off.d_t2m.median() if args.tmean == "t2m" else off.d_minmax.median()
        if tt is not None:
            base_cv = cold_sum(tt, m, cc.lat.to_numpy())
            moved = predict(cold_sum(tt + d, m, cc.lat.to_numpy()), cvf) - predict(base_cv, cvf)
            shift[name] = float(np.nanmean(moved))
        rows.append((name, len(off), f"{off.d_t2m.median():+.2f}", f"{off.d_minmax.median():+.2f}",
                     f"{off.d_t2m.quantile(0.1):+.2f} to {off.d_t2m.quantile(0.9):+.2f}", f"{off.r.median():.2f}",
                     f"{shift.get(name, np.nan):+.1f}"))
    print(f"## 8. WeatherAPI (the master's (Tmax + Tmin) / 2, moved to POWER's grid elevation) minus POWER, "
          f"{COMPARE[0]:%d %b} - {COMPARE[1]:%d %b %Y}\n")
    table(["cells", "POWER cells", "minus T2M (median)", "minus (T2M_MAX + T2M_MIN) / 2", "T2M, 10-90% of cells",
           "daily r", "peak moves if uncorrected (d)"], rows)

    if args.no_where:
        return
    ecol = east[east.state == "colored"]
    acol = aspen[aspen.state == "colored"]
    woods, westside, z_west = where(ecol, acol, args.cache, m, f_all, f_aspen, prod)
    import geopandas as gpd

    rows = []
    for name, la, lo, kind in PLACES:
        g = woods[woods.nlcd.isin([41, 43])].cx[lo - 0.05:lo + 0.05, la - 0.05:la + 0.05]
        here = gpd.GeoSeries(gpd.points_from_xy([lo], [la]), crs=4326).to_crs(5070).iloc[0]
        dist = g.to_crs(5070).distance(here).min() if len(g) else np.nan
        km2 = g.to_crs(5070).area.sum() / 1e6 if len(g) else 0.0
        rows.append((name, len(g), f"{km2:.1f}", f"{dist:.0f} m" if np.isfinite(dist) else "> 5 km"))
    table(["place", "41 + 43 polygons within 0.05°", "their area (km²)", "nearest"], rows)
    out = ground_files(woods, westside, z_west, args.cache, floor=1500)
    table(["ground (41 + 43; west of 102 W from 1,500 m)", "polygons", "GeoParquet (MB, zstd)",
           "simplified to 0.0005° (MB)", "area (km²)"],
          [(r, n, f"{mb:.1f}", f"{sm:.1f}", f"{km:,.0f}") for r, (n, mb, sm, km) in out.items()])


if __name__ == "__main__":
    main()
