#!/usr/bin/env python3
"""Calibrate a peak-bloom forecast for heather (Calluna vulgaris): the purple moors.

A "spectacle" after cherry blossom, bluebells and the desert superbloom
(backend/bloom.py), fitted the same way: on NASA POWER daily mean temperature
(MERRA-2 T2M), the source of the forecast's 1991-2020 normals. The observed peak is
the median date of iNaturalist records of common heather (taxon 119450 and its
infraspecific taxa; bell heather and cross-leaved heath are Erica, other taxa) per
POWER grid cell (0.5° x 0.625°, centred on POWER's own grid points) and year, for
cells with at least MIN_RECORDS records. Each cell-year's series is moved from
POWER's grid elevation to the median ground elevation of its records (EU-DEM 25 m,
read locally), and cells under MIN_LAND land are dropped. A model's requirement is
the median forcing reached on the observed day of its training cell-years, as for
cherry and bluebell. Seasons run from 1 January (index 0).

Heather is evergreen and recorded all year, so plain June-October records mix
flowering with green and brown plants. The flowering annotation is thin (about 6%
of the records). The default observation set is July-September records not
annotated as budding, fruiting or without flowers; `--records` tests the others
against the annotated median (the proxy table).

Tests, all printed as tables:

1. Leave one year out (2016-2026): fitted on the other summers, tested on one.
2. Geographic transfer: Great Britain + Ireland against the continent, and the
   north (>= 55° N) against the south, both directions.
3. DWD (Deutscher Wetterdienst) annual reporters: "Heidekraut, Blüte Beginn"
   (first flowering) at German stations 2000-2026, each station's POWER cell at the
   station's elevation. Onset, not peak, so it gets its own requirement (leave one
   year out), and it tests the timing's shape and its year-to-year skill.
4. Baselines on the same cells and folds: one fixed date, a latitude line, a
   latitude + elevation line and each cell's own median date in its other years;
   and in-sample, the year-to-year (within-cell anomalies) and place-to-place
   (cell means) skill.
5. Model family over a grid: degree-days from a fixed date (1 March - 1 June, base
   0-10 °C); photothermal units (degree-days times day length / 12 h); degree-days
   from the day the day length first reaches P hours; a short-day gate (the
   degree-day peak, but not before the day length falls to P hours after midsummer);
   and "shift": a normal-year date (one date, or a latitude + elevation line) moved
   by k of this year's lead, the days this year's degree-days since the start reach
   the sum the normal year (production's 1991-2020 normals) has by that date, with
   the line and k fitted by least squares. The total is LOYO + the mean transfer +
   DWD; among the settings within a quarter day of the best total, the one with the
   best DWD year-to-year r is recommended (a plain degree-day model if within half a
   day).
6. Independent press series (Lüneburg Heath, Veluwe; PRESS below) and a normal
   year (normals only) at well-known heaths, at the mean elevation of their 0.1°
   cell, as production uses.

Then where to draw it (skipped with --no-where): the app's wilderness polygons
(CORINE classes, `--wilderness NE.geojson SE.geojson`): the share of sightings in,
within 300 m and within 1 km of each class, the GBIF range share
(calibrate_bluebell.range_grids' machinery for this taxon), the polygon count and
size, and the CORINE class under the sightings that no polygon covers.

    python backend/tools/calibrate_heather.py [--cache DIR] [--records SET] [--grid]
        [--model SPEC] [--family KINDS] [--tmaxmin] [--no-lapse] [--keep-sea]
        [--strict-accuracy] [--min-records N] [--dem DIR] [--masters]
        [--wilderness NE.geojson SE.geojson] [--no-where]

--records: `jul_sep` (default), `jun_oct` (every record June-October not annotated
otherwise), `aug` (1 August - 15 September) or `flowering` (annotated Flowering).
--tmaxmin calibrates on (T2M_MAX + T2M_MIN) / 2, as production's observed days.
--model reports one setting instead of the recommended one, written as in the grid
(`dd,START,BASE`, `ptu,START,BASE`, `pstart,HOURS,BASE`, `gate,START,BASE,HOURS`,
`shift,START,BASE,fixed|line`; START a day index from 1 January). --grid prints every
grid setting; --family limits the search (e.g. `shift`, for quick sensitivity runs).
--masters reads the NE and SE masters (by range requests) for the WeatherAPI check
when they are not cached yet. The recommended setting is `shift,59,0,fixed`.

Requests, all cached and sequential: about 250 iNaturalist pages (API v2, 1 s apart,
Retry-After honoured), about 550 POWER series (2000-2026), the DWD files, the
Natural Earth map units, 112 GBIF map tiles per taxon, a few hundred EEA CORINE
samples (the uncovered sightings). A response is cached only once it is complete,
so a failed one is fetched again on the next run.
"""
import argparse
import json
import sys
import urllib.parse
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

_TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(_TOOLS.parent))
sys.path.insert(0, str(_TOOLS))
import bloom  # noqa: E402
import r2  # noqa: E402
import calibrate_bluebell as cb  # noqa: E402  (fetching, map units and the GBIF range machinery)

cb.UA = {"User-Agent": "funges-calibrate-heather/1.0 (+https://www.fung.es)"}
ROOT = _TOOLS.parents[1]
INAT = "https://api.inaturalist.org/v2/observations?"
INAT_FIELDS = ("id,observed_on,location,obscured,positional_accuracy,taxon.id,taxon.name,"
               "annotations.controlled_attribute_id,annotations.controlled_value_id,annotations.vote_score")
TAXON = 119450  # Calluna vulgaris (iNaturalist), with its infraspecific taxa
EUROPE = 97391
YEARS = range(2016, 2027)
MIN_RECORDS = 8
MIN_LAND = 0.5
POWER = ("https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M,T2M_MAX,T2M_MIN&community=AG"
         "&longitude={lon}&latitude={lat}&start={start}&end={end}&format=JSON")
POWER_SPAN = (date(2000, 1, 1), date(2026, 10, 7))  # POWER's last complete day when fetched
N_DAYS = 304  # 1 January - 31 October (30 October in a leap year)
GBIF_TAXON = 2882482  # Calluna vulgaris (L.) Hull
DWD = "https://opendata.dwd.de/climate_environment/CDC/"
DWD_FILES = {
    "hist": "observations_germany/phenology/annual_reporters/wild/historical/"
            "PH_Jahresmelder_Wildwachsende_Pflanze_Heidekraut_1925_2024_hist.txt",
    "akt": "observations_germany/phenology/annual_reporters/wild/recent/"
           "PH_Jahresmelder_Wildwachsende_Pflanze_Heidekraut_akt.txt",
    "stations": "help/PH_Beschreibung_Phaenologie_Stationen_Jahresmelder.txt",
}
DWD_YEARS = range(2000, 2027)
DEM_DIR = ROOT.parent / "Corinne Data" / "Distance_Water" / "eudem"  # EU-DEM v1.1 tiles, EPSG:3035, 25 m
GB_IE = {"ENG", "SCT", "WLS", "NIR", "IRL", "IMN"}
# Day indices from 1 January (a day later from March in a leap year).
MAR1, APR1, MAY1, JUN1, JUL1, AUG1, SEP1, OCT1 = 59, 90, 120, 151, 181, 212, 243, 273

# Well-known heaths for the dry run (name, lat, lon). Their published windows and
# sources are in the results write-up.
HEATHS = [
    ("Lüneburg Heath: Wilsede", 53.164, 9.958),
    ("Lüneburg Heath: Undeloh", 53.197, 9.979),
    ("Veluwe: Ginkelse Heide, Ede", 52.030, 5.730),
    ("Veluwe: Hoge Veluwe", 52.100, 5.830),
    ("Kalmthoutse Heide", 51.405, 4.440),
    ("Cannock Chase", 52.745, -1.990),
    ("Peak District: Stanage Edge", 53.348, -1.632),
    ("North York Moors: Goathland", 54.393, -0.725),
    ("Dartmoor (Haytor)", 50.581, -3.754),
    ("Exmoor (Dunkery Beacon)", 51.162, -3.587),
    ("Cairngorms (Glenmore)", 57.168, -3.690),
    ("Glen Coe", 56.668, -5.005),
    ("Brecon Beacons", 51.884, -3.437),
    ("Wicklow Mountains (Sally Gap)", 53.135, -6.320),
    ("Rold Skov / Rebild Bakker", 56.832, 9.840),
    ("Mols Bjerge", 56.230, 10.580),
    ("Monts d'Arrée", 48.405, -3.930),
]
# Each heath's usual window as published (quotes and URLs in the write-up); "(snippet)" is a
# search-result summary whose page could not be read.
PUBLISHED = {
    "Lüneburg Heath: Wilsede": "8 Aug - 9 Sep; peak mostly the last week of August (LHG)",
    "Lüneburg Heath: Undeloh": "8 Aug - 9 Sep; most intense 3rd week of Aug - 1st of Sep (LHG)",
    "Veluwe: Ginkelse Heide, Ede": "mid-August - mid-September (bezoek-ede.nl)",
    "Veluwe: Hoge Veluwe": "mid-July - mid-September (Hoge Veluwe)",
    "Kalmthoutse Heide": "August - September (Natuur en Bos)",
    "Cannock Chase": "August - October (Cannock Chase AONB)",
    "Peak District: Stanage Edge": "peak colour mid-August (snippet)",
    "North York Moors: Goathland": "mid to late August into September (snippet)",
    "Dartmoor (Haytor)": "late August best (Dartmoor Preservation Ass.)",
    "Exmoor (Dunkery Beacon)": "'autumn' (Visit Exmoor)",
    "Cairngorms (Glenmore)": "peaks in August, into September (Visit Forres)",
    "Glen Coe": "-",
    "Brecon Beacons": "-",
    "Wicklow Mountains (Sally Gap)": "mid-August - early September (snippet)",
    "Rold Skov / Rebild Bakker": "2019: in flower 16 Aug to about the end of August (Naturstyrelsen)",
    "Mols Bjerge": "-",
    "Monts d'Arrée": "-",
}
# Year-by-year reports at one place: name -> (lat, lon, stage, {year: "MM-DD"}). Read on the pages
# (quotes and URLs in the write-up). Lüneburg: the day the best heaths (Oberhaverbeck, Behringen,
# Ellerndorf) stood at roughly 25-50% in the Lüneburger Heide GmbH's bloom barometer, or the
# official start: 2021 25% on 12 Aug; 2022 official start 4 Aug; 2023 35% on 27 Jul; 2024 30-50%
# on 25 Jul; 2025 about 40% on 31 Jul; 2026 10-40% on 27-28 Jul. Its declared peaks were 15-17 Aug
# 2024 and 18 Aug 2026. Veluwe: the first purple at the Posbank / Veluwezoom (2022: Planken
# Wambuis, Ede; the Posbank not yet).
PRESS = {
    "Lüneburg Heath, early bloom (25-50%)": (53.14, 9.92, "early bloom", {
        2021: "08-12", 2022: "08-04", 2023: "07-27", 2024: "07-25", 2025: "07-31", 2026: "07-28"}),
    "Lüneburg Heath, declared peak": (53.14, 9.92, "peak", {2024: "08-17", 2026: "08-18"}),
    "Veluwe, first purple": (52.03, 6.02, "first purple", {2022: "07-31", 2023: "08-05", 2024: "08-06",
                                                           2026: "08-10"}),
}


# --- Fetching ----------------------------------------------------------------

def inat_pages(cache, flowering):
    """Every research-grade record of the taxon in Europe, June-October 2016-2026, by id."""
    tag = "flowering" if flowering else "all"
    for year in YEARS:
        page, above = 1, 0
        while True:
            q = {"taxon_id": TAXON, "place_id": EUROPE, "quality_grade": "research",
                 "d1": f"{year}-06-01", "d2": f"{year}-10-31", "per_page": 200, "order_by": "id",
                 "order": "asc", "id_above": above, "fields": INAT_FIELDS}
            if flowering:
                q.update(term_id=12, term_value_id=13)  # Plant Phenology: Flowering
            js = cb.fetch_json(INAT + urllib.parse.urlencode(q), cache / "inat" / f"{tag}_{year}_{page}.json.gz",
                               lambda j: "results" in j and len(j["results"]) == min(200, j["total_results"]),
                               pause=1.0)
            yield from js["results"]
            if len(js["results"]) < 200 or js["total_results"] <= 200:
                break
            above, page = js["results"][-1]["id"], page + 1


def records(cache, strict_accuracy=False):
    """All records as one table; `phen` from the annotation, the flowering query's records included."""
    flowering_ids = {o["id"] for o in inat_pages(cache, True)}
    rows = []
    for o in inat_pages(cache, False):
        if not o.get("location") or o.get("obscured") or not o.get("observed_on"):
            continue
        if not (o.get("taxon") or {}).get("name", "").startswith("Calluna vulgaris"):
            continue
        acc = o.get("positional_accuracy")
        if (acc is None and strict_accuracy) or (acc or 0) > 1000:
            continue
        lat, lon = map(float, o["location"].split(","))
        rows.append((o["id"], o["observed_on"], lat, lon,
                     "flowering" if o["id"] in flowering_ids else cb.phenology(o)))
    df = pd.DataFrame(rows, columns=["id", "date", "lat", "lon", "phen"]).drop_duplicates("id")
    df["flowering"] = df.phen == "flowering"
    df["date"] = pd.to_datetime(df.date, errors="coerce")
    df = df.dropna(subset=["date"])
    df["year"] = df.date.dt.year
    df["idx"] = (df.date - pd.to_datetime(df.year.astype(str) + "-01-01")).dt.days  # from 1 January
    return df


def dem_elevations(lat, lon, dem_dir=DEM_DIR):
    """Ground elevation (EU-DEM v1.1, 25 m) at each point; NaN off the tiles or at sea."""
    import rasterio
    from pyproj import Transformer

    x, y = Transformer.from_crs(4326, 3035, always_xy=True).transform(np.asarray(lon, float), np.asarray(lat, float))
    out = np.full(len(x), np.nan)
    tile = (np.floor(y / 1e6) * 1e6).astype(np.int64), (np.floor(x / 1e6) * 1e6).astype(np.int64)
    for ty, tx in set(zip(*tile)):
        path = Path(dem_dir) / f"N{ty:07d}E{tx:07d}.tif"
        if not path.exists():
            continue
        k = np.flatnonzero((tile[0] == ty) & (tile[1] == tx))
        with rasterio.open(path) as src:
            v = np.array([s[0] for s in src.sample(zip(x[k], y[k]))], float)
            v[(v < -500) | (v > 9000)] = np.nan
        out[k] = v
    return out


def power(lat, lon, cache, tmaxmin=False):
    """POWER daily T2M (or (T2M_MAX + T2M_MIN) / 2) and the grid cell's elevation."""
    start, end = POWER_SPAN
    n = (end - start).days + 1
    js = cb.fetch_json(POWER.format(lat=lat, lon=lon, start=start.strftime("%Y%m%d"), end=end.strftime("%Y%m%d")),
                       cache / "power" / f"{lat}_{lon}.json.gz",
                       lambda j: len(j["properties"]["parameter"]["T2M"]) == n
                       and j["properties"]["parameter"]["T2M"][end.strftime("%Y%m%d")] > -900, pause=0.5)
    p = js["properties"]["parameter"]
    s = (pd.Series(p["T2M_MAX"], dtype=float) + pd.Series(p["T2M_MIN"], dtype=float)) / 2 if tmaxmin \
        else pd.Series(p["T2M"], dtype=float)
    s.index = pd.to_datetime(s.index)
    s[s < -900] = np.nan
    return s.interpolate(limit=5), float(js["geometry"]["coordinates"][2])


def season(series, year):
    """Daily means from 1 January to 31 October of `year` (N_DAYS), or None if incomplete.

    The last summer's tail after POWER_SPAN's end is the series' own mean of those
    days of the year in the other years (it only matters for peaks after 7 October)."""
    a = series[pd.Timestamp(year, 1, 1):pd.Timestamp(year, 12, 31)].to_numpy()[:N_DAYS]
    if len(a) < N_DAYS and year == POWER_SPAN[1].year:
        fill = series[series.index.year < year]
        fill = fill.groupby(fill.index.dayofyear).mean()
        a = np.concatenate([a, fill.loc[np.arange(len(a), N_DAYS) + 1].to_numpy()])
    return a if len(a) == N_DAYS and np.isfinite(a).all() else None


def power_cell(lat, lon):
    return (np.round(np.asarray(lat) / 0.5) * 0.5).round(3), (np.round(np.asarray(lon) / 0.625) * 0.625).round(4)


def cells(df, cache, lapse=True, tmaxmin=False, dem_dir=DEM_DIR):
    """One row per POWER cell and year with >= MIN_RECORDS records: its median day and series."""
    clat, clon = power_cell(df.lat, df.lon)
    df = df.assign(clat=clat, clon=clon)
    df = df.groupby(["clat", "clon", "year"]).filter(lambda h: len(h) >= MIN_RECORDS)
    df = df.assign(ground=dem_elevations(df.lat, df.lon, dem_dir))
    out, temps = [], []
    for (clat, clon), g in df.groupby(["clat", "clon"]):
        series, elev = power(clat, clon, cache, tmaxmin)
        unit = g.unit.mode().iloc[0] if g.unit.notna().any() else None
        for year, h in g.groupby("year"):
            a = season(series, year)
            if a is None:
                continue
            ground = float(np.nanmedian(h.ground)) if np.isfinite(h.ground).any() else elev
            out.append(dict(lat=clat, lon=clon, elev=elev, ground=ground, year=year, n=len(h), unit=unit,
                            obs=float(np.median(h.idx)), iqr=float(np.subtract(*np.percentile(h.idx, [75, 25])))))
            temps.append(a + (bloom.LAPSE * (elev - ground) if lapse else 0.0))
    c = pd.DataFrame(out)
    c["land"] = cb.land_share(c.lat, c.lon, cache)
    return c, np.array(temps)


def dwd(cache):
    """DWD annual reporters' first flowering of heather, 2000-2026, with the stations' places."""
    raw = {k: cb.fetch(DWD + v, cache / "dwd" / f"{k}.txt.gz", lambda b: len(b) > 10_000).decode("latin-1")
           for k, v in DWD_FILES.items()}

    def frame(text):
        rows = [[x.strip() for x in line.split(";")] for line in text.splitlines() if line.strip()]
        return pd.DataFrame(rows[1:], columns=[h.strip() for h in rows[0]])

    obs = pd.concat([frame(raw["hist"]), frame(raw["akt"])])
    obs = obs[(obs.Phase_id == "5") & (obs.Qualitaetsniveau == "10")]
    obs = obs.assign(station=obs.Stations_id.astype(int), year=obs.Referenzjahr.astype(int),
                     date=pd.to_datetime(obs.Eintrittsdatum, format="%Y%m%d", errors="coerce"),
                     qb=obs.Eintrittsdatum_QB.astype(int))
    obs = obs[obs.year.isin(DWD_YEARS) & obs.date.notna() & obs.qb.isin([1, 5, 7])]  # unchecked, checked, corrected
    obs = obs.drop_duplicates(["station", "year"], keep="last")
    st = frame(raw["stations"])
    st = pd.DataFrame({"station": st.Stations_id.astype(int), "name": st.Stationsname,
                       "lat": st["geograph.Breite"].astype(float), "lon": st["geograph.Laenge"].astype(float),
                       "elev": pd.to_numeric(st.Stationshoehe, errors="coerce")}).drop_duplicates("station")
    obs = obs.merge(st, on="station")
    obs["idx"] = (obs.date - pd.to_datetime(obs.year.astype(str) + "-01-01")).dt.days
    return obs[["station", "name", "lat", "lon", "elev", "year", "idx"]].reset_index(drop=True)


def range_grids(cache):
    """The range prior as the app builds it, and the taxon's local share relative to its
    typical share (calibrate_bluebell.range_grids, for heather)."""
    import build_range_priors as brp

    macro = brp.MACROS["EU"]
    lats = brp.lat_centers(macro)
    raw, bg = cb.gbif_grid(macro, GBIF_TAXON, cache), cb.gbif_grid(macro, cb.PLANTAE, cache)
    craw = cb.gbif_grid(macro, GBIF_TAXON, cache, brp.CASUAL_DATASETS)
    cbg = cb.gbif_grid(macro, cb.PLANTAE, cache, brp.CASUAL_DATASETS)
    targets = [brp.smooth_counts(raw, lats, s) for s in brp.SCALES_KM]
    backgrounds = [brp.smooth_counts(bg, lats, s) for s in brp.SCALES_KM]
    prior = np.maximum(brp.range_prior(targets, backgrounds),
                       brp.casual_presence(brp.smooth_counts(craw, lats), brp.smooth_counts(cbg, lats)))
    with np.errstate(invalid="ignore", divide="ignore"):
        rel = np.nan_to_num(targets[0] / backgrounds[0]) / brp.typical_share(targets[0], backgrounds[0])
    return macro, prior, rel


def master_cells(url, cache, region):
    """A regional master's daily (Tmax + Tmin) / 2 averaged per POWER cell, with its
    base points' mean elevation (cached as master/<region>_power_cells.parquet).

    Only the needed columns are read, by HTTP range requests where `url` is remote."""
    path = cache / "master" / f"{region}_power_cells.parquet"
    if path.exists():
        return pd.read_parquet(path)
    import fsspec
    import pyarrow.parquet as pq

    cols = ["Date", "Latitude", "Longitude", "Elevation (m)", "Temperature (C) Max", "Temperature (C) Min"]
    parts = []
    with fsspec.open(url, block_size=2 ** 22).open() as f:
        pf = pq.ParquetFile(f)
        for rg in range(pf.num_row_groups):
            df = pf.read_row_group(rg, columns=cols).to_pandas()
            clat, clon = power_cell(df.Latitude.to_numpy(float), df.Longitude.to_numpy(float))
            df = pd.DataFrame({"clat": clat, "clon": clon, "date": pd.to_datetime(df.Date).dt.normalize(),
                               "t": (df["Temperature (C) Max"] + df["Temperature (C) Min"]) / 2,
                               "e": df["Elevation (m)"]})
            parts.append(df.groupby(["clat", "clon", "date"]).agg(t_sum=("t", "sum"), t_n=("t", "count"),
                                                                    e_sum=("e", "sum"), e_n=("e", "count")))
    agg = pd.concat(parts).groupby(level=[0, 1, 2]).sum()
    out = pd.DataFrame({"t": agg.t_sum / agg.t_n, "elev": agg.e_sum / agg.e_n, "points": agg.t_n}).reset_index()
    path.parent.mkdir(parents=True, exist_ok=True)
    out.to_parquet(path.with_suffix(".part"))
    path.with_suffix(".part").replace(path)
    return out


# --- Models --------------------------------------------------------------------
# A model turns rows x days of daily mean (from 1 January) into the forcing summed so
# far, NaN before it starts counting, so a bloom seen before then says nothing. The
# short-day gate also gives a floor: no peak before that day.

def daylength(lat, n=N_DAYS):
    """Hours from sunrise to sunset (sun's upper limb, refraction: 0.833° below the horizon),
    rows x days from 1 January, after Forsythe et al. (1995)."""
    doy = np.arange(1, n + 1)
    theta = 0.2163108 + 2 * np.arctan(0.9671396 * np.tan(0.00860 * (doy - 186)))
    phi = np.arcsin(0.39795 * np.cos(theta))
    la = np.radians(np.asarray(lat, float))[:, None]
    x = (np.sin(np.radians(0.8333)) + np.sin(la) * np.sin(phi)) / (np.cos(la) * np.cos(phi))
    return 24 - 24 / np.pi * np.arccos(np.clip(x, -1, 1))


def curves(t, lat, model):
    """(forcing so far, floor index or None) for rows x days `t` at latitudes `lat`."""
    kind, *p = model
    days = np.arange(t.shape[1])
    floor = None
    if kind in ("dd", "gate", "ptu"):
        start, base = p[0], p[1]
        rate = np.maximum(t - base, 0.0)
        if kind == "ptu":
            rate = rate * daylength(lat, t.shape[1]) / 12.0
        on = np.broadcast_to(days >= start, t.shape)
        if kind == "gate":  # the peak waits for the days to shorten to p[2] hours after midsummer
            short = (daylength(lat, t.shape[1]) <= p[2]) & (days > 171)
            floor = np.where(short.any(axis=1), short.argmax(axis=1), np.nan).astype(float)
    elif kind == "pstart":  # count from the day the day length first reaches p[0] hours
        hours, base = p
        long_ = daylength(lat, t.shape[1]) >= hours
        on = np.cumsum(long_, axis=1) > 0
        rate = np.maximum(t - base, 0.0)
    else:
        raise ValueError(kind)
    heat = np.cumsum(np.where(on, rate, 0.0), axis=1)
    return np.where(on, heat, np.nan), floor


def predict(curve, f, floor=None):
    done = curve >= f
    idx = done.argmax(axis=1).astype(float)
    idx[~done.any(axis=1)] = np.nan
    if floor is not None:
        idx = np.where(np.isfinite(floor), np.maximum(idx, floor), np.nan)  # NaN stays NaN
    return idx


def at(curve, obs):
    i = np.clip(np.rint(obs).astype(int), 0, curve.shape[1] - 1)
    return curve[np.arange(len(curve)), i]


def model_name(m):
    kind, *p = m
    if kind == "dd":
        return f"degree-days from {day_name(p[0])}, base {p[1]:g} °C"
    if kind == "ptu":
        return f"photothermal (degree-days x day length / 12 h) from {day_name(p[0])}, base {p[1]:g} °C"
    if kind == "pstart":
        return f"degree-days from the day length reaching {p[0]:g} h, base {p[1]:g} °C"
    if kind == "shift":
        return (f"normal-year date ({'latitude + elevation line' if p[2] == 'line' else 'one date'}) moved by "
                f"this year's lead in degree-days from {day_name(p[0])}, base {p[1]:g} °C")
    return f"degree-days from {day_name(p[0])}, base {p[1]:g} °C, not before the day length falls to {p[2]:g} h"


def day_name(idx, leap=False):
    """Day index from 1 January -> '23 Aug' (a non-leap year unless `leap`)."""
    d = date(2024 if leap else 2023, 1, 1) + timedelta(days=int(round(idx)))
    return f"{d.day} {d:%b}"


def folds(c, kind):
    """(train masks, test masks)."""
    if kind == "loyo":
        trains = [(c.year != y).to_numpy() for y in sorted(c.year.unique())]
        return trains, [~m for m in trains]
    a = (c.unit.isin(GB_IE) if kind == "gbie" else c.lat >= 55).to_numpy()
    return [a, ~a], [~a, a]


def lead(cv, ncv, d0):
    """Days after each row's normal-year date `d0` that this year's degree-days reach the sum a
    normal year has by then (negative: ahead of the normal year), NaN if they never do."""
    f = at(ncv, d0)
    done = cv >= f[:, None]
    idx = done.argmax(axis=1).astype(float)
    idx[~done.any(axis=1) | np.isnan(f)] = np.nan
    return idx - d0


def prepare(m, t, nt, lat):
    """The forcing curves a model needs: (curve, floor), or for "shift" this year's and the normal year's."""
    if m[0] == "shift":
        return tuple(curves(x, lat, ("dd", m[1], m[2]))[0] for x in (t, nt))
    return curves(t, lat, m)


def design(m, X):
    """The normal-year line's columns: [1, lat, elevation], or [1] for a fixed date."""
    return X if m[0] != "shift" or m[3] == "line" else X[:, :1]


def apply(m, prep, X, params, rows=slice(None)):
    """Predicted peak (day index) of `rows`."""
    if m[0] == "shift":
        beta, k = params
        d0 = design(m, X)[rows] @ beta
        return d0 + k * lead(prep[0][rows], prep[1][rows], d0)
    curve, floor = prep
    return predict(curve[rows], params, None if floor is None else floor[rows])


def fit(m, prep, X, obs, rows):
    """The constants fitted on `rows`: the requirement (median forcing on the observed day), or
    for "shift" the normal-year line beta and the share k of this year's lead the peak moves
    by, from obs = line + k * lead by least squares (the lead depends on the line: 3 rounds)."""
    if m[0] != "shift":
        return float(np.nanmedian(at(prep[0][rows], obs[rows])))
    Xm, o, cv, ncv = design(m, X)[rows], obs[rows], prep[0][rows], prep[1][rows]
    beta, k = np.linalg.lstsq(Xm, o, rcond=None)[0], 0.0
    for _ in range(3):
        a = lead(cv, ncv, Xm @ beta)
        ok = np.isfinite(a)
        k = float(np.clip(np.linalg.lstsq(np.column_stack([Xm[ok], a[ok]]), o[ok], rcond=None)[0][-1], 0, 1.5))
        beta = np.linalg.lstsq(Xm[ok], o[ok] - k * a[ok], rcond=None)[0]
    return beta, k


def params_name(m, params):
    if m[0] != "shift":
        return f"{params:.0f}"
    beta, k = params
    line = f"{beta[0]:.1f}" + (f" {beta[1]:+.3f}·lat {beta[2] * 100:+.2f}·elev/100 m" if len(beta) > 1 else "")
    return f"day {line}, k {k:.2f}"


def evaluate(c, m, prep, X, kind):
    """Errors (predicted - observed, days) of the model and the baselines over the folds."""
    trains, tests = folds(c, kind)
    obs, lat = c.obs.to_numpy(), c.lat.to_numpy()
    err = {k: np.full(len(c), np.nan) for k in ("model", "fixed", "latitude", "lat+elev")}
    req = []
    for train, test in zip(trains, tests):
        p = fit(m, prep, X, obs, train)
        req.append(p)
        err["model"][test] = apply(m, prep, X, p, test) - obs[test]
        err["fixed"][test] = np.median(obs[train]) - obs[test]
        k, b = np.polyfit(lat[train], obs[train], 1)
        err["latitude"][test] = k * lat[test] + b - obs[test]
        beta = np.linalg.lstsq(X[train], obs[train], rcond=None)[0]
        err["lat+elev"][test] = X[test] @ beta - obs[test]
    return err, req


def own_median(c, key=("lat", "lon")):
    """Each row's error if it were predicted by its place's median in its other years."""
    out = np.full(len(c), np.nan)
    keys = c[list(key)].astype(str).agg(",".join, axis=1).to_numpy()
    years, obs = c.year.to_numpy(), c.obs.to_numpy()
    for k in np.unique(keys):
        i = np.flatnonzero(keys == k)
        for j in i:
            other = i[years[i] != years[j]]
            if len(other):
                out[j] = np.median(obs[other]) - obs[j]
    return out


def skill(c, pred, key=("lat", "lon")):
    """Year to year and place to place, in-sample: within-place anomalies (places with >= 3
    years) and place means, observed against predicted."""
    d = c.assign(pred=pred, key=c[list(key)].astype(str).agg(",".join, axis=1))
    d = d[np.isfinite(d.pred)]
    cm = d.groupby("key")[["obs", "pred"]].mean()
    d = d[d.key.map(d.key.value_counts()) >= 3]
    if len(d) < 10 or len(cm) < 10 or d.pred.std() == 0:
        return dict(anom_r=np.nan, anom_slope=np.nan, anom_mae=np.nan, anom_zero=np.nan, anom_n=len(d),
                    space_r=np.nan, space_slope=np.nan)
    oa, pa = d.obs - d.groupby("key").obs.transform("mean"), d.pred - d.groupby("key").pred.transform("mean")
    return dict(anom_r=np.corrcoef(oa, pa)[0, 1], anom_slope=np.polyfit(pa, oa, 1)[0],
                anom_mae=float(np.mean(np.abs(oa - pa))), anom_zero=float(np.mean(np.abs(oa))), anom_n=len(d),
                space_r=np.corrcoef(cm.pred, cm.obs)[0, 1], space_slope=np.polyfit(cm.pred, cm.obs, 1)[0])


def mae(e, mask=None):
    e = e if mask is None else e[mask]
    return float(np.nanmean(np.abs(e))), int(np.isnan(e).sum())


def dwd_series(cache, lapse=True, tmaxmin=False):
    """DWD station-years with POWER at the station's cell, moved to the station's elevation."""
    d = dwd(cache)
    d = d[(d.idx >= 166) & (d.idx <= 273)].reset_index(drop=True)  # 15 June - 30 September: the rest are typos
    clat, clon = power_cell(d.lat, d.lon)
    d = d.assign(clat=clat, clon=clon)
    keep, temps = [], []
    for (a, b), g in d.groupby(["clat", "clon"]):
        s, e = power(a, b, cache, tmaxmin)
        for i, r in g.iterrows():
            x = season(s, r.year)
            if x is None:
                continue
            keep.append(i)
            temps.append(x + (bloom.LAPSE * (e - r.elev) if lapse and np.isfinite(r.elev) else 0.0))
    d = d.loc[keep].reset_index(drop=True).rename(columns={"idx": "obs"})
    return d.assign(ground=d.elev.fillna(d.elev.median())), np.array(temps)


def dwd_errors(d, m, prep, X):
    """Leave one year out on DWD's own constants, with the baselines."""
    obs, years = d.obs.to_numpy(), d.year.to_numpy()
    err = {k: np.full(len(d), np.nan) for k in ("model", "fixed", "lat+elev")}
    for y in np.unique(years):
        tr, te = years != y, years == y
        err["model"][te] = apply(m, prep, X, fit(m, prep, X, obs, tr), te) - obs[te]
        err["fixed"][te] = np.median(obs[tr]) - obs[te]
        beta = np.linalg.lstsq(X[tr], obs[tr], rcond=None)[0]
        err["lat+elev"][te] = X[te] @ beta - obs[te]
    return err


def xmat(df):
    return np.column_stack([np.ones(len(df)), df.lat.to_numpy(float), df.ground.to_numpy(float)])


def year_r(d, err):
    """Correlation of the yearly mean observed and predicted dates (leave one year out)."""
    yr = d.assign(pred=d.obs + err).groupby("year")[["obs", "pred"]].mean()
    return np.corrcoef(yr.obs, yr.pred)[0, 1], yr


# --- Report ------------------------------------------------------------------------

def table(header, rows):
    print("| " + " | ".join(header) + " |")
    print("|" + "|".join("---" for _ in header) + "|")
    for r in rows:
        print("| " + " | ".join(str(x) for x in r) + " |")
    print()


def select(allrec, which):
    """The records a set uses: annotated flowering, or the records in a window not annotated otherwise."""
    m, d = allrec.date.dt.month, allrec.date.dt.day
    plain = allrec.phen != "other"
    return allrec[{"flowering": allrec.flowering,
                   "jun_oct": plain,
                   "jul_sep": plain & m.isin([7, 8, 9]),
                   "aug": plain & ((m == 8) | ((m == 9) & (d <= 15)))}[which]]


def proxy_check(allrec):
    """Cell-years with >= MIN_RECORDS flowering records: each plain set's median against theirs."""
    clat, clon = power_cell(allrec.lat, allrec.lon)
    a = allrec.assign(clat=clat, clon=clon)
    fl = a[a.flowering].groupby(["clat", "clon", "year"]).idx.agg(["median", "size"])
    fl = fl[fl["size"] >= MIN_RECORDS]
    rows = []
    for name in ("jun_oct", "jul_sep", "aug"):
        p = select(a, name).groupby(["clat", "clon", "year"]).idx.agg(["median", "size"])
        j = fl.join(p, rsuffix="_p", how="inner")
        j = j[j.size_p >= MIN_RECORDS]
        dd = j.median_p - j["median"]
        rows.append((name, len(j), f"{dd.mean():+.1f}", f"{dd.abs().mean():.1f}", f"{dd.abs().max():.0f}",
                     f"{np.corrcoef(j.median_p, j['median'])[0, 1]:.2f}"))
    print(f"## Plain records as a stand-in for the flowering annotation ({len(fl)} cell-years with "
          f">= {MIN_RECORDS} flowering records, {sorted(set(fl.index.get_level_values(2)))})\n")
    table(["set", "cell-years", "median minus the flowering median (mean)", "mean absolute", "largest", "r"], rows)
    # Of the annotated records, the share that say flowering, by half month.
    ann = a[a.phen != ""]
    half = ann.date.dt.month.astype(str) + np.where(ann.date.dt.day <= 15, "a", "b")
    s = ann.groupby(half).flowering.agg(["size", "mean"])
    print("Annotated records flowering, by half month (a = 1-15, b = 16-end): "
          + ", ".join(f"{k} {v['mean']:.0%} of {int(v['size'])}" for k, v in s.iterrows()) + "\n")


def grid_models():
    starts = (MAR1, 74, APR1, 105, MAY1, 135, JUN1)  # 1 Mar, 15 Mar, 1 Apr, 15 Apr, 1 May, 15 May, 1 Jun
    bases = (0, 2, 4, 5, 6, 8, 10)
    return ([("dd", s, b) for s in starts for b in bases]
            + [("ptu", s, b) for s in starts for b in bases]
            + [("pstart", h, b) for h in (12, 13, 14, 15, 16) for b in bases]
            + [("gate", s, b, h) for s in (MAR1, APR1, MAY1) for b in (0, 5, 10) for h in (13.5, 14, 14.5, 15, 15.5)]
            + [("shift", s, b, d0) for s in (MAR1, APR1, MAY1, JUN1) for b in (0, 5, 10) for d0 in ("fixed", "line")])


def parse_model(spec):
    kind, *p = spec.split(",")
    if kind == "shift":
        return kind, int(p[0]), float(p[1]), p[2]
    return (kind, *[float(x) if (kind == "pstart" and i == 0) or i > 0 else int(x) for i, x in enumerate(p)])


def forecast(m, params, t, nt, lat, X):
    """The fitted model's peak (day index) for new rows: this year's series `t`, the normal year's `nt`."""
    return apply(m, prepare(m, t, nt, lat), X, params)


def score(c, t, nt, d, dt, dnt, m):
    """Every test's MAE for one model."""
    X, dX = xmat(c), xmat(d)
    prep, dprep = prepare(m, t, nt, c.lat.to_numpy()), prepare(m, dt, dnt, d.lat.to_numpy())
    out = dict(model=m)
    for kind in ("loyo", "gbie", "ns"):
        e, _ = evaluate(c, m, prep, X, kind)
        out[kind], out[kind + "_none"] = mae(e["model"])
    de = dwd_errors(d, m, dprep, dX)
    out["dwd"], out["dwd_none"] = mae(de["model"])
    out["dwd_year_r"] = year_r(d, de["model"])[0]
    out["dwd_anom_r"] = skill(d, d.obs.to_numpy() + de["model"], ("station",))["anom_r"]
    every = np.ones(len(c), bool)
    p = fit(m, prep, X, c.obs.to_numpy(), every)
    out["requirement"] = params_name(m, p)
    out.update(skill(c, apply(m, prep, X, p)))
    none = out["loyo_none"] + out["gbie_none"] + out["ns_none"]
    out["cost"] = (out["loyo"] + (out["gbie"] + out["ns"]) / 2 + out["dwd"] + 30 * none / (3 * len(c))
                   + 30 * out["dwd_none"] / len(d))
    return out


def main():
    global MIN_RECORDS
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cache", type=Path, default=Path.home() / ".cache" / "funges-heather")
    ap.add_argument("--records", choices=("flowering", "jun_oct", "jul_sep", "aug"), default="jul_sep")
    ap.add_argument("--strict-accuracy", action="store_true")
    ap.add_argument("--grid", action="store_true")
    ap.add_argument("--no-where", action="store_true")
    ap.add_argument("--no-lapse", action="store_true", help="keep POWER at its grid elevation")
    ap.add_argument("--keep-sea", action="store_true", help=f"keep POWER cells under {MIN_LAND * 100:.0f}%% land")
    ap.add_argument("--tmaxmin", action="store_true", help="(T2M_MAX + T2M_MIN) / 2 instead of T2M")
    ap.add_argument("--model", help="one setting to report instead of the recommended one, e.g. shift,59,0,fixed")
    ap.add_argument("--dem", type=Path, default=DEM_DIR, help="EU-DEM v1.1 tiles (EPSG:3035)")
    ap.add_argument("--wilderness", nargs="+", type=Path, help="NE and SE wilderness GeoJSON")
    ap.add_argument("--min-records", type=int, default=MIN_RECORDS, help="records a cell-year needs")
    ap.add_argument("--family", help="search only these grid families, e.g. shift or dd,shift")
    ap.add_argument("--masters", action="store_true",
                    help="read the NE and SE masters (NE_WEATHER_DATA, SE_WEATHER_DATA in .env) if not cached")
    args = ap.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    lapse = not args.no_lapse
    MIN_RECORDS = args.min_records

    allrec = records(args.cache, args.strict_accuracy)
    allrec["unit"] = cb.units(allrec, args.cache)
    rec = select(allrec, args.records)
    print(f"# Records: {len(allrec)} research grade, June-October 2016-2026, not obscured, coordinates good to "
          f"1 km{'' if args.strict_accuracy else ' or of unknown accuracy'}; {int(allrec.flowering.sum())} "
          f"annotated flowering, {int((allrec.phen == 'other').sum())} annotated otherwise; using "
          f"{args.records}: {len(rec)}\n")
    table(["year", "records", "annotated flowering", args.records],
          [(y, int((allrec.year == y).sum()), int((allrec.flowering & (allrec.year == y)).sum()),
            int((rec.year == y).sum())) for y in YEARS])
    mon = allrec.date.dt.month
    table(["month", "records", "annotated flowering", "annotated otherwise"],
          [(k, int((mon == k).sum()), int((allrec.flowering & (mon == k)).sum()),
            int(((allrec.phen == "other") & (mon == k)).sum())) for k in range(6, 11)])
    table(["map unit", "records", "share"], [(u, n, f"{n / len(rec):.1%}")
                                             for u, n in rec.unit.fillna("sea").value_counts().head(20).items()])
    proxy_check(allrec)

    c, t = cells(rec, args.cache, lapse, args.tmaxmin, args.dem)
    sea = (c.land < MIN_LAND).to_numpy()
    print(f"POWER cells under {MIN_LAND:.0%} land: {c[sea][['lat', 'lon']].drop_duplicates().shape[0]} cells, "
          f"{int(sea.sum())} cell-years, {'kept' if args.keep_sea else 'dropped'}.\n")
    dz = c.ground - c.elev
    print(f"Records' median ground elevation minus POWER's grid elevation: median {np.median(dz):+.0f} m, "
          f"10-90% {np.percentile(dz, 10):+.0f} to {np.percentile(dz, 90):+.0f} m; the series are "
          f"{'moved at 6.5 °C/km' if lapse else 'not moved'}; temperature "
          f"{'(T2M_MAX + T2M_MIN) / 2' if args.tmaxmin else 'T2M'}.\n")
    if not args.keep_sea:
        c, t = c[~sea].reset_index(drop=True), t[~sea]
    gbie = c.unit.isin(GB_IE).to_numpy()
    print(f"Cell-years with >= {MIN_RECORDS} records: {len(c)} in {c[['lat', 'lon']].drop_duplicates().shape[0]} "
          f"cells, {c.n.sum()} records; GB + IE {int(gbie.sum())}, continent {int((~gbie).sum())}; >= 55° N "
          f"{int((c.lat >= 55).sum())}, south of it {int((c.lat < 55).sum())}. Median spread of a cell-year's "
          f"records (IQR): {c.iqr.median():.0f} days.\n")
    table(["year", "cell-years", "median observed peak"],
          [(y, len(g), day_name(g.obs.median())) for y, g in c.groupby("year")])
    table(["map unit", "cell-years", "median latitude", "median observed peak", "IQR across cell-years"],
          [(u, len(g), f"{g.lat.median():.1f}", day_name(g.obs.median()),
            f"{np.subtract(*np.percentile(g.obs, [75, 25])):.0f} d") for u, g in c.groupby("unit") if len(g) >= 5])
    band = pd.cut(c.lat, [35, 45, 50, 52, 54, 56, 58, 60, 72])
    table(["latitude", "cell-years", "median observed peak", "median elevation"],
          [(str(k), len(g), day_name(g.obs.median()), f"{g.ground.median():.0f} m")
           for k, g in c.groupby(band, observed=True)])
    ebands = pd.cut(c.ground, [-50, 100, 250, 500, 3000])
    table(["records' elevation", "cell-years", "median observed peak", "median latitude"],
          [(str(k), len(g), day_name(g.obs.median()), f"{g.lat.median():.1f}")
           for k, g in c.groupby(ebands, observed=True)])

    d, dt = dwd_series(args.cache, lapse, args.tmaxmin)
    ym = d.groupby("year").obs.median()
    print(f"DWD 'Heidekraut, Blüte Beginn': {len(d)} station-years at {d.station.nunique()} stations, "
          f"{d.year.min()}-{d.year.max()}, median {day_name(d.obs.median())}; yearly medians "
          f"{day_name(ym.min())} - {day_name(ym.max())}.\n")

    # The normal year (1991-2020, as production's normals) at each row, for the "shift" family.
    normals = dict(np.load(r2.generated(ROOT / "backend" / "generated" / "bloom_normals_EU.npz")))
    nt = bloom.daily_normals(normals, c.lat.to_numpy(), c.lon.to_numpy(),
                             (c.elev if args.no_lapse else c.ground).to_numpy(), date(2027, 1, 1), N_DAYS)
    dnt = bloom.daily_normals(normals, d.lat.to_numpy(), d.lon.to_numpy(), d.ground.to_numpy(), date(2027, 1, 1),
                              N_DAYS)

    # --- 5. the family and the grid ---
    models = [parse_model(args.model)] if args.model and not args.grid else grid_models()
    if args.family:
        models = [x for x in models if x[0] in args.family.split(",")]
    s = pd.DataFrame([score(c, t, nt, d, dt, dnt, m) for m in models])
    s["kind"] = s.model.str[0]
    head = ["model", "LOYO", "transfer GB+IE/cont.", "transfer N/S", "DWD (own fit)", "total", "no peak",
            "constants (all cell-years)", "year-to-year r (iNat)", "DWD year r", "spatial slope"]

    def line(r):
        return (model_name(r.model), f"{r.loyo:.2f}", f"{r.gbie:.2f}", f"{r.ns:.2f}", f"{r.dwd:.2f}",
                f"{r.cost:.2f}", r.loyo_none + r.gbie_none + r.ns_none + r.dwd_none, r.requirement,
                f"{r.anom_r:.2f}", f"{r.dwd_year_r:.2f}", f"{r.space_slope:.2f}")
    dd = s[s.kind == "dd"]
    dd = dd.assign(start=dd.model.str[1], base=dd.model.str[2])
    if len(dd) > 1:
        for col, title in (("loyo", "leave-one-year-out MAE"), ("gbie", "transfer GB + IE <-> continent MAE"),
                           ("ns", "transfer north <-> south of 55° N MAE"),
                           ("dwd", "DWD first flowering, leave one year out on its own requirement, MAE"),
                           ("dwd_year_r", "DWD yearly means, r")):
            print(f"## 5. Degree-days from a fixed date: {title}, by start and base\n")
            piv = dd.pivot(index="start", columns="base", values=col)
            table(["start"] + [f"{b:g} °C" for b in piv.columns],
                  [[day_name(i)] + [f"{v:.2f}" for v in r] for i, r in piv.iterrows()])
    families = [k for k in FAMILIES if (s.kind == k).any()]
    for kind in families:
        print(f"## 5. {FAMILIES[kind]}: best settings by the total\n")
        table(head, [line(r) for r in s[s.kind == kind].sort_values("cost").head(99 if args.grid else 6)
                     .itertuples()])
    best = {k: s[s.kind == k].loc[s[s.kind == k].cost.idxmin()] for k in families}
    print("## 5. Best of each family (total = LOYO + mean transfer + DWD; a cell-year without a peak counts 30 d)\n")
    table(["family"] + head, [(FAMILIES[k], *line(r)) for k, r in best.items()])
    if args.grid:
        print(s.drop(columns=["kind"]).sort_values("cost").to_string(), "\n")

    # The recommended model: the best total, unless a plain degree-day model is within half a day.
    # The totals of the best settings differ by less than the iNaturalist medians' noise, so among
    # those within a quarter day of the best, the one with the best DWD year-to-year r is taken:
    # DWD's 26 years are the cleanest evidence of how the weather moves the bloom.
    top = min(best.values(), key=lambda r: r.cost)
    near = s[s.cost <= top.cost + 0.25]
    pick = near.loc[near.dwd_year_r.idxmax()]
    print(f"{len(near)} settings within 0.25 d of the best total ({top.cost:.2f}); the best DWD year-to-year r "
          f"among them: {model_name(pick.model)} (r {pick.dwd_year_r:.2f}, total {pick.cost:.2f}).\n")
    m = best["dd"].model if "dd" in best and best["dd"].cost <= top.cost + 0.5 else pick.model
    if args.model:
        m = parse_model(args.model)
    report(m, c, t, nt, d, dt, dnt, normals, allrec, args, lapse)


FAMILIES = {"dd": "degree-days from a fixed date", "ptu": "photothermal units", "pstart": "photoperiod start",
            "gate": "short-day gate", "shift": "a normal-year date moved by this year's warmth"}


def report(m, c, t, nt, d, dt, dnt, normals, allrec, args, lapse):
    print(f"# {'Chosen with --model' if args.model else 'Recommended'}: {model_name(m)}\n")
    lat, obs, X = c.lat.to_numpy(), c.obs.to_numpy(), xmat(c)
    prep = prepare(m, t, nt, lat)
    every = np.ones(len(c), bool)
    p_all = fit(m, prep, X, obs, every)
    pred = apply(m, prep, X, p_all)
    sk = skill(c, pred)
    print(f"Constants on all {len(c)} cell-years: {params_name(m, p_all)}\n")
    print(f"In-sample skill. Year to year, within {sk['anom_n']} cell-years of cells with >= 3 years: "
          f"r = {sk['anom_r']:.2f}, slope of observed on predicted {sk['anom_slope']:.2f}, MAE of the anomaly "
          f"{sk['anom_mae']:.2f} d against {sk['anom_zero']:.2f} d for a normal year. Place to place, cell means: "
          f"r = {sk['space_r']:.2f}, slope {sk['space_slope']:.2f}.\n")
    if args.records != "flowering":
        cf, _ = cells(select(allrec, "flowering"), args.cache, lapse, args.tmaxmin, args.dem)
        same = c.merge(cf, on=["lat", "lon", "year"], suffixes=("_p", "_f"))
        gap = same.obs_p - same.obs_f
        print(f"Flowering-annotated cell-years: {len(cf)}; on the {len(same)} with both sets the {args.records} "
              f"median runs {gap.mean():+.1f} d (median {gap.median():+.1f}) after the flowering median; "
              f"r = {np.corrcoef(same.obs_p, same.obs_f)[0, 1]:.2f}.\n")
    reg = c.unit.replace({"NIR": "IRL", "IMN": "ENG"})
    bias = pd.Series(pred - obs).groupby(reg.to_numpy())
    table(["region (in-sample)", "cell-years", "bias, predicted - observed (d)", "MAE (d)"],
          [(k, len(g), f"{g.mean():+.1f}", f"{g.abs().mean():.1f}") for k, g in bias if len(g) >= 5])

    # --- 1. leave one year out, with baselines ---
    e, req = evaluate(c, m, prep, X, "loyo")
    clim = own_median(c)
    rows = []
    for i, y in enumerate(sorted(c.year.unique())):
        k = (c.year == y).to_numpy()
        rows.append((y, int(k.sum()), params_name(m, req[i]), *(f"{mae(e[x], k)[0]:.1f}" for x in e),
                     f"{np.nanmean(e['model'][k]):+.1f}"))
    rows.append(("all", len(c), "", *(f"**{mae(e[x])[0]:.2f}**" for x in e), f"{np.nanmean(e['model']):+.1f}"))
    print("## 1. Leave one year out (MAE, days)\n")
    table(["held-out year", "cell-years", "constants", "model", "fixed date", "latitude line", "lat + elev line",
           "model bias"], rows)
    has = np.isfinite(clim)
    print(f"Cell-years whose cell has other years: {int(has.sum())}. On those: model {mae(e['model'], has)[0]:.2f}, "
          f"the cell's own median in its other years {mae(clim, has)[0]:.2f}, fixed date "
          f"{mae(e['fixed'], has)[0]:.2f}, latitude line {mae(e['latitude'], has)[0]:.2f}, lat + elev line "
          f"{mae(e['lat+elev'], has)[0]:.2f} days; without a peak: {mae(e['model'])[1]}\n")
    yr = c.assign(pred=e["model"] + obs).groupby("year")[["obs", "pred"]].mean()
    print(f"Year means, observed vs predicted (LOYO): r = {np.corrcoef(yr.obs, yr.pred)[0, 1]:.2f}, "
          f"observed spread (SD) {yr.obs.std():.1f} d, predicted {yr.pred.std():.1f} d\n")
    big = (c.n >= 20).to_numpy()
    print(f"Cell-years with >= 20 records ({int(big.sum())}): model {mae(e['model'], big)[0]:.2f}, fixed date "
          f"{mae(e['fixed'], big)[0]:.2f}, lat + elev line {mae(e['lat+elev'], big)[0]:.2f}, own median "
          f"{mae(clim, big & has)[0]:.2f} days\n")

    # --- 2. transfer ---
    print("## 2. Geographic transfer (MAE, days)\n")
    rows = []
    for kind, names in (("gbie", ("GB + IE", "continent")), ("ns", (">= 55° N", "< 55° N"))):
        e, req = evaluate(c, m, prep, X, kind)
        for j, te in enumerate(folds(c, kind)[1]):
            rows.append((names[j], names[1 - j], int(te.sum()), params_name(m, req[j]),
                         *(f"{mae(e[x], te)[0]:.1f}" for x in e), f"{np.nanmean(e['model'][te]):+.1f}",
                         mae(e["model"], te)[1]))
    table(["fitted on", "tested on", "cell-years", "constants", "model", "fixed date", "latitude line",
           "lat + elev line", "model bias", "without a peak"], rows)

    # --- 3. DWD ---
    dX = xmat(d)
    dprep = prepare(m, dt, dnt, d.lat.to_numpy())
    de = dwd_errors(d, m, dprep, dX)
    dclim = own_median(d, ("station",))
    r_year, yr = year_r(d, de["model"])
    dsk = skill(d, d.obs.to_numpy() + de["model"], ("station",))
    p_dwd = fit(m, dprep, dX, d.obs.to_numpy(), np.ones(len(d), bool))
    print(f"## 3. DWD first flowering (Heidekraut, Blüte Beginn), {len(d)} station-years, "
          f"{d.station.nunique()} stations, {d.year.min()}-{d.year.max()}\n")
    has = np.isfinite(dclim)
    print(f"Leave one year out on DWD's own constants ({params_name(m, p_dwd)}; the iNaturalist peak's: "
          f"{params_name(m, p_all)}): model {mae(de['model'])[0]:.2f} d, fixed date {mae(de['fixed'])[0]:.2f}, "
          f"lat + elev line {mae(de['lat+elev'])[0]:.2f}; on station-years whose station has other years "
          f"({int(has.sum())}): model {mae(de['model'], has)[0]:.2f}, the station's own median "
          f"{mae(dclim, has)[0]:.2f}.\n")
    yfix = np.array([np.median(d.obs[d.year != y]) for y in yr.index])
    print(f"Year to year: yearly mean dates r = {r_year:.2f} (observed SD {yr.obs.std():.1f} d, predicted "
          f"{yr.pred.std():.1f} d; MAE of the yearly means {np.mean(np.abs(yr.pred - yr.obs)):.2f} d against "
          f"{np.mean(np.abs(yfix - yr.obs)):.2f} d for a fixed date); within-station anomalies r = "
          f"{dsk['anom_r']:.2f}, slope {dsk['anom_slope']:.2f}, anomaly MAE {dsk['anom_mae']:.2f} d against "
          f"{dsk['anom_zero']:.2f} for a normal year.\n")
    table(["year", "station-years", "observed mean", "predicted mean (LOYO)", "error"],
          [(y, int((d.year == y).sum()), day_name(r.obs), day_name(r.pred), f"{r.pred - r.obs:+.1f}")
           for y, r in yr.iterrows()])
    pk = apply(m, dprep, dX, p_all) - d.obs.to_numpy()
    print(f"The iNaturalist fit at the DWD stations: predicted peak minus DWD's first flowering, median "
          f"{np.nanmedian(pk):+.0f} d (IQR {np.nanpercentile(pk, 25):+.0f} to {np.nanpercentile(pk, 75):+.0f}).\n")

    # --- the normal year at the cells, and WeatherAPI ---
    n_err = forecast(m, p_all, nt, nt, lat, X) - obs
    print(f"Normals only (1991-2020) at the cells: MAE {mae(n_err)[0]:.2f} d, bias {np.nanmean(n_err):+.1f} d. "
          f"Daily POWER, in-sample: MAE {mae(pred - obs)[0]:.2f} d.\n")
    weatherapi(c, t, nt, m, p_all, args)
    dry_run(m, p_all, normals, args)
    if not args.no_where:
        where(allrec, m, p_all, normals, args)


def weatherapi(c, t, nt, m, params, args):
    """WeatherAPI (the masters' daily (Tmax + Tmin) / 2) minus POWER at the calibration's cells, 2026."""
    frames = []
    for region, key in (("NE", "NE_WEATHER_DATA"), ("SE", "SE_WEATHER_DATA")):
        path = args.cache / "master" / f"{region}_power_cells.parquet"
        if not path.exists() and args.masters:
            import build_season_curves as bsc

            bsc.load_dotenv(ROOT / ".env")
            master_cells(bsc.get_required_env(key), args.cache, region)
        if path.exists():
            frames.append(pd.read_parquet(path).assign(region=region))
    if not frames:
        print("WeatherAPI against POWER: no master cached (--masters reads them).\n")
        return
    w = pd.concat(frames)
    w = w[w.points >= 3]  # a cell's mean from at least 3 base points
    rows, per_cell = [], []
    for (a, b), g in c[["lat", "lon"]].drop_duplicates().groupby(["lat", "lon"]):
        mw = w[(w.clat == a) & (w.clon == b)].drop_duplicates("date").set_index("date")
        if len(mw) < 100:
            continue
        s2m, elev = power(a, b, args.cache)
        smm, _ = power(a, b, args.cache, tmaxmin=True)
        shift = bloom.LAPSE * (elev - mw.elev.mean())  # POWER moved to the base points' mean elevation
        j = pd.DataFrame({"w": mw.t, "t2m": s2m.reindex(mw.index) + shift, "mm": smm.reindex(mw.index) + shift})
        j = j[j.index <= pd.Timestamp(POWER_SPAN[1])].dropna()
        unit = c[(c.lat == a) & (c.lon == b)].unit.mode().iloc[0]
        for lo, hi, name in (("2026-04-12", "2026-05-31", "12 Apr - 31 May"), ("2026-06-01", "2026-09-30",
                                                                               "June - September")):
            k = j[lo:hi]
            per_cell.append(dict(lat=a, lon=b, unit=unit, period=name, d_t2m=(k.w - k.t2m).mean(),
                                 d_mm=(k.w - k.mm).mean(), r=np.corrcoef(k.w - k.w.mean(), k.t2m)[0, 1]))
    p = pd.DataFrame(per_cell)
    for name, g in p.groupby("period", sort=False):
        gb = g.unit.isin(GB_IE)
        rows.append((name, len(g), f"{g.d_t2m.mean():+.2f}", f"{g.d_t2m.median():+.2f}",
                     f"{g[gb].d_t2m.mean():+.2f}", f"{g[~gb].d_t2m.mean():+.2f}", f"{g.d_mm.mean():+.2f}",
                     f"{g.r.median():.2f}"))
    print("## WeatherAPI minus POWER at the calibration's cells, 2026 (°C, POWER moved to the base points' "
          "elevation)\n")
    table(["period", "cells", "minus T2M, mean", "median", "GB + IE", "continent",
           "minus (T2M_MAX + T2M_MIN) / 2", "daily r"], rows)
    off = float(p[p.period == "June - September"].d_t2m.mean())
    k = (c.year == 2026).to_numpy()
    lat, X = c.lat.to_numpy()[k], xmat(c)[k]
    shift = forecast(m, params, t[k] + off, nt[k], lat, X) - forecast(m, params, t[k], nt[k], lat, X)
    print(f"A {off:+.2f} °C offset in every day of 2026 moves the 2026 peaks {np.nanmean(shift):+.1f} d (range "
          f"{np.nanmin(shift):+.0f} to {np.nanmax(shift):+.0f}).\n")


def cell_elevation(lat, lon, dem_dir):
    """The mean ground elevation of each place's 0.1° cell (11 x 11 points of EU-DEM), as production's
    cell mean of its base points; and the place's own."""
    g = np.linspace(-0.05, 0.05, 11)
    cy, cx = np.rint(np.asarray(lat) / bloom.CELL) * bloom.CELL, np.rint(np.asarray(lon) / bloom.CELL) * bloom.CELL
    la = (cy[:, None, None] + g[None, :, None] + 0 * g[None, None, :]).ravel()
    lo = (cx[:, None, None] + 0 * g[None, :, None] + g[None, None, :]).ravel()
    e = dem_elevations(la, lo, dem_dir).reshape(len(cy), -1)
    with np.errstate(invalid="ignore"):
        e = np.where(e > 0, e, np.nan)
    return np.nanmean(e, axis=1), dem_elevations(lat, lon, dem_dir)


def dry_run(m, params, normals, args):
    """A normal year (normals only, as the map shows before the season) and 2026 (POWER) at the heaths."""
    lat, lon = np.array([h[1] for h in HEATHS]), np.array([h[2] for h in HEATHS])
    cell_e, site_e = cell_elevation(lat, lon, args.dem)
    nt = bloom.daily_normals(normals, lat, lon, cell_e, date(2027, 1, 1), N_DAYS)
    X = np.column_stack([np.ones(len(lat)), lat, cell_e])
    normal = forecast(m, params, nt, nt, lat, X)
    y26 = []
    for (name, a, b), e in zip(HEATHS, cell_e):
        pa, pb = power_cell(a, b)
        s, pe = power(float(pa), float(pb), args.cache, args.tmaxmin)
        y26.append(season(s, 2026) + bloom.LAPSE * (pe - e))
    p26 = forecast(m, params, np.array(y26), nt, lat, X)
    print("## 6. A normal year and 2026 (POWER) at well-known heaths (at the 0.1° cell's mean elevation)\n")
    table(["heath", "site elevation", "cell elevation", "normal-year peak", "2026 peak (POWER)", "published"],
          [(h[0], f"{a:.0f} m", f"{b:.0f} m", day_name(p) if np.isfinite(p) else "none",
            day_name(q) if np.isfinite(q) else "none", PUBLISHED.get(h[0], "-"))
           for h, a, b, p, q in zip(HEATHS, site_e, cell_e, normal, p26)])
    press(m, params, normals, args)


def press(m, params, normals, args):
    """The press series (PRESS): each year's reported date against the model at the place, with the
    iNaturalist constants and, leave one year out, the place's own (its own requirement, or for
    "shift" its own normal-year date)."""
    if not PRESS:
        return
    print("## 4. Press reports, year by year\n")
    rows = []
    own_m = m if m[0] != "shift" else ("shift", m[1], m[2], "fixed")
    for place, (a, b, stage, years) in PRESS.items():
        e, _ = cell_elevation(np.array([a]), np.array([b]), args.dem)
        pa, pb = power_cell(a, b)
        s, pe = power(float(pa), float(pb), args.cache, args.tmaxmin)
        ys = sorted(y for y in years if season(s, y) is not None)
        tt = np.array([season(s, y) + bloom.LAPSE * (pe - e[0]) for y in ys])
        la = np.full(len(ys), a)
        nt = bloom.daily_normals(normals, la, np.full(len(ys), b), np.full(len(ys), e[0]), date(2027, 1, 1), N_DAYS)
        X = np.column_stack([np.ones(len(ys)), la, np.full(len(ys), e[0])])
        pred = forecast(m, params, tt, nt, la, X)
        obs = np.array([(pd.Timestamp(f"{y}-{years[y]}") - pd.Timestamp(y, 1, 1)).days for y in ys], float)
        prep = prepare(own_m, tt, nt, la)
        idx = np.arange(len(ys))
        own = np.array([apply(own_m, prep, X, fit(own_m, prep, X, obs, idx != i), idx == i)[0]
                        for i in idx]) - obs
        fixed = np.array([np.median(np.delete(obs, i)) for i in range(len(ys))]) - obs
        for y, o, q, w in zip(ys, obs, pred, own):
            rows.append((place, y, day_name(o), day_name(q), f"{q - o:+.0f}", f"{w:+.0f}"))
        if len(ys) >= 4:
            print(f"{place} ({stage}): {len(ys)} years; with the iNaturalist constants MAE "
                  f"{mae(pred - obs)[0]:.1f} d (bias {np.nanmean(pred - obs):+.1f}); its own constants, leave one "
                  f"year out, {mae(own)[0]:.1f} d; its own fixed date, leave one year out, {mae(fixed)[0]:.1f} d; "
                  f"r(observed, predicted) = {np.corrcoef(obs, pred)[0, 1]:.2f}\n")
    table(["place", "year", "reported", "predicted peak", "error", "error, own constants (LOYO)"], rows)


# --- Where to draw it ------------------------------------------------------------

CORINE = "https://image.discomap.eea.europa.eu/arcgis/rest/services/Corine/CLC2018_WM/MapServer/"
CLASSES = (311, 312, 313, 321, 322, 323, 324, 333)
GROUNDS = [(322,), (322, 324), (322, 333), (322, 324, 333), (321, 322), (321, 322, 324, 333), CLASSES]
FJELL_CAP = 300  # m: north of 58° N, 322 polygons whose middle is higher are fjell heath, not ling


def corine_class(lat, lon, cache):
    """The CORINE 2018 code under each point (EEA's map service, one cached call per point)."""
    out = []
    for a, b in zip(lat, lon):
        q = {"geometry": f"{b:.5f},{a:.5f}", "geometryType": "esriGeometryPoint", "sr": 4326, "layers": "all:0",
             "tolerance": 0, "mapExtent": f"{b - 0.01},{a - 0.01},{b + 0.01},{a + 0.01}",
             "imageDisplay": "100,100,96", "returnGeometry": "false", "f": "json"}
        js = cb.fetch_json(CORINE + "identify?" + urllib.parse.urlencode(q),
                           cache / "corine" / f"{a:.5f}_{b:.5f}.json.gz", lambda j: "results" in j, pause=0.3)
        codes = [r["attributes"].get("Code_18") for r in js["results"] if r.get("layerId") == 0]
        out.append(int(codes[0]) if codes and codes[0] and codes[0].isdigit() else 0)  # 0: none (sea, off the map)
    return np.array(out)


def corine_areas(cache, boxes):
    """CORINE 2018 area (km²) by code within each box (polygons intersecting it)."""
    out = {}
    for name, (w, s, e, n) in boxes.items():
        q = {"where": "Code_18 IN ('321','322','324','333','411','412')", "geometry": f"{w},{s},{e},{n}",
             "geometryType": "esriGeometryEnvelope", "inSR": 4326, "spatialRel": "esriSpatialRelIntersects",
             "groupByFieldsForStatistics": "Code_18", "f": "json",
             "outStatistics": json.dumps([{"statisticType": "sum", "onStatisticField": "Area_Ha",
                                           "outStatisticFieldName": "ha"}])}
        js = cb.fetch_json(CORINE + "0/query?" + urllib.parse.urlencode(q), cache / "corine" / f"areas_{name}.json.gz",
                           lambda j: "features" in j, pause=1.0)
        out[name] = {int(f["attributes"]["Code_18"]): f["attributes"]["ha"] / 100 for f in js["features"]}
    return out


def where(allrec, m, params, normals, args):
    """Ground: the share of sightings each class of the app's wilderness polygons keeps, the range, and size."""
    import geopandas as gpd
    import shapely

    print("# Where to draw it\n")
    macro, prior, rel = range_grids(args.cache)
    lat0, lon0 = macro["lat"][0], macro["lon"][0]
    rec = allrec.drop_duplicates("id").reset_index(drop=True)
    rec = rec.assign(rel=cb.lookup(rel, lat0, lon0, 0.1, rec.lat, rec.lon, 0.0),
                     prior=cb.lookup(prior, lat0, lon0, 0.1, rec.lat, rec.lon, 1.0))
    print(f"Sightings: {len(rec)} research-grade records, June-October 2016-2026.\n")
    table(["range mask", "sightings kept"],
          [(f"relative share >= {x:g}", f"{(rec.rel >= x).mean():.1%}") for x in (0.05, 0.1, 0.2, 0.3, 0.5, 1.0)]
          + [("range prior >= 0.5", f"{(rec.prior >= 0.5).mean():.1%}")])
    if not args.wilderness:
        print("No --wilderness polygons given: the ground tables are skipped.\n")
        return
    poly = pd.concat([gpd.read_file(p, columns=["raster_val"]) for p in args.wilderness], ignore_index=True)
    poly = poly[poly.raster_val.isin(CLASSES)].reset_index(drop=True)
    poly["raster_val"] = poly.raster_val.astype(int)
    rp = poly.representative_point()
    poly["rel"] = cb.lookup(rel, lat0, lon0, 0.1, rp.y, rp.x, 0.0)
    poly3 = poly.to_crs(3035)
    poly["km2"] = poly3.area / 1e6
    pts = gpd.GeoSeries(gpd.points_from_xy(rec.lon, rec.lat), crs=4326).to_crs(3035).values

    def near(mask, dist):
        """Which sightings lie within `dist` m of the polygons in `mask`."""
        tree = shapely.STRtree(poly3.geometry.values[mask])
        hit = np.zeros(len(pts), bool)
        if dist == 0:
            hit[np.unique(tree.query(pts, predicate="intersects")[0])] = True
        else:
            hit[np.unique(tree.query(pts, predicate="dwithin", distance=dist)[0])] = True
        return hit

    rows, hits = [], {}
    for k in CLASSES:
        mask = (poly.raster_val == k).to_numpy()
        h = [near(mask, x) for x in (0, 300, 1000)]
        hits[(k,)] = h
        rows.append((k, int(mask.sum()), f"{poly.km2[mask].sum():,.0f}", *(f"{x.mean():.1%}" for x in h)))
    print("## Sightings on the app's wilderness polygons, by CORINE class (NE + SE)\n")
    table(["class", "polygons", "km²", "in", "within 300 m", "within 1 km"], rows)
    rows = []
    for combo in GROUNDS:
        for thr in (0.0, 0.1, 0.3, 0.5, 1.0):
            mask = (poly.raster_val.isin(combo) & (poly.rel >= thr)).to_numpy()
            h = [near(mask, x) for x in (0, 300, 1000)]
            hits[(combo, thr)] = h
            rows.append(("+".join(map(str, combo)), f">= {thr:g}", int(mask.sum()), f"{poly.km2[mask].sum():,.0f}",
                         *(f"{x.mean():.1%}" for x in h)))
    print("## Candidate grounds: classes, with the polygon's middle where heather's share of plant records within "
          "50 km is at least this share of its typical share\n")
    table(["classes", "range share", "polygons", "km²", "sightings in", "within 300 m", "within 1 km"], rows)

    # By region: each class's area and the sightings within 300 m of it, per 1,000 km².
    boxes = {"GB + IE": (-11.0, 49.8, 2.0, 61.0), "NW continent": (2.0, 47.0, 16.0, 58.0),
             "Scandinavia + Finland": (4.0, 58.0, 32.0, 72.0), "Iberia": (-10.0, 36.0, 3.5, 44.0),
             "Alps + Italy": (5.0, 43.5, 16.0, 47.0)}
    rows = []
    for name, (w, s_, e_, n_) in boxes.items():
        pin = ((rp.x >= w) & (rp.x < e_) & (rp.y >= s_) & (rp.y < n_)).to_numpy()
        sin = ((rec.lon >= w) & (rec.lon < e_) & (rec.lat >= s_) & (rec.lat < n_)).to_numpy()
        for k in (322, 321, 312, 324):
            mask = (poly.raster_val == k).to_numpy() & pin
            h = hits[(k,)][1] & sin
            area = poly.km2[mask].sum()
            rows.append((name, k, f"{area:,.0f}", int(h.sum()), f"{h.sum() / max(sin.sum(), 1):.1%}",
                         f"{1000 * h.sum() / max(area, 1):.1f}",
                         f"{(poly.rel[mask] < 0.1).mean():.0%}" if mask.any() else "-"))
    print("## By region: sightings within 300 m of each class (in the box), per 1,000 km² of the class\n")
    table(["region", "class", "km²", "sightings within 300 m", "share of the box's sightings", "per 1,000 km²",
           "polygons under range share 0.1"], rows)
    # Heath (322) by elevation: the polygon's middle against the sighting's own ground.
    m322 = (poly.raster_val == 322).to_numpy()
    pz = np.full(len(poly), np.nan)
    pz[m322] = dem_elevations(rp.y.to_numpy()[m322], rp.x.to_numpy()[m322], args.dem)
    sz = dem_elevations(rec.lat.to_numpy(), rec.lon.to_numpy(), args.dem)
    near322 = hits[(322,)][1]
    rows = []
    for name, (w, s_, e_, n_) in boxes.items():
        pin = m322 & ((rp.x >= w) & (rp.x < e_) & (rp.y >= s_) & (rp.y < n_)).to_numpy()
        sin = near322 & ((rec.lon >= w) & (rec.lon < e_) & (rec.lat >= s_) & (rec.lat < n_)).to_numpy()
        for lo, hi in ((-50, 300), (300, 600), (600, 900), (900, 1200), (1200, 1800), (1800, 5000)):
            pa = poly.km2[pin & (pz >= lo) & (pz < hi)].sum()
            sa = int((sin & (sz >= lo) & (sz < hi)).sum())
            if pa > 0 or sa > 0:
                rows.append((name, f"{lo}-{hi} m", f"{pa:,.0f}", sa, f"{1000 * sa / max(pa, 1):.1f}"))
    print("## Heath (322) by elevation: area (by the polygon's middle) and sightings within 300 m (by their own "
          "ground), per 1,000 km²\n")
    table(["region", "elevation", "km² of 322", "sightings within 300 m", "per 1,000 km²"], rows)
    # North of 58° N the 322 above the coastal heaths is fjell heath: a cap on the polygon's middle.
    north = (rp.y >= 58).to_numpy()
    rows = []
    for cap in (None, 600, 450, 300):
        mask = m322 & (poly.rel >= 0.1).to_numpy() & (~north | (np.nan_to_num(pz) < (cap or 1e9)))
        h = [near(mask, x) for x in (0, 300, 1000)]
        rows.append((f"below {cap} m" if cap else "no cap", int(mask.sum()), f"{poly.km2[mask].sum():,.0f}",
                     *(f"{x.mean():.1%}" for x in h)))
    print("## 322 with range share >= 0.1, capped north of 58° N\n")
    table(["north of 58° N", "polygons", "km²", "sightings in", "within 300 m", "within 1 km"], rows)

    # Named heaths: distance to the nearest polygon of each class.
    hp = gpd.GeoSeries(gpd.points_from_xy([h[2] for h in HEATHS], [h[1] for h in HEATHS]), crs=4326).to_crs(3035)
    rows = []
    for (name, a, b), p in zip(HEATHS, hp.values):
        dists = []
        for k in (322, 324, 333, 321, 312):
            g = poly3.geometry.values[(poly.raster_val == k).to_numpy()]
            tree = shapely.STRtree(g)
            i = tree.nearest(p)
            dists.append(f"{shapely.distance(p, g[i]) / 1000:.1f}")
        rows.append((name, *dists, f"{cb.lookup(rel, lat0, lon0, 0.1, [a], [b], 0.0)[0]:.2f}"))
    table(["heath", "km to 322", "km to 324", "km to 333", "km to 321", "km to 312", "relative share"], rows)

    # What the polygons miss: CORINE under a sample of the sightings, and the classes' areas.
    rng = np.random.default_rng(0)
    sample = rng.choice(len(rec), size=min(600, len(rec)), replace=False)
    code = corine_class(rec.lat.to_numpy()[sample], rec.lon.to_numpy()[sample], args.cache)
    rec_s = rec.iloc[sample].assign(code=code, gbie=rec.unit.iloc[sample].isin(GB_IE).to_numpy(),
                                    near322=hits[(322,)][1][sample])
    top = pd.Series(code).value_counts()
    print(f"CORINE 2018 under {len(sample)} random sightings: "
          + ", ".join(f"{k} {v / len(code):.0%}" for k, v in top.head(14).items()) + ".\n")
    for name, g in (("GB + IE", rec_s[rec_s.gbie]), ("continent", rec_s[~rec_s.gbie])):
        vc = g.code.value_counts()
        print(f"{name} ({len(g)}): " + ", ".join(f"{k} {v / len(g):.0%}" for k, v in vc.head(10).items()) + "\n")
    far = rec_s[~rec_s.near322]
    print(f"Of the sampled sightings more than 300 m from any 322 polygon ({len(far)}): "
          + ", ".join(f"{k} {v / len(far):.0%}" for k, v in far.code.value_counts().head(10).items()) + ".\n")
    hc = corine_class([h[1] for h in HEATHS], [h[2] for h in HEATHS], args.cache)
    print("CORINE 2018 at the heaths: " + ", ".join(f"{h[0]} {k}" for h, k in zip(HEATHS, hc)) + ".\n")
    areas = corine_areas(args.cache, {"GB_IE": (-11.0, 49.8, 2.0, 61.0), "NW_continent": (2.0, 47.0, 16.0, 58.0),
                                      "Iberia": (-10.0, 36.0, 3.5, 44.0), "Scandinavia": (4.0, 55.0, 32.0, 72.0)})
    table(["box", *[str(k) for k in (321, 322, 324, 333, 411, 412)]],
          [(n, *(f"{a.get(k, 0):,.0f}" for k in (321, 322, 324, 333, 411, 412))) for n, a in areas.items()])

    # The normal year as a cutoff, and the season, over the candidate ground in the range.
    ground = poly[m322 & (poly.rel >= 0.1).to_numpy() & (~north | (np.nan_to_num(pz) < FJELL_CAP))]
    gp = ground.representative_point()
    cy, cx = np.rint(gp.y / bloom.CELL), np.rint(gp.x / bloom.CELL)
    cl = pd.DataFrame({"cy": cy, "cx": cx}).drop_duplicates()
    ce, _ = cell_elevation(cl.cy.to_numpy() * bloom.CELL, cl.cx.to_numpy() * bloom.CELL, args.dem)
    ce = np.nan_to_num(ce)
    nt = bloom.daily_normals(normals, cl.cy.to_numpy() * bloom.CELL, cl.cx.to_numpy() * bloom.CELL, ce,
                             date(2027, 1, 1), N_DAYS)
    la = cl.cy.to_numpy() * bloom.CELL
    npk = forecast(m, params, nt, nt, la, np.column_stack([np.ones(len(la)), la, ce]))
    print(f"## A normal year over the 322 ground in the range ({len(cl)} 0.1° cells, at their mean elevation)\n")
    print(f"Normal-year peak: 1st {day_name(np.nanpercentile(npk, 1))}, 5th {day_name(np.nanpercentile(npk, 5))}, "
          f"median {day_name(np.nanmedian(npk))}, 95th {day_name(np.nanpercentile(npk, 95))}, 99th "
          f"{day_name(np.nanpercentile(npk, 99))}; none by 31 October: {int(np.isnan(npk).sum())}.\n")
    table(["normal-year peak after", "cells", "share", "lowest such cell"],
          [(day_name(x), int((~(npk <= x)).sum()), f"{np.mean(~(npk <= x)):.1%}",
            f"{ce[~(npk <= x)].min():.0f} m" if (~(npk <= x)).any() else "-") for x in (243, 258, 273)])
    out = args.cache / "heather_ground_candidate.parquet"
    gpd.GeoDataFrame(geometry=ground.geometry.values, crs="EPSG:4326").to_parquet(out, compression="zstd")
    print(f"Candidate ground (322, relative share >= 0.1, below {FJELL_CAP} m north of 58° N): {len(ground)} "
          f"polygons, {ground.km2.sum():,.0f} km², "
          f"{out.stat().st_size / 1e6:.1f} MB as zstd GeoParquet.\n")


if __name__ == "__main__":
    main()
