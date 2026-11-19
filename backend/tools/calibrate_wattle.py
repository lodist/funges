#!/usr/bin/env python3
"""Calibrate a peak-bloom forecast for wattle (Australia) and its northern twin, mimosa.

Two "spectacles" of one layer, fitted as heather's is (backend/tools/calibrate_heather.py,
whose helpers this imports): on NASA POWER daily mean temperature (MERRA-2 T2M), the
source of the forecast's 1991-2020 normals. Wattle is golden wattle (Acacia pycnantha,
iNaturalist 75253) and silver wattle (Acacia dealbata, 53343) in Australia south of 28 S,
flowering July-September; mimosa is silver wattle in southern Europe (lat 34-50, lon -10
to 15: Portugal, Spain, France, Italy, Switzerland) and California, flowering
January-March. The observed peak is the median date of iNaturalist records (wild and
cultivated alike: both taxa are planted widely) per POWER grid cell (0.5 x 0.625 degrees)
and bloom year, for cells with at least MIN_RECORDS records. The bloom year of the south is
the calendar year (a season from 1 January, index 0); of the north it is the year of its
January (a season from 1 October of the year before, index 0). Each cell-year's series is
moved from POWER's grid elevation to the median ground elevation of its records (Copernicus
90 m through Open-Meteo, at 0.02 degrees), and cells under MIN_LAND land are dropped.

The records: both taxa flower for weeks, and iNaturalist's flowering annotation is thin
(about 7% of the records), so the default set is the plain records of a window around the
usual peak (Jul-Sep south, Dec-Apr north) not annotated as budding, fruiting or without
flowers. Plain records are also seen when the plants flower, so a median of them follows
the bloom, but a window pulls every median toward its own middle: the proxy tables compare
the sets (annotated flowering, 15 Jul-15 Sep / 15 Jan-15 Mar, the window, the wide window
Jun-Oct / Nov-May) with the annotated median, and the sensitivity table reruns the best
models on each set, on research-grade records only and on wild records only.

Models, per analysis (Australia; Europe; California; Europe + California pooled):
  fixed date          the median observed peak of the training cell-years (the baseline);
  shift               heather's: a normal-year date d0 (one date, or a line in latitude and
                      elevation) moved by k times this year's lead, the days this year's
                      degree-days above BASE since START reach the sum the normal year
                      (1991-2020) has by d0 (ch.fit and ch.apply);
  dd                  degree-days above BASE since START reach a requirement F (the median
                      forcing on the observed day of the training cell-years);
  chill               the same, counted from the day the number of days with a mean below
                      BELOW since START reaches DAYS, as for cherry.
Scores are mean absolute error in days: leave one year out, and a geographic transfer
(Australia: Victoria, South Australia, Tasmania, Western Australia against New South Wales
and the ACT, and Victoria against South Australia; Europe: Iberia against France, Italy
and Switzerland; both pooled: Europe against California; every analysis: the northern half
of its cell-years against the southern), both directions. The total is LOYO + the mean
transfer + 30 days for each cell-year without a peak.

A grid of about 250 settings has a best one that looks better than it is, so a model
replaces the fixed date only if it gains MARGIN days on the total and a paired bootstrap
over the held-out years puts its leave-one-year-out gain above zero. The grid's choice is
also scored inside the leave-one-year-out ("nested"): each held-out year gets the setting
that was best over the other years.

    python backend/tools/calibrate_wattle.py [--cache DIR] [--normals DIR] [--only NAMES]
        [--set SET] [--min-records N] [--tmaxmin] [--no-lapse] [--keep-sea] [--grid]
        [--quality research] [--wild]

--set: `std` (default: the window), `narrow`, `wide` or `flowering`. --only: analyses to run,
from AU, AU-golden, AU-silver, EU, CA, EUCA. --normals: where bloom_normals_EU.npz and
_US.npz are (default: backend/generated, from R2); the Australian normals are
fetched from POWER's climatology the way build_bloom_normals.py does and kept in the cache.

Requests, all cached and sequential: about 120 iNaturalist pages (v2, 1 s apart,
Retry-After honoured), about 150 POWER series (2013-2026), a few hundred Open-Meteo
elevation points, 10 POWER climatology boxes, Natural Earth map units and states.
"""
import argparse
import sys
import time
import urllib.parse
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

_TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(_TOOLS.parent))
sys.path.insert(0, str(_TOOLS))
import bloom  # noqa: E402
import calibrate_bluebell as cb  # noqa: E402  (fetching, map units, elevations)
import calibrate_heather as ch  # noqa: E402  (POWER, the shift model's fit, tables)

ROOT = _TOOLS.parents[1]
cb.UA = {"User-Agent": "funges-calibrate-wattle/1.0 (+https://www.fung.es)"}
INAT = ch.INAT
INAT_FIELDS = ch.INAT_FIELDS + ",quality_grade,captive"
PYC, DEAL = 75253, 53343  # Acacia pycnantha, Acacia dealbata (iNaturalist)
TAXON_NAME = {PYC: "Acacia pycnantha", DEAL: "Acacia dealbata"}
AUSTRALIA, CALIFORNIA = 6744, 14  # iNaturalist places
EUROPE_BOX = dict(nelat=50, nelng=15, swlat=34, swlng=-10)
D1, D2 = "2013-10-01", "2026-10-31"
YEARS = range(2014, 2027)
MIN_RECORDS = 8
MIN_FLOWERING = 5  # annotated records a cell-year needs for the proxy tables
NO_PEAK = 30.0  # days of error charged to a cell-year the model gives no peak
MARGIN = 0.5  # days of total a model must gain on the fixed date to replace it
MIN_LAND = 0.5
SOUTH_LIMIT = -28.0  # Australia: records south of 28 S, the app's temperate area
POWER_SPAN = (date(2013, 10, 1), date(2026, 11, 10))  # POWER's last complete day was 14 November
ch.POWER_SPAN = POWER_SPAN  # ch.power fetches this span (cached by cell in this script's own cache)
LAPSE = bloom.LAPSE
# Southern Europe's countries (Natural Earth map units: mainland Portugal is PRX, metropolitan France FXX);
# Morocco, Algeria, Croatia and Slovenia fall in the box too and stay out.
EU_UNITS = {"PRX", "ESP", "FXX", "ITA", "CHE", "MCO"}
IBERIA = {"PRX", "ESP"}
# Natural Earth's state codes: VI Victoria, SA, TS Tasmania, WA; the other half of the Australian transfer
# is NS New South Wales, CT the ACT.
EAST = {"NS", "CT", "QL"}

# A window is (first, last) as month * 100 + day, wrapping the new year where first > last.
# `wide` is what is fetched; `std` is the default; `narrow` is centred on the usual peak.
MACROS = {
    "AU": dict(label="Australia", query=dict(place_id=AUSTRALIA), months=(6, 7, 8, 9, 10), n_days=304,
               origin=date(2027, 1, 1), taxa={"golden": PYC, "silver": DEAL},
               windows=dict(wide=(601, 1031), std=(701, 930), narrow=(715, 915))),
    "EU": dict(label="Europe", query=EUROPE_BOX, months=(11, 12, 1, 2, 3, 4, 5), n_days=212,
               origin=date(2026, 10, 1), taxa={"silver": DEAL},
               windows=dict(wide=(1101, 531), std=(1201, 430), narrow=(115, 315))),
    "CA": dict(label="California", query=dict(place_id=CALIFORNIA), months=(11, 12, 1, 2, 3, 4, 5), n_days=212,
               origin=date(2026, 10, 1), taxa={"silver": DEAL},
               windows=dict(wide=(1101, 531), std=(1201, 430), narrow=(115, 315))),
}
SOUTH = {"AU"}

# name -> (analysis label, macros, taxa, normals of each macro, places for the dry run)
ANALYSES = {
    "AU": ("Australia: golden + silver wattle", ("AU",), ("golden", "silver")),
    "AU-golden": ("Australia: golden wattle", ("AU",), ("golden",)),
    "AU-silver": ("Australia: silver wattle", ("AU",), ("silver",)),
    "EU": ("Europe: silver wattle (mimosa)", ("EU",), ("silver",)),
    "CA": ("California: silver wattle (mimosa)", ("CA",), ("silver",)),
    "EUCA": ("Europe + California pooled", ("EU", "CA"), ("silver",)),
}

PLACES = {
    "AU": [("Adelaide", -34.93, 138.60), ("Melbourne", -37.81, 144.96), ("Canberra", -35.28, 149.13),
           ("Hobart", -42.88, 147.33), ("Perth", -31.95, 115.86), ("Sydney", -33.87, 151.21)],
    "EU": [("Mandelieu-la-Napoule", 43.55, 6.94), ("Cannes", 43.55, 7.02), ("Tanneron", 43.58, 6.90),
           ("Sanremo", 43.82, 7.78), ("Lisbon", 38.72, -9.14), ("Santiago de Compostela", 42.88, -8.54),
           ("Locarno", 46.17, 8.80)],
    "CA": [("San Francisco", 37.77, -122.42)],
}
# Each macro's normals file.
NORMALS_FILE = {"EU": "bloom_normals_EU.npz", "CA": "bloom_normals_US.npz"}


def first_day(macro, year):
    """The first day of a bloom year's season: 1 January, or 1 October of the year before."""
    return date(year, 1, 1) if macro in SOUTH else date(year - 1, 10, 1)


def day_name(idx, macro):
    """Day index of a season -> '23 Aug' (a non-leap year)."""
    d = MACROS[macro]["origin"] + timedelta(days=int(round(idx)))
    return f"{d.day} {d:%b}"


def in_window(dates, window):
    md = dates.dt.month * 100 + dates.dt.day
    a, b = window
    return (md >= a) & (md <= b) if a <= b else (md >= a) | (md <= b)


# --- Fetching ----------------------------------------------------------------

def inat_pages(cache, macro, taxon, flowering):
    """Every record of the taxon in the macro's months, 2013-2026, by id (wild and cultivated, any grade)."""
    m = MACROS[macro]
    tag = f"{macro}_{taxon}_{'flowering' if flowering else 'all'}"
    page, above = 1, 0
    while True:
        q = {"taxon_id": taxon, **m["query"], "month": ",".join(map(str, m["months"])), "d1": D1, "d2": D2,
             "per_page": 200, "order_by": "id", "order": "asc", "id_above": above, "fields": INAT_FIELDS}
        if flowering:
            q.update(term_id=12, term_value_id=13)  # Plant Phenology: Flowering
        js = cb.fetch_json(INAT + urllib.parse.urlencode(q), cache / "inat" / f"{tag}_{page}.json.gz",
                           lambda j: "results" in j and len(j["results"]) == min(200, j["total_results"]), pause=1.0)
        yield from js["results"]
        if len(js["results"]) < 200 or js["total_results"] <= 200:
            break
        above, page = js["results"][-1]["id"], page + 1


def records(cache, macro, strict_accuracy=False):
    """All the macro's records as one table, `phen` from the annotation (the flowering query's included)."""
    m = MACROS[macro]
    rows = []
    for name, taxon in m["taxa"].items():
        flowering_ids = {o["id"] for o in inat_pages(cache, macro, taxon, True)}
        for o in inat_pages(cache, macro, taxon, False):
            if not o.get("location") or o.get("obscured") or not o.get("observed_on"):
                continue
            if not (o.get("taxon") or {}).get("name", "").startswith(TAXON_NAME[taxon]):
                continue
            acc = o.get("positional_accuracy")
            if (acc is None and strict_accuracy) or (acc or 0) > 1000:
                continue
            lat, lon = map(float, o["location"].split(","))
            rows.append((o["id"], o["observed_on"], lat, lon,
                         "flowering" if o["id"] in flowering_ids else cb.phenology(o), name,
                         o.get("quality_grade"), bool(o.get("captive"))))
    df = pd.DataFrame(rows, columns=["id", "date", "lat", "lon", "phen", "taxon", "grade", "captive"])
    df = df.drop_duplicates("id")
    df["flowering"] = df.phen == "flowering"
    df["date"] = pd.to_datetime(df.date, errors="coerce")
    df = df.dropna(subset=["date"])
    north = macro not in SOUTH
    df["year"] = df.date.dt.year + (df.date.dt.month >= 10 if north else 0)  # the bloom year
    first = pd.to_datetime([f"{y - 1}-10-01" if north else f"{y}-01-01" for y in df.year])
    df["idx"] = (df.date - first).dt.days  # from the season's first day
    df = df[df.year.isin(YEARS)]
    df["macro"] = macro
    if macro == "AU":
        df = df[df.lat < SOUTH_LIMIT]
    return df.reset_index(drop=True)


def states(df, cache):
    """Australian state (postal code) of each record, the nearest within 20 km on the coast."""
    import geopandas as gpd

    path = cache / "ne_50m_admin_1.geojson"
    if not path.exists():
        path.write_bytes(cb.fetch(cb.NE.format("ne_50m_admin_1_states_provinces"), cache / "ne_50m_admin_1.geojson.gz"))
    a = gpd.read_file(path)
    a = a[a.iso_a2 == "AU"][["postal", "geometry"]].to_crs(3577)  # GDA94 / Australian Albers
    pts = gpd.GeoDataFrame(df[["id"]], geometry=gpd.points_from_xy(df.lon, df.lat), crs=4326).to_crs(3577)
    hit = gpd.sjoin_nearest(pts, a, how="left", max_distance=20_000)
    return hit.groupby(level=0).postal.first().reindex(df.index)


def with_units(df, macro, cache):
    """The `unit` column: Natural Earth map unit (Europe), Australian state, or 'CA'; Europe drops other continents."""
    if macro == "AU":
        df = df.assign(unit=states(df, cache))
        return df[df.unit.notna()]
    if macro == "CA":
        return df.assign(unit="CA")
    df = df.assign(unit=cb.units(df, cache))
    return df[df.unit.isin(EU_UNITS)]


def ground_elevation(lat, lon, cache):
    """Ground elevation (Copernicus 90 m via Open-Meteo) at 0.02 degrees: coarser than bluebell's 0.01, so
    the calls stay well under Open-Meteo's 5,000 points an hour."""
    r = lambda x: np.round(np.asarray(x, float) / 0.02) * 0.02  # noqa: E731
    return cb.elevations(r(lat), r(lon), cache)


# --- The cell-years -------------------------------------------------------------

def season(series, macro, year):
    """Daily means over the bloom year's season, or None if incomplete."""
    m = MACROS[macro]
    first = pd.Timestamp(first_day(macro, year))
    a = series[first:first + pd.Timedelta(days=m["n_days"] - 1)].to_numpy()
    return a if len(a) == m["n_days"] and np.isfinite(a).all() else None


def select(df, macro, which):
    """The records a set uses: annotated flowering, or the records in a window not annotated otherwise."""
    if which == "flowering":
        return df[df.flowering]
    return df[(df.phen != "other") & in_window(df.date, MACROS[macro]["windows"][which])]


def cells(df, macro, cache, min_records=MIN_RECORDS, lapse=True, tmaxmin=False):
    """One row per POWER cell and bloom year with >= min_records records: its median day and series."""
    clat, clon = ch.power_cell(df.lat, df.lon)
    df = df.assign(clat=clat, clon=clon)
    df = df.groupby(["clat", "clon", "year"]).filter(lambda h: len(h) >= min_records)
    if not len(df):
        return pd.DataFrame(), np.zeros((0, MACROS[macro]["n_days"]))
    df = df.assign(ground=ground_elevation(df.lat.to_numpy(), df.lon.to_numpy(), cache))
    out, temps = [], []
    for (clat, clon), g in df.groupby(["clat", "clon"]):
        series, elev = ch.power(clat, clon, cache, tmaxmin)
        unit = g.unit.mode().iloc[0]
        for year, h in g.groupby("year"):
            a = season(series, macro, year)
            if a is None:
                continue
            ground = float(np.nanmedian(h.ground)) if np.isfinite(h.ground).any() else elev
            out.append(dict(lat=clat, lon=clon, elev=elev, ground=ground, year=year, n=len(h), unit=unit,
                            macro=macro, obs=float(np.median(h.idx)),
                            iqr=float(np.subtract(*np.percentile(h.idx, [75, 25])))))
            temps.append(a + (LAPSE * (elev - ground) if lapse else 0.0))
    c = pd.DataFrame(out)
    c["land"] = cb.land_share(c.lat, c.lon, cache)
    return c, np.array(temps)


def normals_au(cache):
    """POWER's 1991-2020 monthly T2M over Australia, as build_bloom_normals.py builds the other macros'."""
    path = cache / "bloom_normals_AU.npz"
    if not path.exists():
        import build_bloom_normals as bn

        points = {}
        for s in range(-45, -25, 10):
            for w in range(110, 160, 10):
                for f in bn.fetch("T2M", s, s + 10, w, w + 10):
                    lon, lat, elev = f["geometry"]["coordinates"]
                    v = f["properties"]["parameter"]["T2M"]
                    if all(v[k] > -900 for k in bn.MONTHS):
                        points[(round(lat, 3), round(lon, 3))] = [elev] + [v[k] for k in bn.MONTHS]
                print(f"  AU normals {s},{w}: {len(points)} points", file=sys.stderr)
                time.sleep(2)
        keys = sorted(points)
        arr = np.array([points[k] for k in keys], dtype=np.float32)
        np.savez_compressed(path.with_suffix(".part.npz"), lat=np.array([k[0] for k in keys], np.float32),
                            lon=np.array([k[1] for k in keys], np.float32), elev=arr[:, 0], t2m=arr[:, 1:])
        path.with_suffix(".part.npz").replace(path)
    return dict(np.load(path))


def load_normals(macro, cache, normals_dir):
    if macro == "AU":
        return normals_au(cache)
    import r2  # the shipped normals, fetched from R2 when missing or outdated

    return dict(np.load(r2.generated(Path(normals_dir) / NORMALS_FILE[macro])))


def normal_year(normals, macro, lat, lon, elev):
    return bloom.daily_normals(normals, np.asarray(lat, float), np.asarray(lon, float), np.asarray(elev, float),
                               MACROS[macro]["origin"], MACROS[macro]["n_days"])


# --- Models --------------------------------------------------------------------
# m = ("dd", START, BASE) | ("shift", START, BASE, "fixed"|"line") | ("chill", START, BELOW, DAYS, BASE);
# START is a day index in the season (from 1 January in the south, 1 October in the north).

def chill_curve(t, start, below, days, base):
    """Degree-days above `base`, counted from the day `days` days with a mean below `below` have passed
    since `start`; NaN before."""
    idx = np.arange(t.shape[1])
    started = np.cumsum((t < below) & (idx >= start), axis=1) >= days
    return np.where(started, np.cumsum(np.where(started, np.maximum(t - base, 0.0), 0.0), axis=1), np.nan)


def prepare(m, t, nt, lat):
    """What ch.fit and ch.apply read: (curve, None), or for "shift" this year's and the normal year's curves."""
    if m[0] == "chill":
        return chill_curve(t, *m[1:]), None
    return ch.prepare(m, t, nt, lat)


def model_name(m, macro):
    kind, *p = m
    if kind == "fixed":
        return "one fixed date"
    start = day_name(p[0], macro) if kind != "chill" else None
    if kind == "dd":
        return f"degree-days from {start}, base {p[1]:g} °C"
    if kind == "shift":
        return (f"normal-year {'date' if p[2] == 'fixed' else 'line in lat + elev'} moved by this year's lead, "
                f"degree-days from {start}, base {p[1]:g} °C")
    return (f"degree-days from {day_name(p[0], macro)}, base {p[3]:g} °C, after {p[2]} days below {p[1]:g} °C")


def params_name(m, params, macro):
    if m[0] == "fixed":
        return day_name(params, macro)
    if m[0] != "shift":
        return f"{params:.0f}"
    beta, k = params
    d0 = day_name(beta[0], macro) if len(beta) == 1 else f"{beta[0]:.1f} {beta[1]:+.3f}·lat {beta[2] * 100:+.2f}·elev/100 m"
    return f"d0 {d0}, k {k:.2f}"


def xmat(c):
    return np.column_stack([np.ones(len(c)), c.lat.to_numpy(float), c.ground.to_numpy(float)])


def run(c, m, prep, X, train, test):
    """Fit on `train`, errors (predicted - observed, days) of the model and baselines on `test`."""
    obs, lat = c.obs.to_numpy(), c.lat.to_numpy()
    if m[0] == "fixed":
        p = float(np.median(obs[train]))
        model = p - obs[test]
    else:
        p = ch.fit(m, prep, X, obs, train)
        model = ch.apply(m, prep, X, p, test) - obs[test]
    k, b = np.polyfit(lat[train], obs[train], 1) if np.ptp(lat[train]) > 0 else (0.0, np.median(obs[train]))
    beta = np.linalg.lstsq(X[train], obs[train], rcond=None)[0]
    return p, {"model": model, "fixed": np.median(obs[train]) - obs[test],
               "latitude": k * lat[test] + b - obs[test], "lat+elev": X[test] @ beta - obs[test]}


def splits(c, name):
    """{test name: [(train mask, test mask), ...]}: leave one year out, then the geographic transfers (each
    both ways; a transfer with fewer than 5 cell-years on a side is left out)."""
    yrs = sorted(c.year.unique())
    out = {"loyo": [((c.year != y).to_numpy(), (c.year == y).to_numpy()) for y in yrs]}
    ns = (c.lat >= c.lat.median()).to_numpy()  # the northern half of the cell-years against the southern
    cand = {"N/S": [(ns, ~ns), (~ns, ns)]}
    if name.startswith("AU"):
        a = c.unit.isin(EAST).to_numpy()
        vic, sa = (c.unit == "VI").to_numpy(), (c.unit == "SA").to_numpy()
        cand["VIC+SA+TAS+WA / NSW+ACT"] = [(~a, a), (a, ~a)]
        cand["VIC / SA"] = [(vic, sa), (sa, vic)]
    if name in ("EU", "EUCA"):
        eu = (c.macro == "EU").to_numpy()
        ib = c.unit.isin(IBERIA).to_numpy()
        cand["Iberia / FR+IT+CH"] = [(ib & eu, ~ib & eu), (~ib & eu, ib & eu)]
    if name == "EUCA":
        eu = (c.macro == "EU").to_numpy()
        cand["Europe / California"] = [(eu, ~eu), (~eu, eu)]
    out.update({k: v for k, v in cand.items() if all(tr.sum() >= 5 and te.sum() >= 5 for tr, te in v)})
    return out


def skill(c, pred):
    """ch.skill, or NaNs where the predictions do not move within a cell (a fixed date, a place line)."""
    try:
        return ch.skill(c, pred)
    except np.linalg.LinAlgError:
        return dict(anom_r=np.nan, anom_slope=np.nan, anom_mae=np.nan, anom_zero=np.nan, anom_n=0,
                    space_r=np.nan, space_slope=np.nan)


def loyo_order(tests):
    """The rows of the leave-one-year-out folds' test sets in fold order: the order of their errors."""
    return np.concatenate([np.flatnonzero(te) for _, te in tests["loyo"]])


def score(c, t, nt, m, tests, name):
    """MAE and bias of the model and the baselines in every test, with the constants fitted on all cell-years."""
    X, lat = xmat(c), c.lat.to_numpy()
    prep = None if m[0] == "fixed" else prepare(m, t, nt, lat)
    out = dict(model=m, tests={})
    none = 0
    for tname, pairs in tests.items():
        errs = {k: [] for k in ("model", "fixed", "latitude", "lat+elev")}
        for train, test in pairs:
            if not train.any() or not test.any():
                continue
            _, e = run(c, m, prep, X, train, test)
            for k in errs:
                errs[k].append(e[k])
        e = {k: np.concatenate(v) if v else np.array([]) for k, v in errs.items()}
        out["tests"][tname] = dict(mae=ch.mae(e["model"])[0], bias=float(np.nanmean(e["model"])),
                                   none=int(np.isnan(e["model"]).sum()), n=len(e["model"]),
                                   fixed=ch.mae(e["fixed"])[0], lat=ch.mae(e["latitude"])[0],
                                   latelev=ch.mae(e["lat+elev"])[0], errs=e["model"], ferrs=e["fixed"])
        none += out["tests"][tname]["none"]
    out["none"] = none
    out["loyo"] = out["tests"]["loyo"]["mae"]
    tr = [v["mae"] for k, v in out["tests"].items() if k != "loyo"]
    out["transfer"] = float(np.mean(tr)) if tr else np.nan
    n_tests = sum(v["n"] for v in out["tests"].values())
    out["cost"] = out["loyo"] + (out["transfer"] if tr else 0.0) + NO_PEAK * none / max(n_tests, 1)
    p = (float(np.median(c.obs)) if m[0] == "fixed"
         else ch.fit(m, prep, X, c.obs.to_numpy(), np.ones(len(c), bool)))
    out["params"] = p
    out["pred"] = np.full(len(c), p) if m[0] == "fixed" else ch.apply(m, prep, X, p)
    sk = skill(c, out["pred"])
    out["anom_r"], out["space_r"] = sk["anom_r"], sk["space_r"]
    return out


def grid_models(macro):
    if macro in SOUTH:
        starts, chill_starts, belows = (59, 74, 90, 105, 120, 135, 151, 166, 181), (90, 120), (10, 12, 14)
    else:
        starts, chill_starts, belows = (0, 15, 31, 46, 61, 92, 107, 123), (0, 31), (10, 13, 16)
    bases = (0, 2, 4, 6, 8, 10, 12)
    return ([("dd", s, b) for s in starts for b in bases]
            + [("shift", s, b, d0) for s in starts for b in bases for d0 in ("fixed", "line")]
            + [("chill", s, below, days, b) for s in chill_starts for below in belows for days in (20, 40, 60)
               for b in (0, 4, 8)])


def gain(ms):
    """Per held-out cell-year, the fixed date's absolute error minus the model's (a cell-year without a peak
    counts NO_PEAK days), in the folds' order."""
    pen = lambda e: np.where(np.isnan(e), NO_PEAK, np.abs(e))  # noqa: E731
    return pen(ms["tests"]["loyo"]["ferrs"]) - pen(ms["tests"]["loyo"]["errs"])


def bootstrap(ms, years, reps=4000, seed=0):
    """Mean of `gain` and its 95% interval from resampling the held-out years."""
    d, years = gain(ms), np.asarray(years)
    ys = np.unique(years)
    rng = np.random.default_rng(seed)
    sums = np.array([d[years == y].sum() for y in ys])
    cnt = np.array([(years == y).sum() for y in ys])
    pick = rng.integers(0, len(ys), (reps, len(ys)))
    m = sums[pick].sum(axis=1) / cnt[pick].sum(axis=1)
    return float(d.mean()), float(np.percentile(m, 2.5)), float(np.percentile(m, 97.5))


def nested(c, t, nt, rows, tests):
    """Leave one year out with the grid's choice inside it: for each held-out year, the setting with the best
    leave-one-year-out MAE over the other years (the fixed date among them) is applied to the held-out year.
    Returns (MAE, bias, the setting chosen per year) of that whole procedure: a grid's best setting is
    chosen on the data it is scored on, and this is not."""
    years = sorted(c.year.unique())
    obs, X, lat = c.obs.to_numpy(), xmat(c), c.lat.to_numpy()
    yr = c.year.to_numpy()
    inner = np.zeros((len(rows), len(years)))  # [model, held-out year]: summed inner error / rows
    for i, r in enumerate(rows):
        m = r["model"]
        prep = None if m[0] == "fixed" else prepare(m, t, nt, lat)
        for j, yo in enumerate(years):
            tot, n = 0.0, 0
            for yi in years:
                if yi == yo:
                    continue
                train, test = (yr != yo) & (yr != yi), yr == yi
                if m[0] == "fixed":
                    e = np.median(obs[train]) - obs[test]
                else:
                    e = ch.apply(m, prep, X, ch.fit(m, prep, X, obs, train), test) - obs[test]
                tot += np.where(np.isnan(e), NO_PEAK, np.abs(e)).sum()
                n += test.sum()
            inner[i, j] = tot / n
    errs, chosen = [], []
    for j, yo in enumerate(years):
        k = int(np.argmin(inner[:, j]))
        chosen.append(rows[k]["model"])
        e = rows[k]["tests"]["loyo"]["errs"]
        # the errors are in fold order: the held-out year's block
        start = sum(int((yr == y).sum()) for y in years[:j])
        errs.append(e[start:start + int((yr == yo).sum())])
    e = np.concatenate(errs)
    return ch.mae(e)[0], float(np.nanmean(e)), chosen


FAMILIES = {"fixed": "one fixed date", "shift": "a normal-year date moved by this year's warmth",
            "shift-line": "a normal-year line (lat + elev) moved by this year's warmth", "dd": "degree-days to a requirement",
            "chill": "degree-days after chill"}
SIMPLICITY = ["fixed", "shift", "shift-line", "dd", "chill"]


def family(m):
    return "shift-line" if m[0] == "shift" and m[3] == "line" else m[0]


# --- Report ------------------------------------------------------------------------

def table(header, rows):
    ch.table(header, rows)


def counts(allrec, macro):
    m = MACROS[macro]
    print(f"## {m['label']}: records\n")
    table(["taxon", "records (any grade)", "research grade", "wild", "cultivated", "annotated flowering",
           "annotated otherwise"],
          [(t, len(g), int((g.grade == "research").sum()), int((~g.captive).sum()), int(g.captive.sum()),
            int(g.flowering.sum()), int((g.phen == "other").sum())) for t, g in allrec.groupby("taxon")])
    mon = allrec.date.dt.month
    table(["month", "records", "annotated flowering", "annotated otherwise"],
          [(k, int((mon == k).sum()), int((allrec.flowering & (mon == k)).sum()),
            int(((allrec.phen == "other") & (mon == k)).sum())) for k in m["months"]])
    table(["bloom year", "records", "annotated flowering", "in the std window"],
          [(y, int((allrec.year == y).sum()), int((allrec.flowering & (allrec.year == y)).sum()),
            int(len(select(allrec[allrec.year == y], macro, "std")))) for y in YEARS])
    table(["unit", "records", "share"], [(u, n, f"{n / len(allrec):.1%}") for u, n in
                                         allrec.unit.value_counts().head(20).items()])


def proxy_check(allrec, macro):
    """Cell-years with >= MIN_FLOWERING annotated records, and cells over all years with >= 15, against each set."""
    clat, clon = ch.power_cell(allrec.lat, allrec.lon)
    a = allrec.assign(clat=clat, clon=clon)
    rows = []
    for level, keys, minf in (("cell-year", ["clat", "clon", "year"], MIN_FLOWERING),
                              ("cell, all years", ["clat", "clon"], 15)):
        fl = a[a.flowering].groupby(keys).idx.agg(["median", "size"])
        fl = fl[fl["size"] >= minf]
        for which in ("narrow", "std", "wide"):
            p = select(a, macro, which).groupby(keys).idx.agg(["median", "size"])
            j = fl.join(p, rsuffix="_p", how="inner")
            j = j[j.size_p >= (MIN_RECORDS if level == "cell-year" else 15)]
            if len(j) < 3:
                rows.append((level, which, len(j), "", "", "", ""))
                continue
            d = j.median_p - j["median"]
            rows.append((level, which, len(j), f"{d.mean():+.1f}", f"{d.abs().mean():.1f}", f"{d.abs().max():.0f}",
                         f"{np.corrcoef(j.median_p, j['median'])[0, 1]:.2f}"))
    print(f"## {MACROS[macro]['label']}: each set's median against the annotated-flowering median "
          f"(>= {MIN_FLOWERING} annotated records a cell-year, 15 a cell)\n")
    table(["level", "set", "units", "set minus annotated (mean, d)", "mean absolute", "largest", "r"], rows)
    fl = a[a.flowering]
    q = lambda g: (len(g), day_name(g.idx.median(), macro), day_name(g.idx.quantile(0.1), macro),  # noqa: E731
                   day_name(g.idx.quantile(0.9), macro))
    table(["annotated flowering records", "records", "median date", "10th percentile", "90th percentile"],
          [("all", *q(fl))] + [(f"{k}", *q(g)) for k, g in fl.groupby("unit") if len(g) >= 20]
          + [(f"{k}", *q(g)) for k, g in fl.groupby("taxon") if a.taxon.nunique() > 1])
    ann = a[a.phen != ""]
    half = ann.date.dt.month.astype(str) + np.where(ann.date.dt.day <= 15, "a", "b")
    s = ann.groupby(half).flowering.agg(["size", "mean"])
    print("Annotated records flowering, by half month (a = 1-15, b = 16-end): "
          + ", ".join(f"{k} {v['mean']:.0%} of {int(v['size'])}" for k, v in s.iterrows()) + "\n")


def subset(rec, quality, wild):
    rec = rec if quality is None else rec[rec.grade == quality]
    return rec[~rec.captive] if wild else rec


def build(name, recs, cache, args, which="std"):
    """(cell-years, series, normal years) of an analysis, over its macros."""
    label, macros, taxa = ANALYSES[name]
    cs, ts, nts = [], [], []
    for macro in macros:
        rec = recs[macro]
        rec = rec[rec.taxon.isin(taxa)]
        rec = select(subset(rec, args.quality, args.wild), macro, which)
        c, t = cells(rec, macro, cache, args.min_records, not args.no_lapse, args.tmaxmin)
        if not len(c):
            continue
        sea = (c.land < MIN_LAND).to_numpy()
        if not args.keep_sea:
            c, t = c[~sea].reset_index(drop=True), t[~sea]
        nt = normal_year(args.normals_data[macro], macro, c.lat, c.lon, c.elev if args.no_lapse else c.ground)
        cs.append(c)
        ts.append(t)
        nts.append(nt)
    if not cs:
        return None, None, None
    return pd.concat(cs, ignore_index=True), np.vstack(ts), np.vstack(nts)


def best_of_families(rows):
    best = {}
    for r in rows:
        f = family(r["model"])
        if f not in best or r["cost"] < best[f]["cost"]:
            best[f] = r
    return best


def analysis(name, recs, cache, args):
    label, macros, taxa = ANALYSES[name]
    macro = macros[0]
    c, t, nt = build(name, recs, cache, args, args.set)
    print(f"\n# {label}\n")
    if c is None or len(c) < 20:
        print(f"Too few cell-years ({0 if c is None else len(c)}): skipped.\n")
        return None
    sea_note = f"cells under {MIN_LAND:.0%} land {'kept' if args.keep_sea else 'dropped'}"
    print(f"Set `{args.set}`{', research grade' if args.quality else ''}{', wild only' if args.wild else ''}: "
          f"{len(c)} cell-years in {c[['lat', 'lon']].drop_duplicates().shape[0]} POWER cells, {int(c.n.sum())} "
          f"records ({sea_note}); bloom years {int(c.year.min())}-{int(c.year.max())}; median spread of a "
          f"cell-year's records (IQR) {c.iqr.median():.0f} days; records' ground minus POWER's grid elevation: "
          f"median {np.median(c.ground - c.elev):+.0f} m.\n")
    table(["bloom year", "cell-years", "median observed peak"],
          [(y, len(g), day_name(g.obs.median(), macro)) for y, g in c.groupby("year")])
    table(["unit", "cell-years", "median latitude", "median observed peak", "IQR across cell-years"],
          [(u, len(g), f"{g.lat.median():.1f}", day_name(g.obs.median(), macro),
            f"{np.subtract(*np.percentile(g.obs, [75, 25])):.0f} d") for u, g in c.groupby("unit") if len(g) >= 3])
    tests = splits(c, name)
    models = [("fixed",)] + [m for mac in macros[:1] for m in grid_models(mac)]
    rows = [score(c, t, nt, m, tests, name) for m in models]
    for r in rows:
        r["family"] = family(r["model"])
    fixed = rows[0]
    best = best_of_families(rows)
    head = ["model", "LOYO MAE", "LOYO bias", *[f"{k} MAE" for k in tests if k != "loyo"], "total", "no peak",
            "constants (all cell-years)", "year-to-year r", "place-to-place r"]

    def line(r):
        return (model_name(r["model"], macro), f"{r['loyo']:.2f}", f"{r['tests']['loyo']['bias']:+.1f}",
                *[f"{v['mae']:.2f}" for k, v in r["tests"].items() if k != "loyo"], f"{r['cost']:.2f}", r["none"],
                params_name(r["model"], r["params"], macro), f"{r['anom_r']:.2f}", f"{r['space_r']:.2f}")
    dd = [r for r in rows if r["family"] == "dd"]
    brief = name in ("AU-golden", "AU-silver")
    for key, title in () if brief else (("loyo", "leave-one-year-out MAE"), ("transfer", "mean transfer MAE")):
        print(f"## Degree-days to a requirement: {title}, by start and base\n")
        piv = pd.DataFrame([dict(start=r["model"][1], base=r["model"][2], v=r[key]) for r in dd]) \
            .pivot(index="start", columns="base", values="v")
        table(["start"] + [f"{b:g} °C" for b in piv.columns],
              [[day_name(i, macro)] + [f"{v:.2f}" for v in r] for i, r in piv.iterrows()])
    sh = [r for r in rows if r["family"] == "shift"]
    for key, title, val in () if brief else (
            ("loyo", "leave-one-year-out MAE", lambda r: f"{r['loyo']:.2f}"),
            ("k", "the share k of this year's lead the peak follows (fitted on all cell-years; 0 where it is clipped)",
             lambda r: f"{r['params'][1]:.2f}")):
        print(f"## A normal-year date moved by this year's warmth (heather's form): {title}, by start and base\n")
        piv = pd.DataFrame([dict(start=r["model"][1], base=r["model"][2], v=val(r)) for r in sh]) \
            .pivot(index="start", columns="base", values="v")
        table(["start"] + [f"{b:g} °C" for b in piv.columns], [[day_name(i, macro)] + list(r) for i, r in piv.iterrows()])
    for fam in () if brief else SIMPLICITY[1:]:
        sel = sorted([r for r in rows if r["family"] == fam], key=lambda r: r["cost"])[:5 if not args.grid else 99]
        if sel:
            print(f"## {FAMILIES[fam]}: best settings by the total\n")
            table(head, [line(r) for r in sel])
    print("## Best of each family (total = LOYO + mean transfer + 30 d per cell-year without a peak)\n")
    fx = {k: (v["fixed"], v["lat"], v["latelev"]) for k, v in fixed["tests"].items()}
    table(["family"] + head, [(FAMILIES[f], *line(r)) for f, r in
                              [("fixed", fixed)] + [(f, best[f]) for f in SIMPLICITY[1:] if f in best]])
    print("Baselines on the same folds (MAE): " + "; ".join(
        f"{k}: fixed date {a:.2f}, latitude line {b:.2f}, lat + elev line {d:.2f}" for k, (a, b, d) in fx.items()) + "\n")

    # The recommended model: the fixed date, unless a setting gains MARGIN days on its total and the 95% interval of
    # its leave-one-year-out gain is above zero (the grid has about 200 settings: its best one looks better than
    # it is); then the simplest within a quarter day of the best of those.
    yrs = c.year.to_numpy()[loyo_order(tests)]  # the folds' test rows, in fold order, as the errors are
    gains = {id(r): bootstrap(r, yrs) for r in rows[1:]}
    top = min(rows, key=lambda r: r["cost"])
    cands = [r for r in rows[1:] if fixed["cost"] - r["cost"] >= MARGIN and gains[id(r)][1] > 0]
    if cands:
        topc = min(cands, key=lambda r: r["cost"])
        pick = min([r for r in cands if r["cost"] <= topc["cost"] + 0.25],
                   key=lambda r: (SIMPLICITY.index(r["family"]), r["cost"]))
    else:
        pick = fixed
    n_mae, n_bias, chosen = nested(c, t, nt, rows, tests)
    print(f"Best total {top['cost']:.2f} ({model_name(top['model'], macro)}); the fixed date's is {fixed['cost']:.2f}. "
          f"Settings that gain {MARGIN} d on the total with the gain's interval above zero: {len(cands)}. "
          f"Recommended: {model_name(pick['model'], macro)}.\n")
    print(f"The grid's choice made inside the leave-one-year-out (nested: the setting with the best MAE over the "
          f"other years is applied to the held-out year): MAE {n_mae:.2f} d, bias {n_bias:+.1f}, against "
          f"{fixed['loyo']:.2f} d for the fixed date; settings chosen: "
          + ", ".join(f"{k} {v}" for k, v in pd.Series([family(m) for m in chosen]).value_counts().items()) + ".\n")
    brows = []
    for label2, r in [("best total", top), ("recommended", pick)] + [(f, best[f]) for f in SIMPLICITY[1:] if f in best]:
        d, lo, hi = bootstrap(r, yrs) if r is not fixed else (0.0, 0.0, 0.0)
        brows.append((label2, model_name(r["model"], macro), f"{d:+.2f}", f"{lo:+.2f} to {hi:+.2f}"))
    print("Does it beat the fixed date? Fixed MAE minus model MAE in leave-one-year-out (positive: the model is "
          "better), 95% interval from resampling the held-out years\n")
    table(["", "model", "gain (d)", "95% interval"], brows)
    report(name, pick, fixed, c, t, nt, tests, args)
    return dict(name=name, c=c, t=t, nt=nt, rows=rows, fixed=fixed, best=best, pick=pick, tests=tests,
                nested=(n_mae, n_bias))


def forecast(m, params, t, nt, lat, X):
    """The fitted model's peak (day index) for new rows: this year's series `t`, the normal year's `nt`."""
    if m[0] == "fixed":
        return np.full(len(t), params)
    return ch.apply(m, prepare(m, t, nt, lat), X, params)


def report(name, pick, fixed, c, t, nt, tests, args):
    label, macros, taxa = ANALYSES[name]
    macro = macros[0]
    m, p = pick["model"], pick["params"]
    obs = c.obs.to_numpy()
    print(f"# {label}: recommended {model_name(m, macro)}\n")
    print(f"Constants on all {len(c)} cell-years: {params_name(m, p, macro)}\n")
    sk = skill(c, pick["pred"])
    print(f"In-sample skill. Year to year, within {sk['anom_n']} cell-years of cells with >= 3 years: r = "
          f"{sk['anom_r']:.2f}, slope of observed on predicted {sk['anom_slope']:.2f}, MAE of the anomaly "
          f"{sk['anom_mae']:.2f} d against {sk['anom_zero']:.2f} d for a normal year. Place to place, cell means: "
          f"r = {sk['space_r']:.2f}, slope {sk['space_slope']:.2f}.\n")
    # --- leave one year out ---
    e, f = pick["tests"]["loyo"]["errs"], pick["tests"]["loyo"]["ferrs"]
    order = loyo_order(tests)
    ea, fa = np.full(len(c), np.nan), np.full(len(c), np.nan)
    ea[order], fa[order] = e, f
    rows = []
    for y in sorted(c.year.unique()):
        k = (c.year == y).to_numpy()
        rows.append((y, int(k.sum()), f"{ch.mae(ea, k)[0]:.1f}", f"{ch.mae(fa, k)[0]:.1f}", f"{np.nanmean(ea[k]):+.1f}"))
    rows.append(("all", len(c), f"**{ch.mae(ea)[0]:.2f}**", f"**{ch.mae(fa)[0]:.2f}**", f"{np.nanmean(ea):+.1f}"))
    print("## Leave one year out (MAE, days)\n")
    table(["held-out year", "cell-years", "model", "fixed date", "model bias"], rows)
    yr = c.assign(pred=ea + obs).groupby("year")[["obs", "pred"]].mean()
    if m[0] != "fixed":
        print(f"Year means, observed vs predicted (LOYO): r = {np.corrcoef(yr.obs, yr.pred)[0, 1]:.2f}, observed "
              f"spread (SD) {yr.obs.std():.1f} d, predicted {yr.pred.std():.1f} d\n")
    big = (c.n >= 20).to_numpy()
    clim = ch.own_median(c)
    has = np.isfinite(clim)
    print(f"Cell-years with >= 20 records ({int(big.sum())}): model {ch.mae(ea, big)[0]:.2f}, fixed date "
          f"{ch.mae(fa, big)[0]:.2f} days; on the {int(has.sum())} cell-years whose cell has other years: model "
          f"{ch.mae(ea, has)[0]:.2f}, the cell's own median in its other years {ch.mae(clim, has)[0]:.2f}, fixed date "
          f"{ch.mae(fa, has)[0]:.2f}\n")
    # --- transfer ---
    rows = []
    for tname, pairs in tests.items():
        if tname == "loyo":
            continue
        for train, test in pairs:
            if not train.any() or not test.any():
                continue
            _, ee = run(c, m, None if m[0] == "fixed" else prepare(m, t, nt, c.lat.to_numpy()), xmat(c), train, test)
            _, ef = run(c, ("fixed",), None, xmat(c), train, test)
            rows.append((tname, int(train.sum()), int(test.sum()), f"{ch.mae(ee['model'])[0]:.1f}",
                         f"{ch.mae(ef['model'])[0]:.1f}", f"{ch.mae(ee['lat+elev'])[0]:.1f}",
                         f"{np.nanmean(ee['model']):+.1f}"))
    print("## Geographic transfer (MAE, days; each row is fitted on the first part, tested on the second, in the "
          "order of the test's name)\n")
    table(["test", "train cell-years", "test cell-years", "model", "fixed date", "lat + elev line", "model bias"], rows)
    bias = pd.Series(pick["pred"] - obs).groupby(c.unit.to_numpy())
    table(["unit (in-sample)", "cell-years", "bias, predicted - observed (d)", "MAE (d)"],
          [(k, len(g), f"{g.mean():+.1f}", f"{g.abs().mean():.1f}") for k, g in bias if len(g) >= 3])
    n_err = forecast(m, p, nt, nt, c.lat.to_numpy(), xmat(c)) - obs
    print(f"Normals only (1991-2020) at the cells: MAE {ch.mae(n_err)[0]:.2f} d, bias {np.nanmean(n_err):+.1f} d. "
          f"Daily POWER, in-sample: MAE {ch.mae(pick['pred'] - obs)[0]:.2f} d.\n")


def dry_run(res, recs, cache, args):
    """Normal-year peak (normals only, at the place's own elevation) and the latest bloom year's peak at named
    places, for the recommended model and, where different, the best total and the best line and degree-day settings."""
    label, macros, taxa = ANALYSES[res["name"]]
    top = min(res["rows"], key=lambda r: r["cost"])
    show = [("recommended", res["pick"])]
    for name, r in (("best total", top), ("best line", res["best"].get("shift-line")), ("best dd", res["best"].get("dd"))):
        if r is not None and all(r["model"] != q["model"] for _, q in show):
            show.append((name, r))
    rows26, rows = [], []
    for macro in macros:
        places = PLACES.get(macro, [])
        if not places:
            continue
        lat, lon = np.array([x[1] for x in places]), np.array([x[2] for x in places])
        elev = cb.elevations(lat, lon, cache)
        nt = normal_year(args.normals_data[macro], macro, lat, lon, elev)
        X = np.column_stack([np.ones(len(lat)), lat, elev])
        ts = []
        for (nm, a, b), e in zip(places, elev):
            pa, pb = ch.power_cell(a, b)
            s, pe = ch.power(float(pa), float(pb), cache, args.tmaxmin)
            ts.append(season(s, macro, 2026) + LAPSE * (pe - e))
        got = [(forecast(q["model"], q["params"], nt, nt, lat, X), forecast(q["model"], q["params"], np.array(ts), nt, lat, X))
               for _, q in show]

        def fmt(v):
            return day_name(v, macro) if np.isfinite(v) else "none"
        for i, (nm, a, b) in enumerate(places):
            rows.append((nm, f"{a:.2f}, {b:.2f}", f"{elev[i]:.0f} m", *[fmt(g[0][i]) for g in got]))
            rows26.append((nm, *[fmt(g[1][i]) for g in got]))
    cols = [f"{n}: {model_name(q['model'], macros[0])}" for n, q in show]
    print(f"## {label}: a normal year at named places (normals only, at the place's own elevation)\n")
    table(["place", "lat, lon", "elevation", *cols], rows)
    print(f"## {label}: 2026's peak at the same places (POWER's 2026 days, then the models)\n")
    table(["place", *cols], rows26)


def cutoff(res, recs, args):
    """The normal-year peak (normals only) at every 0.1 degree cell holding a window record, for the model's
    own climate: a place is drawn only if a normal year peaks by LATEST_NORMAL_PEAK."""
    label, macros, taxa = ANALYSES[res["name"]]
    m, p = res["pick"]["model"], res["pick"]["params"]
    if family(m) in ("fixed", "shift", "shift-line"):
        own = forecast(m, p, res["nt"], res["nt"], res["c"].lat.to_numpy(), xmat(res["c"]))
        print(f"{label}: the recommended model's normal-year peak falls on {day_name(np.nanmin(own), macros[0])} - "
              f"{day_name(np.nanmax(own), macros[0])} at the calibration's cells: it reaches every place, so the "
              f"ground, not the model, decides where it is drawn (LATEST_NORMAL_PEAK (12, 31)).")
        if "dd" not in res["best"]:
            return
        m, p = res["best"]["dd"]["model"], res["best"]["dd"]["params"]
        print(f"For the climate alone, the best degree-day setting ({model_name(m, macros[0])}, F {p:.0f}) gives:")
    allp = []
    for macro in macros:
        r = recs[macro]
        r = select(subset(r[r.taxon.isin(taxa)], args.quality, args.wild), macro, "std")
        cy, cx = np.rint(r.lat / bloom.CELL), np.rint(r.lon / bloom.CELL)
        cl = pd.DataFrame({"cy": cy, "cx": cx}).drop_duplicates()
        lat, lon = cl.cy.to_numpy() * bloom.CELL, cl.cx.to_numpy() * bloom.CELL
        nt = normal_year(args.normals_data[macro], macro, lat, lon, np.full(len(lat), np.nan))
        X = np.column_stack([np.ones(len(lat)), lat, np.zeros(len(lat))])
        allp.append((macro, forecast(m, p, nt, nt, lat, X), len(lat)))
    pk = np.concatenate([a[1] for a in allp])
    cm = res["c"]
    cell = forecast(m, p, res["nt"], res["nt"], cm.lat.to_numpy(), xmat(cm))
    macro = macros[0]
    print(f"{len(pk)} 0.1 degree cells with a window record (POWER's grid elevation): normal-year peak 50th "
          f"{day_name(np.nanpercentile(pk, 50), macro)}, 90th {day_name(np.nanpercentile(pk, 90), macro)}, 95th "
          f"{day_name(np.nanpercentile(pk, 95), macro)}, 99th {day_name(np.nanpercentile(pk, 99), macro)}, latest "
          f"{day_name(np.nanmax(pk), macro)}; none by the end of the season: {int(np.isnan(pk).sum())}. At the "
          f"calibration's cell-years (at the records' elevation): latest {day_name(np.nanmax(cell), macro)}, 95th "
          f"{day_name(np.nanpercentile(cell, 95), macro)}.\n")


def sensitivity(name, recs, cache, args):
    """The best model of each family against the fixed date, on each record set and subset."""
    label, macros, taxa = ANALYSES[name]
    macro = macros[0]
    rows = []
    sets = [("flowering", 5, None, False), ("narrow", args.min_records, None, False), ("std", 5, None, False),
            ("std", args.min_records, None, False), ("std", 15, None, False), ("wide", args.min_records, None, False),
            ("std", args.min_records, "research", False), ("std", args.min_records, None, True)]
    for which, mr, quality, wild in sets:
        a = argparse.Namespace(**{**vars(args), "quality": quality, "wild": wild, "min_records": mr})
        c, t, nt = build(name, recs, cache, a, which)
        head = (which, mr, quality or "any", "wild" if wild else "any")
        if c is None or len(c) < 20 or c.year.nunique() < 3:
            rows.append((*head, 0 if c is None else len(c), "", "", "", "", "", ""))
            continue
        tests = splits(c, name)
        res = [score(c, t, nt, m, tests, name) for m in [("fixed",)] + grid_models(macro)]
        for r in res:
            r["family"] = family(r["model"])
        best = best_of_families(res[1:])
        top = min(best.values(), key=lambda r: r["cost"])

        def cell(r):
            return f"{r['loyo']:.2f} / {r['transfer']:.2f}"
        rows.append((*head, len(c), day_name(c.obs.median(), macro), cell(res[0]),
                     cell(best["shift"]) + f" (k {best['shift']['params'][1]:.2f})", cell(best["dd"]),
                     cell(top) + f" ({family(top['model'])})", f"{res[0]['cost']:.2f} vs {top['cost']:.2f}"))
    print(f"## {label}: sensitivity to the record set (LOYO MAE / mean transfer MAE, days)\n")
    table(["set", "min records", "grade", "wild", "cell-years", "median peak", "fixed date",
           "best shift (fixed d0)", "best dd", "best of all", "total: fixed vs best"], rows)


def main():
    global MIN_RECORDS
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cache", type=Path, default=Path.home() / ".cache" / "funges-wattle")
    ap.add_argument("--normals", type=Path, default=ROOT / "backend" / "generated",
                    help="where bloom_normals_EU.npz and bloom_normals_US.npz are (read only)")
    ap.add_argument("--only", help="analyses to run, comma separated, from " + ", ".join(ANALYSES))
    ap.add_argument("--set", choices=("std", "narrow", "wide", "flowering"), default="std")
    ap.add_argument("--min-records", type=int, default=MIN_RECORDS, help="records a cell-year needs")
    ap.add_argument("--quality", choices=("research", "needs_id", "casual"), help="only records of this grade")
    ap.add_argument("--wild", action="store_true", help="only records not marked cultivated or captive")
    ap.add_argument("--strict-accuracy", action="store_true")
    ap.add_argument("--no-lapse", action="store_true", help="keep POWER at its grid elevation")
    ap.add_argument("--keep-sea", action="store_true", help=f"keep POWER cells under {MIN_LAND * 100:.0f}%% land")
    ap.add_argument("--tmaxmin", action="store_true", help="(T2M_MAX + T2M_MIN) / 2 instead of T2M")
    ap.add_argument("--grid", action="store_true", help="print every setting of every family")
    ap.add_argument("--no-sensitivity", action="store_true")
    args = ap.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    MIN_RECORDS = args.min_records
    wanted = args.only.split(",") if args.only else list(ANALYSES)
    macros = sorted({m for n in wanted for m in ANALYSES[n][1]})

    recs = {}
    for macro in macros:
        allrec = with_units(records(args.cache, macro, args.strict_accuracy), macro, args.cache)
        recs[macro] = allrec
        print(f"# {MACROS[macro]['label']}: {len(allrec)} records ({int(allrec.flowering.sum())} annotated "
              f"flowering) in the bloom years {YEARS.start}-{YEARS.stop - 1}\n")
        counts(allrec, macro)
        proxy_check(allrec, macro)
    args.normals_data = {macro: load_normals(macro, args.cache, args.normals) for macro in macros}

    results = {}
    for name in wanted:
        res = analysis(name, recs, args.cache, args)
        if res is None:
            continue
        results[name] = res
        dry_run(res, recs, args.cache, args)
        cutoff(res, recs, args)
        if not args.no_sensitivity:
            sensitivity(name, recs, args.cache, args)
    print("# Recommended\n")
    def shift(n, r):
        m, p, macro = r["best"]["shift"]["model"], r["best"]["shift"]["params"], ANALYSES[n][1][0]
        return f"{model_name(m, macro)}: {params_name(m, p, macro)}"
    table(["analysis", "recommended", "constants", "LOYO MAE", "mean transfer MAE", "fixed date LOYO",
           "fixed date transfer", "nested LOYO of the grid's choice", "best shift setting"],
          [(ANALYSES[n][0], model_name(r["pick"]["model"], ANALYSES[n][1][0]),
            params_name(r["pick"]["model"], r["pick"]["params"], ANALYSES[n][1][0]), f"{r['pick']['loyo']:.2f}",
            f"{r['pick']['transfer']:.2f}", f"{r['fixed']['loyo']:.2f}", f"{r['fixed']['transfer']:.2f}",
            f"{r['nested'][0]:.2f}", shift(n, r))
           for n, r in results.items()])


if __name__ == "__main__":
    main()
