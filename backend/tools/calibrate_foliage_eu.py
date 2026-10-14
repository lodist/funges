#!/usr/bin/env python3
"""Calibrate the peak autumn-colour forecast ("Fall foliage") for Europe.

The US layer (backend/foliage.py, calibrated by calibrate_foliage.py) counts cold
degree-days below 33 °C from 15 August and peaks at 1,031 °C·days in the eastern
hardwoods, 897 for the Rocky Mountain aspens. This script asks whether that model
transfers to the European colour forests (the NE and SE regions), and whether a group
(the alpine larches, the boreal birches) needs its own requirement. It mirrors the US
calibration and imports its model, observed-peak and test helpers.

Temperatures: NASA POWER daily T2M (MERRA-2), the source of the 1991-2020 normals
(backend/generated/bloom_normals_EU.npz), moved from POWER's grid elevation to the
median ground elevation of the observations (EU-DEM v1.1, 25 m) at bloom.LAPSE. A
season runs from 1 July (index 0) to 31 December (index 183). The POWER requests are
the heather calibration's (2000 - 7 October 2026), so its cache can be copied in.

Observations: iNaturalist research-grade records of the European colour trees
(TAXA: beech; pedunculate, sessile, downy and Turkey oak; the birches; sycamore,
Norway and field maple; European larch; rowan; sweet chestnut; hornbeam; ash; aspen;
wild cherry) in Europe, August - December 2016-2026, carrying the "Leaves"
annotation (controlled term 36: 38 Green Leaves, 39 Colored Leaves, 40 No Live
Leaves). The fetch takes the whole genera (GENERA); `--taxa wide` keeps them all
(evergreen oaks out), the default keeps the species above. The observed peak is the
US one: per POWER cell (0.5 x 0.625 degrees) and year, the median date of the
colored-leaf records, MIN_COLORED at least. 2026 is still running on the day the
cache was filled (11 October): scored apart, never fitted on.

Independent series, never fitted on:

- DWD (Deutscher Wetterdienst) annual reporters, wild plants: "Blattverfärbung"
  (autumn leaf colouring, phase 31) and "Blattfall" (leaf fall, 32) of beech,
  pedunculate oak, silver birch, horse chestnut, rowan and European larch,
  2000-2025, each station at its own elevation in its POWER cell.
- MeteoSwiss phenology (open data, data.geo.admin.ch): the leaf colouring of beech
  and the needle colouring of larch at Swiss stations, if reachable.

Tests, printed as tables (the US ones):

1. Leave one year out (2016-2025).
2. Geographic transfer: Germany <-> France + the Benelux + Britain + Ireland (only
   3 German cell-years), north (NE, >= 49.5 N) <-> south (SE), and west (lon < 5) <->
   east (lon >= 12) among the temperate cells.
3. Baselines on the same folds: one fixed date, a latitude + elevation line, each
   cell's own median in its other years; year-to-year (within-cell) skill.
4. DWD and MeteoSwiss: the iNaturalist requirement, their own (leave one year
   out), each station's mean-year weather, a fixed date, a station's own median,
   within-station year-to-year r and the yearly means' r.
5. Grid over the family (calibrate_foliage.model_grid; --grid writes grid.csv).
   The US constants first, as they are.
6. Groups: larch, the northern birches, chestnut: the common model and requirement
   as they are, their own requirement (LOYO), and on DWD/MeteoSwiss larch.
7. A normal year (normals only) at well-known places on production's 0.1-degree
   cells (the masters' base points' mean elevation).
8. WeatherAPI (the NE and SE masters, 1 September - 7 October 2026) against POWER.
9. Where to draw it (skipped with --no-where): the colored-leaf sightings within 0,
   300 and 1,000 m of the wilderness polygons by CORINE class, the larch rule, the
   northern limit, and the named places.

    python backend/tools/calibrate_foliage_eu.py [--cache DIR] [--grid] [--model SPEC] [--taxa core|wide]
        [--min-colored N] [--tmean t2m|minmax] [--no-lapse] [--strict-accuracy] [--no-where]
        [--masters NE.parquet SE.parquet] [--wilderness NE.geojson SE.geojson] [--dem DIR]

--model reports one setting instead of the grid's pick, written as in calibrate_foliage.py
("cdd,START,BASE", ...). Without it, the pick is the best total (iNaturalist LOYO + west <-> east
among the temperate cells + DWD beech leaf fall, own requirement) among the settings that start
counting by 1 September, with a boreal requirement from BOREAL_LAT; a plain cold-degree-day setting
if within half a day. On 11 October 2026 that is a Delpierre setting (32.41); the US setting scores
35.24, on the same ridge as the best plain one (27 °C from 1 September, 33.85), and does best on the
station networks. The recommendation in the write-up is the US setting, `--model cdd,45,33`:
1,539 °C·days for the temperate forests, 869 north of 60 N (boreal), the larch at the temperate one.

Requests, all cached and sequential: 63 iNaturalist pages (1.1 s apart, Retry-After honoured),
about 320 POWER series (0.5 s apart; calibrate_heather.py's are the same requests and can be
copied in), 13 DWD files, 176 MeteoSwiss files, the Natural Earth map units and the EU host cover
(R2 or its public URL). The masters' cells (--masters, or by range requests) and the wilderness
polygons (--wilderness) are read once and cached. A response is cached only once it is complete,
so a failed one is fetched again on the next run.
"""
import argparse
import io
import sys
import urllib.parse
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

_TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(_TOOLS.parent))
sys.path.insert(0, str(_TOOLS))
import bloom  # noqa: E402
import calibrate_bluebell as cb  # noqa: E402  (map units, host cover, lookups)
import calibrate_foliage as cf  # noqa: E402  (the model family, observed peaks, tests)
import calibrate_heather as ch  # noqa: E402  (EU-DEM elevations, DWD's station list)

UA = {"User-Agent": "funges-calibrate-foliage-eu/1.0 (+https://www.fung.es)"}
cf.UA = cb.UA = UA
ROOT = _TOOLS.parents[1]
APP = ROOT.parent
N_DAYS = cf.N_DAYS  # 1 July - 31 December

# ------------------------------------------------------------------ settings --------------
EUROPE = 97391  # iNaturalist place
# The genera fetched (iNaturalist ids); the default set keeps the species in CORE.
GENERA = {"Fagus": 49203, "Quercus": 47851, "Betula": 49156, "Acer": 47727, "Larix": 55571, "Sorbus": 48582,
          "Castanea": 49187, "Carpinus": 54769, "Fraxinus": 54806, "Populus": 47566, "Prunus avium": 61964}
CORE = {"Fagus sylvatica", "Quercus robur", "Quercus petraea", "Quercus pubescens", "Quercus cerris",
        "Acer pseudoplatanus", "Acer platanoides", "Acer campestre", "Larix decidua", "Sorbus aucuparia",
        "Castanea sativa", "Populus tremula", "Prunus avium"}
CORE_GENERA = {"Betula", "Carpinus", "Fraxinus"}  # every species of these
EVERGREEN = {"Quercus ilex", "Quercus suber", "Quercus coccifera", "Quercus rotundifolia", "Quercus alnifolia",
             "Quercus calliprinos", "Quercus aucheri", "Quercus infectoria", "Quercus canariensis",
             "Quercus faginea", "Quercus virginiana", "Quercus agrifolia", "Quercus myrsinifolia"}
YEARS = range(2016, 2027)
FIT_YEARS = range(2016, 2026)
WINDOW = cf.WINDOW  # 15 August - 15 December
MIN_COLORED = cf.MIN_COLORED
BOX = dict(lat=(34.0, 71.5), lon=(-25.0, 45.0))  # the app's European regions, and the host cover's grid
NORTH = 49.5  # NE (north of this) and SE, production's regions
WEST_EU = {"FXX", "BFR", "BWR", "BCR", "NLD", "LUX", "ENG", "SCT", "WLS", "NIR", "IRL", "IMN"}
GERMANY = {"DEU"}
POWER = cf.POWER
POWER_SPAN = (date(2000, 1, 1), date(2026, 10, 7))  # as calibrate_heather.py: POWER's last day on 11 October 2026
# The grid's station columns: the series closest to iNaturalist's median where both see a cell and year
# (beech leaf fall, +1.0 d at DWD and +6.2 d at MeteoSwiss; 50% colouring runs 15-21 d earlier).
DWD_TARGET = "DWD beech leaf fall"
MS_TARGET = "MeteoSwiss beech leaf fall"
LATEST_START = 62  # 1 September: a setting must start counting by then (Lapland peaks in early September)
BOREAL_LAT = 60.0  # cells at or north of this take the boreal requirement (Fennoscandia's birch, rowan, aspen)
# The transitions compared in section 1: a cut at BOREAL_LAT, or the requirement moving evenly between two
# latitudes. backend/foliage.py ships (57, 61): the cut drew a straight line across Fennoscandia.
BOREAL_RAMPS = ((60.0, 60.0), (58.0, 60.0), (57.0, 61.0), (56.0, 62.0), (55.0, 63.0))
LARCH_SHARE = 0.1  # 312 pieces whose middle has at least this larch share of the trees are drawn (larch),
LARCH_ALPS_MIN_ELEV = 1300.0  # ... and 312 pieces in the Alps whose middle is this high (m)
# Published typical peaks (sources in the write-up); [i] = no dated source, inferred by the researcher.
PUBLISHED = {
    "Black Forest (Feldberg)": "mid - late Oct (travel)", "Black Forest (Baden-Baden)": "mid - late Oct (travel)",
    "Bavarian Forest (Lusen)": "mid - late Oct [i]", "Vosges (Gérardmer)": "mid - late Oct [i]",
    "Fontainebleau": "mid Oct - early Nov", "Ardennes (La Roche-en-Ardenne)": "mid Oct - early Nov",
    "Perthshire (Dunkeld, Hermitage)": "October; mid Oct", "Lake District (Grasmere)": "mid Oct - early Nov",
    "Białowieża": "October; mid Oct [i]", "Plitvice Lakes": "10 - 20 Oct",
    "Engadin (St. Moritz)": "mid Oct (2025: 16 Oct)", "Engadin (Pontresina)": "mid Oct (2025: 16 Oct)",
    "Ticino (Valle Maggia, Cevio)": "10 Oct - 15 Nov (foliage train)",
    "Ticino (Monte Generoso, Mendrisio)": "late Oct - early Nov [i]", "South Tyrol (Seiser Alm)": "from mid Oct",
    "Dolomites (Cortina)": "mid Oct - early Nov (2025: 20 Oct)",
    "Valais (Val d'Hérens, Evolène)": "mid Oct - early Nov (Saas 2025: 24 Oct)",
    "Cévennes (Florac)": "late Oct", "Picos de Europa (Liébana)": "1st - 3rd week Oct",
    "Irati forest": "late Oct - early Nov", "Lapland (Levi)": "~ 2nd week Sep, ~10 days",
    "Lapland (Saariselkä)": "~ 2nd week Sep, ~10 days", "Abisko": "early - mid Sep [i]",
}
table = cf.table
US = dict(start=45, base=33.0, requirement=1031.0, aspen=897.0)  # backend/foliage.py

DWD = "https://opendata.dwd.de/climate_environment/CDC/observations_germany/phenology/annual_reporters/wild/"
# File stem: (label, first year of the historical file)
DWD_PLANTS = {"Rotbuche": ("beech", 1925), "Stiel-Eiche": ("pedunculate oak", 1925),
              "Haenge-Birke": ("silver birch", 1930), "Rosskastanie": ("horse chestnut", 1925),
              "Eberesche": ("rowan", 1925), "Europaeische-Laerche": ("larch", 1928)}
DWD_PHASES = {31: "colouring", 32: "leaf fall"}
DWD_YEARS = range(2000, 2026)

# Well-known places for the dry run: (name, lat, lon, group). Published windows in PUBLISHED.
PLACES = [
    ("Black Forest (Feldberg)", 47.860, 8.000, "broadleaf"),
    ("Black Forest (Baden-Baden)", 48.760, 8.240, "broadleaf"),
    ("Bavarian Forest (Lusen)", 48.940, 13.500, "broadleaf"),
    ("Vosges (Gérardmer)", 48.070, 6.880, "broadleaf"),
    ("Fontainebleau", 48.400, 2.700, "broadleaf"),
    ("Ardennes (La Roche-en-Ardenne)", 50.180, 5.580, "broadleaf"),
    ("Perthshire (Dunkeld, Hermitage)", 56.560, -3.610, "broadleaf"),
    ("Lake District (Grasmere)", 54.460, -3.020, "broadleaf"),
    ("Białowieża", 52.700, 23.850, "broadleaf"),
    ("Plitvice Lakes", 44.880, 15.620, "broadleaf"),
    ("Engadin (St. Moritz)", 46.500, 9.840, "larch"),
    ("Engadin (Pontresina)", 46.490, 9.900, "larch"),
    ("Ticino (Valle Maggia, Cevio)", 46.320, 8.600, "chestnut"),
    ("Ticino (Monte Generoso, Mendrisio)", 45.890, 8.980, "chestnut"),
    ("South Tyrol (Seiser Alm)", 46.540, 11.620, "larch"),
    ("Dolomites (Cortina)", 46.540, 12.140, "larch"),
    ("Valais (Val d'Hérens, Evolène)", 46.110, 7.490, "larch"),
    ("Cévennes (Florac)", 44.320, 3.590, "chestnut"),
    ("Picos de Europa (Liébana)", 43.150, -4.650, "broadleaf"),
    ("Irati forest", 43.000, -1.100, "broadleaf"),
    ("Lapland (Levi)", 67.800, 24.810, "birch"),
    ("Lapland (Saariselkä)", 68.420, 27.410, "birch"),
    ("Abisko", 68.350, 18.830, "birch"),
]


# ------------------------------------------------------------------ fetching --------------

def inat_pages(cache):
    """Every research-grade, leaf-annotated record of GENERA in Europe, August-December 2016-2026."""
    taxa = ",".join(str(t) for t in GENERA.values())
    id_above = 0
    while True:
        q = {"taxon_id": taxa, "place_id": EUROPE, "quality_grade": "research", "term_id": 36,
             "month": "8,9,10,11,12", "d1": f"{YEARS[0]}-01-01", "d2": f"{YEARS[-1]}-12-31",
             "per_page": 200, "order_by": "id", "order": "asc", "id_above": id_above, "fields": cf.FIELDS}
        js = cf.fetch_json(cf.INAT_V2 + urllib.parse.urlencode(q), cache / "inat" / f"leaves_{id_above}.json.gz",
                           lambda j: "results" in j and "total_results" in j, pause=1.1)
        yield from js["results"]
        if len(js["results"]) < 200:
            break
        id_above = js["results"][-1]["id"]


def group_of_taxon(name):
    """The colour group a record's taxon belongs to."""
    genus = name.split()[0] if name else ""
    return {"Larix": "larch", "Betula": "birch", "Castanea": "chestnut", "Fagus": "beech",
            "Quercus": "oak"}.get(genus, "other")


def records(cache, taxa="core", strict_accuracy=False, dem=None):
    """All leaf-annotated records as one table: season index (days from 1 July), ground (EU-DEM),
    map unit (Natural Earth) and colour group."""
    rows = []
    for o in inat_pages(cache):
        if not o.get("location") or o.get("obscured") or not o.get("observed_on"):
            continue
        acc = o.get("positional_accuracy")
        if (acc is None and strict_accuracy) or (acc or 0) > 1000:
            continue
        taxon = o.get("taxon") or {}
        lat, lon = map(float, o["location"].split(","))
        rows.append((o["id"], o["observed_on"], lat, lon, taxon.get("id"), taxon.get("name") or "", cf.leaf_state(o)))
    df = pd.DataFrame(rows, columns=["id", "date", "lat", "lon", "taxon", "name", "state"]).drop_duplicates("id")
    df["date"] = pd.to_datetime(df.date, errors="coerce")
    df = df.dropna(subset=["date"])
    df = df[df.state.isin(["green", "colored", "bare"]) & df.lat.between(*BOX["lat"]) & df.lon.between(*BOX["lon"])]
    species = df.name.str.split().str[:2].str.join(" ")
    df = df[~species.isin(EVERGREEN)]
    if taxa == "core":
        species = df.name.str.split().str[:2].str.join(" ")
        df = df[species.isin(CORE) | df.name.str.split().str[0].isin(CORE_GENERA)]
    df = df.reset_index(drop=True)
    df["genus"] = df.name.str.split().str[0]
    df["group"] = df.name.map(group_of_taxon)
    df["year"] = df.date.dt.year
    df["idx"] = (df.date - pd.to_datetime(df.year.astype(str) + "-07-01")).dt.days
    df["ground"] = ch.dem_elevations(df.lat, df.lon, dem or ch.DEM_DIR)
    df["unit"] = cb.units(df, cache).to_numpy()
    return df


_POWER = {}


def power(lat, lon, cache):
    """POWER daily T2M, T2M_MAX and T2M_MIN (NaN where missing) and the grid cell's elevation."""
    if (lat, lon) not in _POWER:
        _POWER[lat, lon] = _power(lat, lon, cache)
    return _POWER[lat, lon]


def _power(lat, lon, cache):
    start, end = POWER_SPAN
    n = (end - start).days + 1
    js = cf.fetch_json(POWER.format(lat=lat, lon=lon, start=f"{start:%Y%m%d}", end=f"{end:%Y%m%d}"),
                       cache / "power" / f"{lat}_{lon}.json.gz",
                       lambda j: all(len(j["properties"]["parameter"][k]) == n for k in ("T2M", "T2M_MAX", "T2M_MIN"))
                       and j["properties"]["parameter"]["T2M"][f"{end:%Y%m%d}"] > -900, pause=0.5)
    p = js["properties"]["parameter"]
    df = pd.DataFrame({k: pd.Series(p[k], dtype=float) for k in ("T2M", "T2M_MAX", "T2M_MIN")})
    df.index = pd.to_datetime(df.index, format="%Y%m%d")
    return df.where(df > -900).interpolate(limit=5, limit_area="inside"), float(js["geometry"]["coordinates"][2])


def load_normals():
    return dict(np.load(ROOT / "backend" / "generated" / "bloom_normals_EU.npz"))


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


def site_temperatures(s, cache, kind="t2m", lapse=True):
    """POWER series for station-years (lat, lon, year, ground)."""
    clat, clon = cf.power_cell(s.lat, s.lon)
    return temperatures(s.assign(plat=clat, plon=clon), cache, kind, lapse, ("plat", "plon"))[0]


def _frame(text):
    rows = [[x.strip() for x in line.split(";")] for line in text.splitlines() if line.strip()]
    return pd.DataFrame(rows[1:], columns=[h.strip() for h in rows[0]])


def dwd(cache):
    """DWD annual reporters: autumn colouring and leaf (needle) fall of DWD_PLANTS, 2000-2025, one row
    per station, plant, phase and year, with the station's place and elevation."""
    raw = cf.fetch("https://opendata.dwd.de/climate_environment/CDC/help/"
                   "PH_Beschreibung_Phaenologie_Stationen_Jahresmelder.txt",
                   cache / "dwd" / "stations.txt.gz", lambda b: len(b) > 10_000)
    stations = _frame(raw.decode("latin-1"))
    st = pd.DataFrame({"station": stations.Stations_id.astype(int), "name": stations.Stationsname,
                       "lat": stations["geograph.Breite"].astype(float), "lon": stations["geograph.Laenge"].astype(float),
                       "elev": pd.to_numeric(stations.Stationshoehe, errors="coerce")}).drop_duplicates("station")
    frames = []
    for plant, (label, first) in DWD_PLANTS.items():
        hist = cf.fetch(DWD + f"historical/PH_Jahresmelder_Wildwachsende_Pflanze_{plant}_{first}_2024_hist.txt",
                        cache / "dwd" / f"{plant}_hist.txt.gz", lambda b: len(b) > 100_000)
        akt = cf.fetch(DWD + f"recent/PH_Jahresmelder_Wildwachsende_Pflanze_{plant}_akt.txt",
                       cache / "dwd" / f"{plant}_akt.txt.gz", lambda b: len(b) > 10_000)
        obs = pd.concat([_frame(hist.decode("latin-1")), _frame(akt.decode("latin-1"))])
        obs = obs.assign(phase=obs.Phase_id.astype(int), qb=obs.Eintrittsdatum_QB.astype(int),
                         station=obs.Stations_id.astype(int), year=obs.Referenzjahr.astype(int),
                         date=pd.to_datetime(obs.Eintrittsdatum, format="%Y%m%d", errors="coerce"))
        # Colouring and fall (31, 32; the larch's needles 63, 64), field values not objected to
        # (0 unchecked, 1 fine, 2 corrected, 3 confirmed); 5 doubtful, 7 invalid and 8 wrong out.
        obs = obs[obs.phase.isin([31, 32, 63, 64]) & obs.qb.isin([0, 1, 2, 3]) & obs.year.isin(DWD_YEARS)
                  & obs.date.notna()]
        obs = obs.assign(phase=obs.phase.replace({63: 31, 64: 32}), plant=label)
        frames.append(obs.drop_duplicates(["station", "phase", "year"], keep="last"))
    d = pd.concat(frames).merge(st, on="station")
    d["idx"] = (d.date - pd.to_datetime(d.year.astype(str) + "-07-01")).dt.days
    d = d[d.idx.between(*WINDOW)]
    return d[["station", "name", "lat", "lon", "elev", "plant", "phase", "year", "idx"]].reset_index(drop=True)


METEOSWISS = "https://data.geo.admin.ch/ch.meteoschweiz.ogd-phenology/"
MS_PARAMS = {"mfags94d": ("beech", 31), "mfags95d": ("beech", 32), "mlard94d": ("larch", 31),
             "mlard95d": ("larch", 32), "mcass94d": ("chestnut", 31), "mcass95d": ("chestnut", 32),
             "mbetp94d": ("silver birch", 31), "mbetp95d": ("silver birch", 32), "msora94d": ("rowan", 31),
             "msora95d": ("rowan", 32), "macep94d": ("sycamore", 31)}


def meteoswiss(cache):
    """MeteoSwiss phenology (open data): 50% leaf (needle) colouring and 50% leaf fall, 2000-2025, one
    row per station, plant, phase and year."""
    raw = cf.fetch(METEOSWISS + "ogd-phenology_meta_stations.csv", cache / "meteoswiss" / "stations.csv.gz",
                   lambda b: b"station_abbr" in b)
    st = pd.read_csv(io.BytesIO(raw), sep=";", encoding="latin-1")
    rows = []
    for abbr in st.station_abbr:
        body = cf.fetch(METEOSWISS + f"{abbr.lower()}/ogd-phenology_{abbr.lower()}_y.csv",
                        cache / "meteoswiss" / f"{abbr.lower()}.csv.gz", lambda b: b"station_abbr" in b,
                        pause=0.5, missing_ok=True)
        if not body:
            continue
        y = pd.read_csv(io.BytesIO(body), sep=";", dtype=str)
        for col, (plant, phase) in MS_PARAMS.items():
            if col not in y:
                continue
            for ts, d in y[["reference_timestamp", col]].dropna().itertuples(index=False):
                rows.append((abbr, plant, phase, int(ts[6:10]), pd.Timestamp(d)))
    d = pd.DataFrame(rows, columns=["station", "plant", "phase", "year", "date"])
    d = d[d.year.isin(DWD_YEARS) & (d.date.dt.year == d.year)]
    d["idx"] = (d.date - pd.to_datetime(d.year.astype(str) + "-07-01")).dt.days
    d = d[d.idx.between(*WINDOW)]
    st = st.rename(columns={"station_abbr": "station", "station_name": "name", "station_height_masl": "elev",
                            "station_coordinates_wgs84_lat": "lat", "station_coordinates_wgs84_lon": "lon"})
    d = d.merge(st[["station", "name", "lat", "lon", "elev"]], on="station")
    return d[["station", "name", "lat", "lon", "elev", "plant", "phase", "year", "idx"]].reset_index(drop=True)


# ------------------------------------------------------------------ tests -----------------

def loyo_folds(c):
    return [((c.year != y).to_numpy(), (c.year == y).to_numpy()) for y in sorted(c.year.unique())]


def transfer_folds(c):
    """name -> (train, test): Germany <-> France + Benelux + GB + IE, and north (NE) <-> south (SE)."""
    de, we = c.unit.isin(GERMANY).to_numpy(), c.unit.isin(WEST_EU).to_numpy()
    n = (c.lat >= NORTH).to_numpy()
    return {"Germany -> France, Benelux, GB + IE": (de, we), "France, Benelux, GB + IE -> Germany": (we, de),
            "north (NE) -> south (SE)": (n, ~n), "south (SE) -> north (NE)": (~n, n)}


def evaluate(c, curve, folds):
    """Errors (predicted - observed, days) of the model and the baselines over (train, test) folds."""
    obs = c.obs.to_numpy()
    f_at = cf.at(curve, obs)
    err = {k: np.full(len(c), np.nan) for k in ("model", "fixed", "line")}
    req = []
    X = np.column_stack([c.lat, c.ground.fillna(c.ground.median()), np.ones(len(c))])
    for train, test in folds:
        f = np.nanmedian(f_at[train])
        req.append(f)
        err["model"][test] = cf.predict(curve[test], f) - obs[test]
        err["fixed"][test] = np.median(obs[train]) - obs[test]
        coef = np.linalg.lstsq(X[train], obs[train], rcond=None)[0]
        err["line"][test] = X[test] @ coef - obs[test]
    return err, req


def site_errors(s, t, model, f_inat=None):
    """A station series' errors: with `f_inat`, with its own requirement leaving the year out, a fixed
    date (LOYO); the within-station and the yearly means' year-to-year r on its own requirement."""
    cv = cf.cold_sum(t, model, s.lat.to_numpy())
    obs = s.obs.to_numpy()
    f_at = cf.at(cv, obs)
    years = s.year.to_numpy()
    e_own, e_fixed = np.full(len(s), np.nan), np.full(len(s), np.nan)
    for y in np.unique(years):
        k = years == y
        e_own[k] = cf.predict(cv[k], np.nanmedian(f_at[~k])) - obs[k]
        e_fixed[k] = np.median(obs[~k]) - obs[k]
    d = pd.DataFrame({"site": s.site.to_numpy(), "year": years, "obs": obs, "pred": obs + e_own}).dropna()
    d = d[d.site.map(d.site.value_counts()) >= 3]
    oa = d.obs - d.groupby("site").obs.transform("mean")
    pa = d.pred - d.groupby("site").pred.transform("mean")
    ym = d.groupby("year")[["obs", "pred"]].mean()
    return dict(inat=None if f_inat is None else cf.predict(cv, f_inat) - obs, own=e_own, fixed=e_fixed,
                req=float(np.nanmedian(f_at)), r_site=float(np.corrcoef(oa, pa)[0, 1]) if len(d) > 10 else np.nan,
                r_year=float(np.corrcoef(ym.obs, ym.pred)[0, 1]) if len(ym) > 4 else np.nan,
                sd_year=(float(ym.obs.std()), float(ym.pred.std())) if len(ym) > 4 else (np.nan, np.nan))


def score(c, t, m, ind, cost_on):
    """One setting: leave-one-year-out and north <-> south MAE on iNaturalist, the station series on their
    own requirement, the requirement on all cell-years; the total is LOYO + transfer + `cost_on`."""
    cv = cf.cold_sum(t, m, c.lat.to_numpy())
    e_l, _ = evaluate(c, cv, loyo_folds(c))
    tf = transfer_folds(c)
    e_t, _ = evaluate(c, cv, [tf["north (NE) -> south (SE)"], tf["south (SE) -> north (NE)"]])
    f_all = float(np.nanmedian(cf.at(cv, c.obs.to_numpy())))
    out = dict(model=m, loyo=cf.mae(e_l["model"])[0], loyo_none=cf.mae(e_l["model"])[1],
               transfer=cf.mae(e_t["model"])[0], transfer_none=cf.mae(e_t["model"])[1], requirement=f_all,
               **cf.skill(c, cf.predict(cv, f_all)))
    for name, (s, st) in ind.items():
        r = site_errors(s, st, m, f_all)
        out[f"{name}_own"], out[f"{name}_inat"] = cf.mae(r["own"])[0], cf.mae(r["inat"])[0]
        out[f"{name}_bias"], out[f"{name}_r"], out[f"{name}_ryear"] = float(np.nanmean(r["inat"])), r["r_site"], r["r_year"]
        out[f"{name}_req"] = r["req"]
    out["cost"] = (out["loyo"] + out["transfer"] + out[f"{cost_on}_own"]
                   + 30 * (out["loyo_none"] + out["transfer_none"]) / len(c))
    return out


def stations(d, plant, phase, cache, kind="t2m", lapse=True):
    """One station series (site, lat, lon, year, obs, ground) and its temperatures."""
    s = d[(d.plant == plant) & (d.phase == phase)].reset_index(drop=True)
    s = s.assign(site=s.station.astype(str), obs=s.idx.astype(float), ground=s.elev.astype(float))
    return s, site_temperatures(s, cache, kind, lapse)


def bootstrap_requirement(c, cv, n=2000, seed=0):
    """The requirement's 90% interval over cell-years resampled with replacement."""
    f_at = cf.at(cv, c.obs.to_numpy())
    rng = np.random.default_rng(seed)
    b = [np.nanmedian(f_at[rng.integers(0, len(f_at), len(f_at))]) for _ in range(n)]
    return np.percentile(b, [5, 95])


def label_units(c, rec):
    """Each cell's map unit: the most common one among its records."""
    clat, clon = cf.power_cell(rec.lat, rec.lon)
    u = rec.assign(clat=clat, clon=clon).groupby(["clat", "clon"]).unit.agg(
        lambda x: x.mode().iloc[0] if x.notna().any() else "")
    return u.reindex(list(zip(c.lat, c.lon))).fillna("").to_numpy()


def req_line(name, s, t, m, f):
    r = site_errors(s, t, m, f)
    return (name, len(s), s.site.nunique(), f"{cf.mae(r['inat'])[0]:.2f} ({np.nanmean(r['inat']):+.1f})",
            f"{r['req']:.0f}", f"**{cf.mae(r['own'])[0]:.2f}**", f"{cf.mae(r['fixed'])[0]:.2f}",
            f"{r['r_site']:.2f}", f"{r['r_year']:.2f}", f"{r['sd_year'][0]:.1f} / {r['sd_year'][1]:.1f}")


SITE_HEAD = ["series", "station-years", "stations", "iNat requirement: MAE (bias)", "own requirement",
             "own requirement, LOYO MAE", "fixed date, LOYO MAE", "within-station year-to-year r",
             "yearly means r", "yearly means SD, observed / predicted (d)"]


# ------------------------------------------------------------------ main ------------------

def line_of(r, names):
    return ([cf.model_name(r["model"]), f"{r['loyo']:.2f}", f"{r['transfer']:.2f}"]
            + [f"{r[f'{n}_own']:.2f}" for n in names]
            + [f"{r['cost']:.2f}", r["loyo_none"] + r["transfer_none"], f"{r['requirement']:.0f}",
               f"{r['anom_r']:.2f}"] + [f"{r[f'{n}_r']:.2f} / {r[f'{n}_ryear']:.2f}" for n in names])


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cache", type=Path, default=Path.home() / ".cache" / "funges-foliage-eu")
    ap.add_argument("--grid", action="store_true")
    ap.add_argument("--model", help="report this setting instead of the recommended one (calibrate_foliage.py's syntax)")
    ap.add_argument("--taxa", choices=("core", "wide"), default="core")
    ap.add_argument("--min-colored", type=int, default=MIN_COLORED)
    ap.add_argument("--tmean", choices=("t2m", "minmax"), default="t2m")
    ap.add_argument("--no-lapse", action="store_true", help="keep POWER at its grid elevation")
    ap.add_argument("--strict-accuracy", action="store_true")
    ap.add_argument("--no-where", action="store_true")
    ap.add_argument("--masters", nargs=2, metavar=("NE", "SE"), help="local NE and SE master parquets (else the "
                    "NE_WEATHER_DATA and SE_WEATHER_DATA URLs of .env, by range requests)")
    ap.add_argument("--wilderness", nargs=2, metavar=("NE", "SE"), type=Path,
                    default=(APP / "Europe" / "North_Europe" / "NE_wilderness_data.geojson",
                             APP / "Europe" / "South_Europe" / "SE_wilderness_data.geojson"))
    ap.add_argument("--dem", type=Path, default=ch.DEM_DIR, help="EU-DEM v1.1 tiles (EPSG:3035)")
    args = ap.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    lapse = not args.no_lapse
    pd.set_option("display.width", 200)

    # --- records and observed peaks ---
    rec = records(args.cache, args.taxa, args.strict_accuracy, args.dem)
    print(f"# Records: {len(rec)} research-grade, leaf-annotated records of the colour trees ({args.taxa} set), "
          f"Europe, August-December 2016-2026, not obscured, coordinates good to 1 km"
          f"{'' if args.strict_accuracy else ' or unknown'}, evergreen oaks out\n")
    table(["year", "green", "colored", "bare", "colored: beech", "oak", "birch", "larch", "chestnut", "other"],
          [(y, *[int(((rec.year == y) & (rec.state == k)).sum()) for k in ("green", "colored", "bare")],
            *[int(((rec.year == y) & (rec.state == "colored") & (rec.group == g)).sum())
              for g in ("beech", "oak", "birch", "larch", "chestnut", "other")]) for y in YEARS])
    col = rec[rec.state == "colored"]
    table(["map unit", "colored-leaf records", "all records"],
          [(u, n, int((rec.unit == u).sum())) for u, n in col.unit.value_counts().head(16).items()])
    table(["taxon (colored)", "records", "median colored date (all years)"],
          [(g, len(d), cf.day_name(d.idx.median())) for g, d in
           sorted(col.groupby(col.name.str.split().str[:2].str.join(" ")), key=lambda x: -len(x[1]))[:14]])
    dow = col.date.dt.dayofweek.value_counts(normalize=True).sort_index()
    print(f"Colored-leaf records by weekday (Mon..Sun): {', '.join(f'{x:.1%}' for x in dow)}; weekend share "
          f"{col.date.dt.dayofweek.ge(5).mean():.1%}.\n")

    ce, slopes = cf.observed(rec, args.min_colored)
    ce["unit"] = label_units(ce, rec)
    fit = ce[ce.year.isin(FIT_YEARS)]
    print("## The observed peak: estimators on the cell-years 2016-2025\n")
    rows = []
    for k in ("median", "weekday", "t50", "middle"):
        d = fit[fit[k].notna() & fit["median"].notna()]
        rows.append((k, int(fit[k].notna().sum()), f"{(d[k] - d['median']).mean():+.1f}" if len(d) else "-",
                     f"{np.corrcoef(d[k], d['median'])[0, 1]:.2f}" if len(d) > 2 else "-"))
    table(["estimator", "cell-years", "minus the median date (mean, days)", "r with the median date"], rows)
    rng = np.random.default_rng(0)
    w = rec[rec.idx.between(*WINDOW) & (rec.state == "colored") & rec.year.isin(FIT_YEARS)]
    w = w.assign(plat=cf.power_cell(w.lat, w.lon)[0], plon=cf.power_cell(w.lat, w.lon)[1],
                 half=rng.integers(0, 2, len(w)))
    h = w.groupby(["plat", "plon", "year", "half"]).idx.agg(["median", "size"]).unstack("half")
    h = h[(h["size"] >= args.min_colored / 2).all(axis=1)]
    print(f"Split-half reliability of the median date (cell-years with >= {args.min_colored / 2:g} colored records "
          f"in each random half, n = {len(h)}): r = {np.corrcoef(h['median'][0], h['median'][1])[0, 1]:.2f}, "
          f"mean absolute difference {np.mean(np.abs(h['median'][0] - h['median'][1])):.1f} d. Shared logistic "
          f"slopes: {', '.join(f'{k} {v:g} d' for k, v in slopes.items())}.\n")

    c = ce[ce["median"].notna()].assign(obs=lambda d: d["median"]).reset_index(drop=True)
    c["group"] = np.where(c.lat >= NORTH, "NE", "SE")  # calibrate_foliage's "transfer" folds: north <-> south
    t, pelev = temperatures(c, args.cache, args.tmean, lapse)
    c["elev"] = pelev
    c["ground"] = c.ground.fillna(c.elev)
    now = (c.year == 2026).to_numpy()
    c26, t26 = c[now].reset_index(drop=True), t[now]
    c, t = c[~now].reset_index(drop=True), t[~now]
    dz = c.ground - c.elev
    tf = transfer_folds(c)
    print(f"Cell-years (median, >= {args.min_colored} colored records): {len(c)} in "
          f"{c[['lat', 'lon']].drop_duplicates().shape[0]} cells, 2016-2025 (NE {int((c.group == 'NE').sum())}, "
          f"SE {int((c.group == 'SE').sum())}; Germany {int(tf['Germany -> France, Benelux, GB + IE'][0].sum())}, "
          f"France + Benelux + GB + IE {int(tf['Germany -> France, Benelux, GB + IE'][1].sum())}); 2026 so far: "
          f"{len(c26)}. Records' median ground minus POWER's grid elevation: median {np.median(dz):+.0f} m, "
          f"10-90% {np.percentile(dz, 10):+.0f} to {np.percentile(dz, 90):+.0f} m; "
          f"{'moved' if lapse else 'not moved'} at 6.5 °C/km.\n")
    table(["year", "cell-years", "median observed peak"],
          [(y, len(g), cf.day_name(g.obs.median())) for y, g in c.groupby("year")])
    table(["map unit", "cell-years", "median observed peak", "median ground"],
          [(u, len(g), cf.day_name(g.obs.median()), f"{g.ground.median():.0f} m")
           for u, g in sorted(c.groupby("unit"), key=lambda x: -len(x[1]))[:14]])

    # --- independent series ---
    dw, ms = dwd(args.cache), meteoswiss(args.cache)
    series_ = {}
    for name, d, plant, phase in ([(f"DWD {p} {DWD_PHASES[ph]}", dw, p, ph)
                                   for p in ("beech", "pedunculate oak", "silver birch", "horse chestnut", "rowan",
                                             "larch") for ph in (31, 32)]
                                  + [(f"MeteoSwiss {p} {DWD_PHASES[ph]}", ms, p, ph)
                                     for p in ("beech", "larch", "chestnut", "silver birch", "rowan", "sycamore")
                                     for ph in (31, 32)]):
        if ((d.plant == plant) & (d.phase == phase)).sum() >= 50:
            series_[name] = stations(d, plant, phase, args.cache, args.tmean, lapse)
    ind = {"dwd": series_[DWD_TARGET], "ms": series_[MS_TARGET]}
    print(f"DWD: {len(dw)} station-years at {dw.station.nunique()} stations, 2000-2025. MeteoSwiss: {len(ms)} at "
          f"{ms.station.nunique()} stations. The grid's DWD and MeteoSwiss columns: {DWD_TARGET}, {MS_TARGET}.\n")

    # --- 0. the US model as it is ---
    us = ("cdd", US["start"], US["base"])
    lat = c.lat.to_numpy()
    cv_us = cf.cold_sum(t, us, lat)
    e_us = cf.predict(cv_us, US["requirement"]) - c.obs.to_numpy()
    e_l, req_l = evaluate(c, cv_us, loyo_folds(c))
    clim = cf.own_median(c)
    has = np.isfinite(clim)
    print("# 0. The US model as it is (cold degree-days below 33 °C from 15 August, 1,031 °C·days)\n")
    rows = [("US model, US requirement 1,031 (nothing fitted)", len(c), f"{cf.mae(e_us)[0]:.2f}",
             f"{np.nanmean(e_us):+.1f}", int(np.isnan(e_us).sum()))]
    rows.append(("US model, aspen requirement 897", len(c),
                 f"{cf.mae(cf.predict(cv_us, US['aspen']) - c.obs.to_numpy())[0]:.2f}",
                 f"{np.nanmean(cf.predict(cv_us, US['aspen']) - c.obs.to_numpy()):+.1f}", ""))
    rows.append((f"US model, European requirement (LOYO, median {np.median(req_l):.0f})", len(c),
                 f"{cf.mae(e_l['model'])[0]:.2f}", f"{np.nanmean(e_l['model']):+.1f}", cf.mae(e_l["model"])[1]))
    rows.append(("one fixed date (LOYO)", len(c), f"{cf.mae(e_l['fixed'])[0]:.2f}", f"{np.nanmean(e_l['fixed']):+.1f}", ""))
    rows.append(("latitude + elevation line (LOYO)", len(c), f"{cf.mae(e_l['line'])[0]:.2f}",
                 f"{np.nanmean(e_l['line']):+.1f}", ""))
    rows.append((f"cell's own median, other years (on {int(has.sum())})", int(has.sum()), f"{cf.mae(clim)[0]:.2f}",
                 "", f"US requirement on those {cf.mae(e_us, has)[0]:.2f}"))
    table(["iNaturalist cell-years 2016-2025", "n", "MAE (d)", "bias (d)", "no peak"], rows)
    rows = []
    for name, k in (("NE (>= 49.5 N)", c.group == "NE"), ("SE", c.group == "SE"),
                    ("Germany", c.unit.isin(GERMANY)), ("France + Benelux + GB + IE", c.unit.isin(WEST_EU)),
                    ("Fennoscandia (>= 58 N)", c.lat >= 58), ("ground >= 800 m", c.ground >= 800)):
        k = k.to_numpy()
        if k.sum():
            rows.append((name, int(k.sum()), f"{cf.mae(e_us, k)[0]:.2f}", f"{np.nanmean(e_us[k]):+.1f}"))
    table(["US requirement 1,031, by region", "cell-years", "MAE (d)", "bias, predicted - observed (d)"], rows)
    print("The US constants on the station series (their stage differs from iNaturalist's median, so the bias is "
          "the stage gap plus any model error; their own requirement on the US model is the fairer test):\n")
    table(SITE_HEAD, [req_line(n, s, st, us, US["requirement"]) for n, (s, st) in series_.items()])

    # --- 5. the grid ---
    grid = cf.model_grid()
    sc = pd.DataFrame([score(c, t, mm, ind, "dwd") for mm in grid])
    sc["kind"] = sc.model.str[0]
    sc["simple"] = sc.kind == "cdd"
    best = sc.loc[sc.cost.idxmin()]
    names = list(ind)
    head = (["model", "LOYO", "north <-> south"] + [f"{n} own req. LOYO" for n in names]
            + ["total", "no peak", "requirement", "iNat year-to-year r"] + [f"{n} r: station / yearly" for n in names])
    cdd = sc[sc.kind == "cdd"].assign(start=sc.model.str[1], base=sc.model.str[2])
    for col_, title in (("loyo", "iNaturalist leave-one-year-out MAE"), ("transfer", "north <-> south MAE"),
                        ("dwd_own", f"{DWD_TARGET} MAE, own requirement, LOYO"),
                        ("dwd_ryear", f"{DWD_TARGET}: r of the yearly means"),
                        ("ms_own", f"{MS_TARGET} MAE, own requirement, LOYO")):
        print(f"## 5. Cold degree-days: {title}, by start and base\n")
        piv = cdd.pivot(index="start", columns="base", values=col_)
        table(["start"] + [f"{b:g} °C" for b in piv.columns],
              [[cf.day_name(i)] + [f"{v:.2f}" for v in r] for i, r in piv.iterrows()])
    for kind, title in (("cdd", "cold degree-days"), ("cddp", "cold degree-days + day-length term"),
                        ("dp", "Delpierre, (P/Pstart)^y"), ("dpi", "Delpierre, (1 - P/Pstart)^y")):
        print(f"## 5. Best settings: {title}\n")
        table(head, [line_of(r, names) for _, r in sc[sc.kind == kind].sort_values("cost")
                     .head(5 if not args.grid else 99).iterrows()])
    near = sc[sc.cost <= best.cost + 0.5]
    print(f"{len(near)} settings within 0.5 days of the best total ({best.cost:.2f}); plain cold degree-days among "
          f"them: {int(near.simple.sum())}. The US setting: total "
          f"{sc[sc.model.map(lambda x: tuple(x) == us)].cost.iloc[0]:.2f}.\n")
    if args.grid:
        sc.sort_values("cost").to_csv(args.cache / "grid.csv", index=False)
    # The same with a boreal requirement (section 6), every setting. A setting must start counting by
    # 1 September (index 62), or on a day length: Lapland's birches peak in the first half of September.
    gs = []
    for mm in [tuple(x) for x in sc.model]:
        cvm = cf.cold_sum(t, mm, lat)
        row = sc[sc.model.map(lambda x: tuple(x) == mm)].iloc[0]
        gs.append(dict(model=mm, loyo=cf.mae(grouped(c, cvm, BOREAL_LAT))[0],
                       transfer=cf.mae(grouped(c, cvm, BOREAL_LAT, list(temperate_folds(c).values())))[0],
                       dwd=row.dwd_own, ms=row.ms_own, dwd_ryear=row.dwd_ryear,
                       early=mm[0] in ("dp", "dpi") or mm[1] <= LATEST_START))
    gs = pd.DataFrame(gs)
    gs["cost"] = gs.loyo + gs.transfer + gs.dwd
    if args.grid:
        gs.sort_values("cost").to_csv(args.cache / "grid_boreal.csv", index=False)
    print(f"## 5. With a boreal requirement from {BOREAL_LAT:g} N: LOYO, west <-> east among the temperate cells, "
          f"and {DWD_TARGET}\n")
    table(["model", "LOYO", "west <-> east", "dwd own req. LOYO", "ms own req. LOYO", "total", "dwd yearly r"],
          [(cf.model_name(r.model) + ("" if r.early else " (starts after 1 Sep)"), f"{r.loyo:.2f}", f"{r.transfer:.2f}",
            f"{r.dwd:.2f}", f"{r.ms:.2f}", f"{r.cost:.2f}", f"{r.dwd_ryear:.2f}")
           for r in pd.concat([gs.sort_values("cost").head(8), gs[gs.early].sort_values("cost").head(12),
                               gs[gs.model.map(lambda x: tuple(x) == us)]]).drop_duplicates("cost").itertuples()])
    gs = gs[gs.early]
    gb = gs.loc[gs.cost.idxmin()]
    gc = gs[gs.model.str[0] == "cdd"]
    gc = gc.loc[gc.cost.idxmin()]
    m = gc.model if gc.cost <= gb.cost + 0.5 else gb.model
    if args.model:
        m = cf.parse_model(args.model)

    # --- the recommended model ---
    print(f"# {'Chosen with --model' if args.model else 'Recommended'}: {cf.model_name(m)}\n")
    cv = cf.cold_sum(t, m, lat)
    f_all = float(np.nanmedian(cf.at(cv, c.obs.to_numpy())))
    lo, hi = bootstrap_requirement(c, cv)
    boreal = (c.lat >= BOREAL_LAT).to_numpy()
    f_temp = float(np.nanmedian(cf.at(cv[~boreal], c.obs.to_numpy()[~boreal])))
    f_bor = float(np.nanmedian(cf.at(cv[boreal], c.obs.to_numpy()[boreal])))
    bt = bootstrap_requirement(c[~boreal].reset_index(drop=True), cv[~boreal])
    bb = bootstrap_requirement(c[boreal].reset_index(drop=True), cv[boreal])
    print(f"With a boreal requirement from {BOREAL_LAT:g} N: temperate {f_temp:.1f} on {int((~boreal).sum())} "
          f"cell-years (bootstrap 90%: {bt[0]:.0f}-{bt[1]:.0f}), boreal {f_bor:.1f} on {int(boreal.sum())} "
          f"({bb[0]:.0f}-{bb[1]:.0f}).\n")
    pred = cf.predict(cv, np.where(boreal, f_bor, f_temp))
    sk = cf.skill(c, pred)
    rate = np.nanmedian(np.maximum(m[2] - t[:, 75:120], 0)) if m[0] == "cdd" else np.nan
    print(f"Requirement on all {len(c)} cell-years: {f_all:.1f} °C·days (bootstrap 90%: {lo:.0f}-{hi:.0f}; the "
          f"sum grows by about {rate:.0f} a day in mid-September - mid-October). In-sample MAE "
          f"{cf.mae(cf.predict(cv, f_all) - c.obs.to_numpy())[0]:.2f} d with one requirement, "
          f"{cf.mae(pred - c.obs.to_numpy())[0]:.2f} with the boreal one (bias {np.nanmean(pred - c.obs.to_numpy()):+.1f}).\n")
    print(f"Year to year, {sk['anom_n']} cell-years in cells with >= 3 years: r = {sk['anom_r']:.2f}, slope "
          f"{sk['anom_slope']:.2f}, anomaly MAE {sk['anom_mae']:.2f} d against {sk['anom_zero']:.2f} d for 'a normal "
          f"year'. Place to place (cell means): r = {sk['space_r']:.2f}, slope {sk['space_slope']:.2f}.\n")

    # 1. leave one year out
    e, req = evaluate(c, cv, loyo_folds(c))
    e["boreal"] = grouped(c, cv, BOREAL_LAT)
    e["US"] = e_us
    rows = []
    for i, y in enumerate(sorted(c.year.unique())):
        k = (c.year == y).to_numpy()
        rows.append((y, int(k.sum()), f"{req[i]:.0f}", *(f"{cf.mae(e[x], k)[0]:.1f}" for x in e),
                     f"{np.nanmean(e['boreal'][k]):+.1f}"))
    rows.append(("all", len(c), f"{np.median(req):.0f}", *(f"**{cf.mae(e[x])[0]:.2f}**" for x in e),
                 f"{np.nanmean(e['boreal']):+.1f}"))
    print("## 1. Leave one year out (MAE, days)\n")
    table(["held-out year", "cell-years", "requirement (one)", "model, one requirement", "fixed date",
           "latitude + elevation line", "model, boreal requirement", "US constants as they are",
           "bias (boreal requirement)"], rows)
    print(f"Cell-years whose cell has other years: {int(has.sum())}. On those: model {cf.mae(e['boreal'], has)[0]:.2f}, "
          f"the cell's own median in its other years {cf.mae(clim, has)[0]:.2f}, fixed date "
          f"{cf.mae(e['fixed'], has)[0]:.2f}, line {cf.mae(e['line'], has)[0]:.2f} d; without a peak: "
          f"{cf.mae(e['model'])[1]}\n")
    big = (c.colored >= 15).to_numpy()
    print(f"Cell-years with >= 15 colored records ({int(big.sum())}): model {cf.mae(e['model'], big)[0]:.2f}, fixed "
          f"{cf.mae(e['fixed'], big)[0]:.2f}, line {cf.mae(e['line'], big)[0]:.2f} d\n")
    print(f"## 1. The boreal transition (LOYO, days; the requirements fitted either side of {BOREAL_LAT:g} N)\n")
    rows, north = [], (c.lat >= 54).to_numpy()
    for lo_, hi_ in BOREAL_RAMPS:
        er = ramped(c, cv, (lo_, hi_))
        inside = ((c.lat > lo_) & (c.lat < hi_)).to_numpy()
        rows.append((f"cut at {hi_:g} N" if lo_ == hi_ else f"ramp {lo_:g}-{hi_:g} N", f"{cf.mae(er)[0]:.2f}",
                     f"{np.nanmean(er):+.1f}", int(inside.sum()),
                     f"{cf.mae(er, inside)[0]:.2f} ({np.nanmean(er[inside]):+.1f})" if inside.any() else "-",
                     f"{cf.mae(er, north)[0]:.2f}"))
    table(["transition", "MAE", "bias", "cell-years inside", "their MAE (bias)", "MAE >= 54 N"], rows)

    # 2. transfer
    print("## 2. Geographic transfer (MAE, days)\n")
    rows = []
    for name, (train, test) in tf.items():
        e, req = evaluate(c, cv, [(train, test)])
        rows.append((name, int(test.sum()), f"{req[0]:.0f}", *(f"{cf.mae(e[x], test)[0]:.2f}" for x in e),
                     f"{np.nanmean(e['model'][test]):+.1f}"))
    for name, (train, test) in temperate_folds(c).items():
        e, req = evaluate(c, cv, [(train, test)])
        rows.append((name, int(test.sum()), f"{req[0]:.0f}", *(f"{cf.mae(e[x], test)[0]:.2f}" for x in e),
                     f"{np.nanmean(e['model'][test]):+.1f}"))
    e_us_t, _ = evaluate(c, cv_us, [tf["north (NE) -> south (SE)"], tf["south (SE) -> north (NE)"]])
    table(["fitted on -> tested on", "cell-years", "requirement", "model", "fixed date", "line", "model bias"], rows)
    print(f"The US setting with its requirement refitted, north <-> south: {cf.mae(e_us_t['model'])[0]:.2f} d.\n")

    # 4. the independent series on the recommended model
    print("## 4. Independent series (MAE, days), the recommended model\n")
    table(SITE_HEAD, [req_line(n, s, st, m, f_temp) for n, (s, st) in series_.items()])
    # Stage: iNaturalist's median against DWD and MeteoSwiss where both see the same cell and year.
    rows = []
    for n, (s, _) in series_.items():
        a, b = cf.power_cell(s.lat, s.lon)
        sm = s.assign(lat=a, lon=b).groupby(["lat", "lon", "year"]).obs.median().rename("st").reset_index()
        j = c.merge(sm, on=["lat", "lon", "year"])
        if len(j) >= 3:
            rows.append((n, len(j), f"{np.mean(j.obs - j.st):+.1f}", f"{np.corrcoef(j.obs, j.st)[0, 1]:.2f}"
                         if len(j) > 3 else "-"))
    print("Same POWER cell and year in iNaturalist and a station series:\n")
    table(["series", "cell-years", "iNaturalist median minus the series (d)", "r"], rows)

    # 2026 so far
    if len(c26):
        p26 = cf.predict(cf.cold_sum(t26, m, c26.lat.to_numpy()), np.where(c26.lat >= BOREAL_LAT, f_bor, f_temp))
        print(f"## 2026 so far (records to 10 October; POWER to 7 October, normals after)\n\n{len(c26)} cell-years "
              f"with >= {args.min_colored} colored records: predicted (median) {cf.day_name(np.nanmedian(p26))}, "
              f"records so far {cf.day_name(c26.obs.median())}; predicted minus observed "
              + ", ".join(f"{x:+.0f}" for x in p26 - c26.obs.to_numpy()) + " d.\n")

    reqs, offsets = groups(rec, c, t, cv, m, f_all, series_, args, lapse)
    print("Requirements carried on: " + ", ".join(f"{k} {v:.0f}" for k, v in reqs.items()) + "\n")
    allc = places(m, f_all, reqs, args)
    weatherapi(c, t, m, f_all, args)
    if not args.no_where:
        where(rec, m, f_all, reqs, args, allc)


# ------------------------------------------------------------------ groups ----------------

def larch_share(lat, lon, cache, of="ground"):
    """The host cover's larch share at each point: of the ground, or of the mapped trees ("forest")."""
    cover, _ = cb.host_cover(cache)
    larix = cover["classes"]["larix"].astype(float)
    if of == "forest":
        total = sum(v.astype(float) for v in cover["classes"].values())
        with np.errstate(invalid="ignore", divide="ignore"):
            grid = np.where(total > 0, larix / total, 0.0)
    else:
        grid = larix / 65535.0
    return cb.lookup(grid, cover["lat0"], cover["lon0"], cover["step"], lat, lon, 0.0)


def paired(s1, s2):
    """Station-years both series have: (rows of s1, rows of s2)."""
    k1 = s1.site + "_" + s1.year.astype(str)
    k2 = s2.site + "_" + s2.year.astype(str)
    both = np.intersect1d(k1, k2)
    i1 = np.flatnonzero(np.isin(k1, both))
    i2 = np.flatnonzero(np.isin(k2, both))
    return i1[np.argsort(k1.to_numpy()[i1])], i2[np.argsort(k2.to_numpy()[i2])]


def grouped(c, cv, split=None, folds=None):
    """LOYO errors (or over `folds`) with a temperate and a boreal requirement (cells at or north of
    `split`), each fitted on its own training cell-years; one requirement when `split` is None."""
    obs = c.obs.to_numpy()
    f_at = cf.at(cv, obs)
    boreal = np.zeros(len(c), bool) if split is None else (c.lat >= split).to_numpy()
    err = np.full(len(c), np.nan)
    for train, test in (folds or loyo_folds(c)):
        for g in (boreal, ~boreal):
            tr, te = train & g, test & g
            if te.any() and tr.sum() >= 3:
                err[te] = cf.predict(cv[te], np.nanmedian(f_at[tr])) - obs[te]
    return err


def ramped(c, cv, ramp, split=BOREAL_LAT):
    """LOYO errors with the two requirements fitted on the training cell-years either side of `split`,
    the requirement moving evenly across `ramp` (south, north latitude; a cut when they are equal)."""
    obs, lat = c.obs.to_numpy(), c.lat.to_numpy()
    f_at = cf.at(cv, obs)
    lo, hi = ramp
    w = (lat >= hi).astype(float) if lo == hi else np.clip((lat - lo) / (hi - lo), 0.0, 1.0)
    err = np.full(len(c), np.nan)
    for train, test in loyo_folds(c):
        f_temp, f_bor = np.nanmedian(f_at[train & (lat < split)]), np.nanmedian(f_at[train & (lat >= split)])
        err[test] = cf.predict(cv[test], f_temp + w[test] * (f_bor - f_temp)) - obs[test]
    return err


def temperate_folds(c):
    """West (lon < 5: GB, IE, France, the Benelux, Iberia) <-> east (lon >= 12) among the temperate cells."""
    temp = (c.lat < BOREAL_LAT).to_numpy()
    w, e = temp & (c.lon < 5).to_numpy(), temp & (c.lon >= 12).to_numpy()
    return {"west (lon < 5) -> east (lon >= 12)": (w, e), "east -> west": (e, w)}


def groups(rec, c, t, cv, m, f_all, series_, args, lapse):
    """Does a group (the boreal birches, larch, chestnut) need its own requirement? Returns
    ({group: requirement}, the station offsets)."""
    print("# 6. Groups: one European requirement, or several?\n")
    obs = c.obs.to_numpy()
    err = cf.predict(cv, f_all) - obs
    clat, clon = cf.power_cell(rec.lat, rec.lon)
    k = (rec.state == "colored").to_numpy()
    colr = rec[k].assign(clat=clat[k], clon=clon[k])
    colr = colr.assign(larch=larch_share(colr.lat, colr.lon, args.cache, "forest"))
    cy = colr.groupby(["clat", "clon", "year"]).agg(larch=("larch", "mean"),
                                                    larch_rec=("group", lambda g: float((g == "larch").mean())))
    cy = cy.reindex(list(zip(c.lat, c.lon, c.year)))
    rows = []
    for name, k in ([(f"latitude {a}-{b}", c.lat.between(a, b - 1e-9)) for a, b in
                     ((34, 45), (45, 49.5), (49.5, 55), (55, 60), (60, 72))]
                    + [(f"ground {a}-{b} m", c.ground.between(a, b - 1e-9)) for a, b in
                       ((-50, 300), (300, 600), (600, 1000), (1000, 4000))]
                    + [(f"lon < 5 (west), lat < {BOREAL_LAT:g}", (c.lon < 5) & (c.lat < BOREAL_LAT)),
                       (f"lon >= 12 (east), lat < {BOREAL_LAT:g}", (c.lon >= 12) & (c.lat < BOREAL_LAT))]
                    + [(f"larch share of the trees {a:g}-{b:g}", pd.Series(cy.larch.to_numpy()).between(a, b - 1e-9))
                       for a, b in ((0, 0.05), (0.05, 0.2), (0.2, 1.01))]
                    + [("larch records >= half the colored", pd.Series(cy.larch_rec.to_numpy()) >= 0.5)]):
        k = k.to_numpy()
        if k.sum():
            rows.append((name, int(k.sum()), f"{np.nanmean(err[k]):+.1f}", f"{cf.mae(err, k)[0]:.1f}",
                         f"{np.nanmedian(cf.at(cv[k], obs[k])):.0f}"))
    print("In-sample error of one requirement (predicted - observed) by band, and the band's own requirement:\n")
    table(["cell-years", "n", "bias (d)", "MAE (d)", "own requirement"], rows)

    rows = []
    for split in (None, 56, 58, 60, 62, 64):
        e = grouped(c, cv, split)
        b = np.zeros(len(c), bool) if split is None else (c.lat >= split).to_numpy()
        rows.append(("one requirement" if split is None else f"boreal from {split} N", int(b.sum()),
                     f"{cf.mae(e)[0]:.2f}", f"{cf.mae(e, ~b)[0]:.2f}", f"{cf.mae(e, b)[0]:.2f}" if b.any() else "-",
                     f"{np.nanmedian(cf.at(cv[b], obs[b])):.0f}" if b.any() else "-",
                     f"{np.nanmedian(cf.at(cv[~b], obs[~b])):.0f}"))
    print("Leave one year out with a boreal requirement north of a latitude:\n")
    table(["split", "boreal cell-years", "LOYO MAE (d)", "temperate", "boreal", "boreal requirement",
           "temperate requirement"], rows)

    boreal = (c.lat >= BOREAL_LAT).to_numpy()
    reqs = {"temperate": float(np.nanmedian(cf.at(cv[~boreal], obs[~boreal]))),
            "boreal": float(np.nanmedian(cf.at(cv[boreal], obs[boreal])))}
    # The groups' own cell-years: only that group's records.
    rows = []
    for g, sel in (("larch", rec.group == "larch"), (f"birch, >= {BOREAL_LAT:g} N", (rec.group == "birch") & (rec.lat >= BOREAL_LAT)),
                   (f"all, >= {BOREAL_LAT:g} N", rec.lat >= BOREAL_LAT), ("chestnut", rec.group == "chestnut"),
                   ("beech", rec.group == "beech"), ("oak", rec.group == "oak")):
        for mc in sorted({args.min_colored, 4}, reverse=True):
            cg, _ = cf.observed(rec[sel], mc)
            cg = cg[cg["median"].notna() & cg.year.isin(FIT_YEARS)].assign(obs=lambda d: d["median"]).reset_index(drop=True)
            if len(cg) < 2:
                rows.append((g, mc, len(cg), "", "", "", "", ""))
                continue
            tg, eg = temperatures(cg, args.cache, args.tmean, lapse)
            cg["ground"] = cg.ground.fillna(pd.Series(eg))
            cvg = cf.cold_sum(tg, m, cg.lat.to_numpy())
            ref = reqs["boreal"] if g.startswith(("birch", "all")) else reqs["temperate"]
            e0 = cf.predict(cvg, ref) - cg.obs.to_numpy()
            f_g = cf.at(cvg, cg.obs.to_numpy())
            el = grouped(cg, cvg) if cg.year.nunique() > 1 else np.full(len(cg), np.nan)
            rows.append((g, mc, len(cg), f"{cg.ground.median():.0f} m", f"{cf.mae(e0)[0]:.2f} ({np.nanmean(e0):+.1f})",
                         f"{np.nanmedian(f_g):.0f} ({np.nanpercentile(f_g, 25):.0f}-{np.nanpercentile(f_g, 75):.0f})",
                         f"{cf.mae(el)[0]:.2f}", cf.day_name(cg.obs.median())))
            if g == "larch" and mc == args.min_colored:
                reqs["larch"] = float(np.nanmedian(f_g))
    print("iNaturalist cell-years of one group's records only (2016-2025), against the temperate (boreal) "
          "requirement:\n")
    table(["group", "min colored", "cell-years", "median ground", "group's requirement: MAE (bias)",
           "own requirement (IQR)", "own, LOYO MAE", "median observed"], rows)

    # The stations: each group against beech at the same station and year (both 50% colouring or fall).
    rows, offsets = [], {}
    for net in ("DWD", "MeteoSwiss"):
        for phase in ("colouring", "leaf fall"):
            b = series_.get(f"{net} beech {phase}")
            for g in ("larch", "silver birch", "chestnut", "pedunculate oak", "rowan", "horse chestnut", "sycamore"):
                o = series_.get(f"{net} {g} {phase}")
                if b is None or o is None:
                    continue
                ib, io_ = paired(b[0], o[0])
                if len(ib) < 30:
                    continue
                sb, so = b[0].iloc[ib].reset_index(drop=True), o[0].iloc[io_].reset_index(drop=True)
                cb_, co = cf.cold_sum(b[1][ib], m, sb.lat.to_numpy()), cf.cold_sum(o[1][io_], m, so.lat.to_numpy())
                rb = float(np.nanmedian(cf.at(cb_, sb.obs.to_numpy())))
                ro = float(np.nanmedian(cf.at(co, so.obs.to_numpy())))
                gap = so.obs.to_numpy() - sb.obs.to_numpy()
                by = []
                for lo_, hi_ in ((-100, 800), (800, 1300), (1300, 3000)):
                    k = so.ground.between(lo_, hi_ - 1e-9).to_numpy()
                    by.append(f"{np.nanmean(gap[k]):+.1f} (n {int(k.sum())})" if k.sum() >= 10 else "-")
                rows.append((net, phase, g, len(ib), so.site.nunique(), f"{np.mean(gap):+.1f}", *by, f"{rb:.0f}",
                             f"{ro:.0f}", f"{ro - rb:+.0f}"))
                offsets[(net, phase, g)] = ro - rb
    print("Station-years with both beech and the group at the same phase, the recommended model:\n")
    table(["network", "phase", "group", "station-years", "stations", "group minus beech (d)", "below 800 m",
           "800-1,300 m", "above 1,300 m", "beech requirement", "group's own", "difference"], rows)
    return reqs, offsets


# ------------------------------------------------------------------ production's cells ----

COMPARE = (date(2026, 9, 1), date(2026, 10, 7))  # WeatherAPI days POWER also has


def master_source(region, args):
    if args.masters:
        return args.masters[0 if region == "NE" else 1]
    import build_season_curves as bsc

    bsc.load_dotenv(ROOT / ".env")
    return bsc.get_required_env(f"{region}_WEATHER_DATA")


def prod_cells(region, args):
    """Production's 0.1-degree cells of a region (base points' mean elevation), cached."""
    path = args.cache / "master" / f"{region}_cells.parquet"
    if not path.exists():
        import fsspec
        import pyarrow.parquet as pq

        src = master_source(region, args)
        pts = []
        with fsspec.open(src, block_size=2 ** 22).open() as f:
            pf = pq.ParquetFile(f)
            for rg in range(pf.num_row_groups):
                pts.append(pf.read_row_group(rg, columns=["Latitude", "Longitude", "Elevation (m)"]).to_pandas()
                           .drop_duplicates())
        pts = pd.concat(pts).drop_duplicates()
        pts["cy"] = np.rint(pts.Latitude / bloom.CELL).astype(int)
        pts["cx"] = np.rint(pts.Longitude / bloom.CELL).astype(int)
        out = pts.groupby(["cy", "cx"])["Elevation (m)"].mean().rename("elev").reset_index()
        path.parent.mkdir(parents=True, exist_ok=True)
        out.to_parquet(path.with_suffix(".part"))
        path.with_suffix(".part").replace(path)
    return pd.read_parquet(path)


def place_elevation(prod, lat, lon, args):
    """Production's 0.1-degree cell elevation at each place (EU-DEM's cell mean where no base point is)."""
    cy, cx = np.rint(np.asarray(lat) / bloom.CELL).astype(int), np.rint(np.asarray(lon) / bloom.CELL).astype(int)
    e = prod.set_index(["cy", "cx"]).elev.reindex(list(zip(cy, cx))).to_numpy()
    dem_cell, dem_site = ch.cell_elevation(np.asarray(lat, float), np.asarray(lon, float), args.dem)
    return np.where(np.isfinite(e), e, dem_cell), dem_site, np.isfinite(e)


def places(m, f_all, reqs, args):
    """A normal year (normals only) at well-known places, and over production's cells."""
    normals = load_normals()
    prod = {r: prod_cells(r, args) for r in ("NE", "SE")}
    rows = []
    for name, la, lo, kind in PLACES:
        r = "NE" if la >= NORTH else "SE"
        ze, zs, base = place_elevation(prod[r], [la], [lo], args)
        clat, clon = np.rint(la / bloom.CELL) * bloom.CELL, np.rint(lo / bloom.CELL) * bloom.CELL
        nt = bloom.daily_normals(normals, [clat], [clon], [ze[0]], date(2026, 7, 1), N_DAYS)
        curve = cf.cold_sum(nt, m, [clat])
        p = {g: cf.predict(curve, f)[0] for g, f in reqs.items()}
        rows.append((name, r, f"{zs[0]:.0f} m", f"{ze[0]:.0f} m{'' if base[0] else ' (DEM)'}",
                     *(cf.day_name(p[g]) for g in reqs), PUBLISHED.get(name, "-")))
    print("# 7. A normal year (1991-2020 normals only) at well-known places, on production's 0.1° cells\n")
    table(["place", "region", "site elevation", "cell elevation", *[f"{g} requirement" for g in reqs], "published"],
          rows)

    allc = pd.concat([prod["NE"].assign(region="NE"), prod["SE"].assign(region="SE")], ignore_index=True)
    nt = bloom.daily_normals(normals, allc.cy * bloom.CELL, allc.cx * bloom.CELL, allc.elev.to_numpy(),
                             date(2026, 7, 1), N_DAYS)
    curve = cf.cold_sum(nt, m, (allc.cy * bloom.CELL).to_numpy())
    rows = []
    for g, f in reqs.items():
        peak = cf.predict(curve, f)
        for r in ("NE", "SE"):
            k = (allc.region == r).to_numpy()
            p = pd.Series(peak[k])
            rows.append((g, r, int(k.sum()), cf.day_name(p.quantile(0.01)), cf.day_name(p.quantile(0.5)),
                         cf.day_name(p.quantile(0.99)), f"{p.isna().mean():.1%}",
                         f"{(p > (date(2026, 11, 30) - date(2026, 7, 1)).days).mean():.1%}",
                         f"{(p < (date(2026, 9, 1) - date(2026, 7, 1)).days).mean():.1%}"))
        allc[f"peak_{g}"] = peak
    print("## A normal year over production's 0.1° cells\n")
    table(["requirement", "region", "cells", "1st percentile", "median", "99th percentile", "no peak by 31 Dec",
           "after 30 Nov", "before 1 Sep"], rows)
    return allc


def weatherapi(c, t, m, f_all, args):
    """WeatherAPI (the masters' daily (Tmax + Tmin) / 2 per POWER cell) minus POWER at the calibration's cells."""
    frames = []
    for region in ("NE", "SE"):
        path = args.cache / "master" / f"{region}_power_cells.parquet"
        if not path.exists():
            ch.master_cells(master_source(region, args), args.cache, region)
        frames.append(pd.read_parquet(path).assign(region=region))
    w = pd.concat(frames)
    w = w[w.points >= 3]
    rows = []
    for (a, b), g in c[["lat", "lon"]].drop_duplicates().groupby(["lat", "lon"]):
        mw = w[(w.clat == a) & (w.clon == b)].drop_duplicates("date").set_index("date")
        mw = mw[(mw.index >= pd.Timestamp(COMPARE[0])) & (mw.index <= pd.Timestamp(COMPARE[1]))]
        if len(mw) < 20:
            continue
        p, elev = power(a, b, args.cache)
        j = mw.join(p, how="inner")
        tw = j.t + bloom.LAPSE * (j.elev - elev)  # WeatherAPI moved to POWER's grid elevation
        rows.append(dict(lat=a, lon=b, d_t2m=float((tw - j.T2M).mean()),
                         d_minmax=float((tw - (j.T2M_MAX + j.T2M_MIN) / 2).mean()),
                         r=float(np.corrcoef(tw, j.T2M)[0, 1]), days=len(j)))
    off = pd.DataFrame(rows)
    print(f"# 8. WeatherAPI minus POWER, {COMPARE[0]:%d %b} - {COMPARE[1]:%d %b %Y} (the masters' (Tmax + Tmin) / 2, "
          f"moved to POWER's grid elevation)\n")
    if not len(off):
        print("No master cells at the calibration's cells.\n")
        return
    d = off.d_t2m.median() if args.tmean == "t2m" else off.d_minmax.median()
    lat = c.lat.to_numpy()
    moved = cf.predict(cf.cold_sum(t + d, m, lat), f_all) - cf.predict(cf.cold_sum(t, m, lat), f_all)
    north = off.lat >= NORTH
    table(["cells", "POWER cells", "minus T2M (median)", "minus (T2M_MAX + T2M_MIN) / 2", "T2M, 10-90% of cells",
           "daily r", "peak moves if uncorrected (d)"],
          [(name, int(k.sum()), f"{off.d_t2m[k].median():+.2f}", f"{off.d_minmax[k].median():+.2f}",
            f"{off.d_t2m[k].quantile(0.1):+.2f} to {off.d_t2m[k].quantile(0.9):+.2f}", f"{off.r[k].median():.2f}",
            f"{np.nanmean(moved):+.1f}" if name == "all" else "")
           for name, k in (("all", off.lat > -90), ("NE", north), ("SE", ~north)) if k.sum()])



# ------------------------------------------------------------------ where to draw ---------

CLASSES = (311, 312, 313, 321, 322, 324, 333)
ALPS = (5.0, 43.5, 16.5, 48.2)  # west, south, east, north


def wilderness(args):
    """The NE and SE wilderness polygons of CLASSES (raster_val), cached as GeoParquet with each piece's
    middle, its larch share (of the trees and of the ground), its middle's elevation (312 only) and area."""
    import geopandas as gpd
    import pyogrio

    path = args.cache / "ground" / "eu_wilderness.parquet"
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        parts = []
        for region, src in zip(("NE", "SE"), args.wilderness):
            df = pyogrio.read_dataframe(src, columns=["raster_val"])
            df = df[df.raster_val.isin(CLASSES)]
            parts.append(gpd.GeoDataFrame({"cls": df.raster_val.astype("int16").to_numpy(), "region": region},
                                          geometry=df.geometry.values, crs="EPSG:4326"))
        poly = pd.concat(parts, ignore_index=True)
        mid = poly.geometry.representative_point()
        poly["mx"], poly["my"] = mid.x.to_numpy(), mid.y.to_numpy()
        poly["larch_forest"] = larch_share(poly.my, poly.mx, args.cache, "forest")
        poly["larch_ground"] = larch_share(poly.my, poly.mx, args.cache, "ground")
        z = np.full(len(poly), np.nan)
        k = (poly.cls == 312).to_numpy()
        z[k] = ch.dem_elevations(poly.my.to_numpy()[k], poly.mx.to_numpy()[k], args.dem)
        poly["z"] = z
        poly["km2"] = poly.to_crs(3035).area.to_numpy() / 1e6
        gpd.GeoDataFrame(poly, crs="EPSG:4326").to_parquet(path.with_suffix(".part"), compression="zstd")
        path.with_suffix(".part").replace(path)
    return gpd.read_parquet(path)


def where(rec, m, f_all, reqs, args, cells):
    """Distance of the colored-leaf sightings to the wilderness polygons, by CORINE class and candidate rule."""
    import geopandas as gpd
    import shapely

    print("# 9. Where to draw it\n")
    poly = wilderness(args)
    g3 = poly.to_crs(3035).geometry.values
    col = rec[rec.state == "colored"].reset_index(drop=True)
    pts = gpd.GeoSeries(gpd.points_from_xy(col.lon, col.lat), crs=4326).to_crs(3035).values
    alps = ((poly.mx >= ALPS[0]) & (poly.my >= ALPS[1]) & (poly.mx < ALPS[2]) & (poly.my < ALPS[3])).to_numpy()
    print(f"Wilderness polygons of classes {', '.join(map(str, CLASSES))}: NE {int((poly.region == 'NE').sum())}, "
          f"SE {int((poly.region == 'SE').sum())}; colored-leaf sightings 2016-2026: {len(col)}.\n")
    cache = {}

    def near(mask):
        key = mask.tobytes()
        if key not in cache:
            tree = shapely.STRtree(g3[mask])
            out = []
            for d in (0, 300, 1000):
                hit = np.zeros(len(pts), bool)
                i = tree.query(pts, predicate="intersects")[0] if d == 0 else \
                    tree.query(pts, predicate="dwithin", distance=d)[0]
                hit[np.unique(i)] = True
                out.append(hit)
            cache[key] = out
        return cache[key]

    sets = {"all": np.ones(len(col), bool), "beech + oak": col.group.isin(["beech", "oak"]).to_numpy(),
            "larch": (col.group == "larch").to_numpy(), "chestnut": (col.group == "chestnut").to_numpy(),
            "birch >= 60 N": ((col.group == "birch") & (col.lat >= 60)).to_numpy(),
            "all >= 60 N": (col.lat >= 60).to_numpy()}
    cls = poly.cls.to_numpy()
    rows = []
    for k in CLASSES:
        h = near(cls == k)
        rows.append((k, int((cls == k).sum()), f"{poly.km2[cls == k].sum():,.0f}",
                     *(f"{h[i][sets[s]].mean():.1%}" for s in ("all", "larch", "birch >= 60 N") for i in (0, 1, 2))))
    print("## Sightings by CORINE class (in / within 300 m / within 1 km)\n")
    table(["class", "polygons", "km²", "all: in", "300 m", "1 km", "larch: in", "300 m", "1 km",
           "birch >= 60 N: in", "300 m", "1 km"], rows)

    lf, z = poly.larch_forest.to_numpy(), poly.z.to_numpy()
    broad = np.isin(cls, (311, 313))
    rules = {"311": cls == 311, "313": cls == 313, "311 + 313": broad, "311 + 312 + 313": np.isin(cls, (311, 312, 313)),
             "311 + 313 + 324": np.isin(cls, (311, 313, 324))}
    for x in (0.1, 0.2, 0.3, 0.5):
        rules[f"311 + 313 + 312 with larch >= {x:.0%} of the trees"] = broad | ((cls == 312) & (lf >= x))
    for e in (1000, 1300, 1600):
        rules[f"311 + 313 + 312 in the Alps from {e:,} m"] = broad | ((cls == 312) & alps & (np.nan_to_num(z) >= e))
    for x, e in ((0.1, 1000), (0.2, 1000), (0.1, 1300)):
        rules[f"311 + 313 + 312 with larch >= {x:.0%} and from {e:,} m"] = broad | ((cls == 312) & (lf >= x)
                                                                                   & (np.nan_to_num(z) >= e))
    for x, e in ((0.1, 1300), (0.2, 1300), (0.1, 1600)):
        rules[f"311 + 313 + 312 with larch >= {x:.0%}, or in the Alps from {e:,} m"] = broad | (
            (cls == 312) & ((lf >= x) | (alps & (np.nan_to_num(z) >= e))))
    north = (poly.my >= 60).to_numpy()
    rules["311 + 313 + 324 north of 60 N"] = broad | ((cls == 324) & north)
    rules["311 + 313 + 312 larch >= 20% + 324 north of 60 N"] = broad | ((cls == 312) & (lf >= 0.2)) | ((cls == 324) & north)
    rows = []
    for name, mask in rules.items():
        h = near(mask)
        rows.append((name, int(mask.sum()), f"{poly.km2[mask].sum():,.0f}",
                     *(f"{h[i][sets[s]].mean():.1%}" for s in ("all", "beech + oak", "larch", "chestnut",
                                                                "all >= 60 N") for i in (0, 1, 2))))
    print("## Candidate grounds (in / within 300 m / within 1 km)\n")
    table(["ground", "polygons", "km²", *[f"{s}: {d}" for s in ("all", "beech + oak", "larch", "chestnut", ">= 60 N")
                                          for d in ("in", "300 m", "1 km")]], rows)
    m312 = cls == 312
    print("312 polygons by the host cover's larch share of the trees at their middle: "
          + ", ".join(f">= {x:.0%}: {int((m312 & (lf >= x)).sum())} ({poly.km2[m312 & (lf >= x)].sum():,.0f} km², "
                      f"{(m312 & (lf >= x) & alps).sum() / max((m312 & (lf >= x)).sum(), 1):.0%} in the Alps box)"
                      for x in (0.1, 0.2, 0.3, 0.5)) + ".\n")
    lc = col[sets["larch"]]
    print(f"Larch sightings ({len(lc)}): ground median {lc.ground.median():.0f} m, 10-90% "
          f"{lc.ground.quantile(0.1):.0f}-{lc.ground.quantile(0.9):.0f} m; in the Alps box "
          f"{((lc.lon >= ALPS[0]) & (lc.lat >= ALPS[1]) & (lc.lon < ALPS[2]) & (lc.lat < ALPS[3])).mean():.0%}; "
          f"larch share of the trees there: median {np.median(larch_share(lc.lat, lc.lon, args.cache, 'forest')):.0%}.\n")

    # Named places: the nearest broadleaf / mixed piece and larch-rule piece, and the larch share.
    hp = gpd.GeoSeries(gpd.points_from_xy([p[2] for p in PLACES], [p[1] for p in PLACES]), crs=4326).to_crs(3035)
    larch_rule = (cls == 312) & ((lf >= LARCH_SHARE) | (alps & (np.nan_to_num(z) >= LARCH_ALPS_MIN_ELEV)))
    rows = []
    for (name, a, b, kind), p in zip(PLACES, hp.values):
        d = []
        for mask in (broad, larch_rule, (cls == 324) & north):
            gg = g3[mask]
            i = shapely.STRtree(gg).nearest(p)
            d.append(f"{shapely.distance(p, gg[i]) / 1000:.1f}")
        rows.append((name, kind, *d, f"{larch_share([a], [b], args.cache, 'forest')[0]:.0%}"))
    table(["place", "group", "km to 311/313", f"km to the larch 312 (>= {LARCH_SHARE:.0%}, or Alps from {LARCH_ALPS_MIN_ELEV:,.0f} m)", "km to 324 north of 60 N",
           "larch share of the trees"], rows)

    # The normal year as a cutoff, over production's cells with broadleaf or mixed ground.
    have = pd.DataFrame({"cy": np.rint(poly.my[broad] / bloom.CELL).astype(int),
                         "cx": np.rint(poly.mx[broad] / bloom.CELL).astype(int)}).drop_duplicates()
    cw = cells.merge(have, on=["cy", "cx"])
    peak = cw[f"peak_{'temperate' if 'temperate' in reqs else next(iter(reqs))}"].to_numpy()
    rows = [(f"after {cf.day_name(d)}", f"{np.mean(~(peak <= d)):.1%}", int((~(peak <= d)).sum()))
            for d in (152, 160, 167, 183)]
    look = cells.drop_duplicates(["cy", "cx"]).set_index(["cy", "cx"])[f"peak_{'temperate' if 'temperate' in reqs else next(iter(reqs))}"]
    sp = look.reindex(list(zip(np.rint(col.lat / bloom.CELL).astype(int), np.rint(col.lon / bloom.CELL).astype(int))))
    sp = sp.to_numpy()
    print(f"## A normal year as a cutoff: production's cells with 311/313 ground ({len(cw)})\n")
    table(["normal-year peak (temperate requirement)", "share of the cells", "cells"],
          rows + [("sightings whose cell peaks after 30 Nov", f"{np.mean(sp[np.isfinite(sp)] > 152):.1%}",
                   int((sp > 152).sum()))])


if __name__ == "__main__":
    main()
