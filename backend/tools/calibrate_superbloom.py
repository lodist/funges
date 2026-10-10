#!/usr/bin/env python3
"""Calibrate the desert superbloom spectacle: how strong this season's bloom is, and when it peaks.

The model (top of this file, pure numpy like bloom.peak_index):
  * strength: rain from 1 October to 31 March over its 1991-2020 normal (rain_ratio), cut
    into none / ordinary / good / superbloom at LEVELS;
  * peak: degree-days above FORCE_BASE from 15 January, or from the day the season's rain
    reaches START_SHARE of its normal if that is later, to FORCING (forcing_start, peak_index).
Days without usable rain (NaN: glitches above RAIN_CAP, days not yet measured, the forecast
and everything after it) count as their normal.

Everything is fitted on NASA POWER (MERRA-2, 0.5 x 0.625 degrees), whose 1991-2020
climatology gives the normals the forecast uses after its 7-day window. The cells are
POWER's own grid cells, so each has exactly one weather series. Temperatures are moved to
the median elevation of the cell-year's records (HydroSHEDS DEM) at LAPSE.

Observed bloom, from iNaturalist research-grade records of desert annuals in February-May
2014-2026 (INDICATORS; TAXA lists every candidate looked at):
  * strength: indicator records / all vascular-plant records in the same cell and year
    (iNaturalist's grid endpoint, February-May). The "anomaly" is the log of that share
    against the cell's median year, so a cell is compared with itself.
  * peak: the median day of the cell-year's indicator records (at least 10).
  Records count with or without iNaturalist's "flowering" annotation: annotators lag (35-59%
  of these records carry it in 2014-2024, 16% in 2025, 27% in 2026), so the annotation alone
  would read 2025-26 as failed years. The flowering-only peak is scored as a check.
  Cells: normal rain < MASK_RAIN, POWER elevation < MASK_ELEV, >= MIN_RECORDS desert-annual
  records (poppies aside: coastal garden poppies would otherwise bring in the coast).

Tests (leave one year out unless said otherwise):
  1. Strength: Spearman between the index and the observed share (pooled over cell-years)
     and its within-cell anomaly; the AUC between the superbloom years 2017, 2019, 2023 and
     the poor years 2018, 2021, 2022; quadratic-weighted kappa of the four levels against
     observed classes, with thresholds refitted without the held-out year, for two class
     definitions: OBS_CLASSES on the share against the cell's median year, and the cut-offs
     that best match the documented reports (fitted at the dry-run places). Baselines: the
     plain October-March rain total and, for the literature model, a germinating storm
     (25 mm in 3 days by 31 December), freeze and heat. The fixed LEVELS are scored too, and
     the forecast as it would stand on 1 November ... 1 March, normals after that day.
  2. Timing: mean absolute error of the predicted against the observed peak, FORCING refitted
     without the held-out year. Baselines: one date, a date per elevation band, a
     latitude/elevation line, each cell's own median date in its other years. Also the
     forecast as it stands on 1 February and 1 March.
  3. --grid: rain window x germinating-storm gate (size, days, last date); level thresholds
     against iNaturalist and the documented reports; rain share x forcing start x base.
  4. Dry run at seven well-known bloom places, 2016-2026, against DOCUMENTED reports.
  5. Where to draw: the share of desert-annual (and poppy) sightings, and of land, that each
     mask keeps; the named places; USW's 0.1-degree cells under the recommended rule.
  6. Rain sources: ERA5 (production's measured rain since October 2026; --era5, the step-2
     training blocks) against POWER, including the strength test run on ERA5 rain; and the
     master's stored WeatherAPI day-0 rain and temperatures (--weatherapi) against POWER;
     with --master, the days above RAIN_CAP in a live master, against their neighbours and ERA5.

    python backend/tools/calibrate_superbloom.py [--cache DIR] [--grid] [--era5 DIR]
                                                 [--weatherapi CSV] [--usw-base CSV] [--master URL]

A cold cache costs about 560 iNaturalist requests (1.1 s apart, Retry-After honoured) and
300 POWER requests; a failed or partial response is never cached. The DEM, NLCD, ERA5 and
WeatherAPI files are local (paths next to the repo); the sections that need a missing one
are skipped, except the DEM and NLCD, which the cells and the masks need.
"""
import argparse
import itertools
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

# ---------------------------------------------------------------- the model -----------------
# What backend/superbloom.py would hold: pure numpy over cells x days from 1 October.
RAIN_CAP = 150.0  # mm/day; above it a day is a glitch (US masters reach 2415 mm) and counts as missing
MEASURED_SCALE = 0.89  # ERA5 rains 1.12x POWER on bloom ground (1/1.124); production scales measured rain
RATIO_END = (3, 31)  # the season's rain is counted from 1 October to here
LEVELS = (0.60, 1.00, 1.50)  # rain / normal at which ordinary, good and superbloom start
FORCE_START = (1, 15)  # thermal time for the peak counts from here at the earliest
START_SHARE = 0.40  # ... and not before the season's rain reaches this share of its normal
FORCE_BASE = 0.0  # degrees C, daily mean (Tmax + Tmin) / 2
FORCING = 840.0  # degree-days above FORCE_BASE from the start to the peak
LAPSE = 0.0065  # degrees C per metre, moves a temperature to a cell's elevation
STRENGTH_NAMES = ("none", "ordinary", "good", "superbloom")


def clean_rain(rain, measured=None):
    """Daily rain with the glitches removed: above RAIN_CAP, or not measured, is NaN."""
    r = np.array(rain, float)
    r[~(r <= RAIN_CAP)] = np.nan  # NaN stays NaN
    if measured is not None:
        r[~np.asarray(measured, bool)] = np.nan
    return r


def rain_ratio(rain, normal, end):
    """Rain from day 0 to day `end` over its normal, per row; a NaN day counts as normal,
    so the days after the forecast window, and any glitch, add exactly their normal."""
    r, n = rain[:, :end + 1], normal[:, :end + 1]
    return np.where(np.isfinite(r), r, n).sum(axis=1) / n.sum(axis=1)


def strength(ratio, levels=LEVELS):
    """0 none, 1 ordinary, 2 good, 3 superbloom."""
    return np.digitize(ratio, levels)


def forcing_start(rain, normal, first, end, share=START_SHARE):
    """Per row, the day thermal time starts: `first` (FORCE_START's index), or later if the
    season's rain (normals on NaN days) reaches `share` of its normal to `end` only later."""
    filled = np.where(np.isfinite(rain), rain, normal)
    need = share * normal[:, :end + 1].sum(axis=1)
    reached = np.cumsum(filled, axis=1) >= need[:, None]
    when = np.where(reached.any(axis=1), reached.argmax(axis=1), rain.shape[1])
    return np.maximum(when, first)


def peak_index(tmean, start, base=FORCE_BASE, forcing=FORCING):
    """Index of the peak day in each row of `tmean` (cells x days from 1 Oct), NaN if the
    forcing is not reached by the end. `start` is forcing_start's per-row index.
    `tmean` must be complete: observed, forecast, then normals."""
    on = np.arange(tmean.shape[1])[None, :] >= np.asarray(start)[:, None]
    heat = np.cumsum(np.where(on, np.maximum(tmean - base, 0.0), 0.0), axis=1)
    done = heat >= forcing
    idx = done.argmax(axis=1).astype(float)
    idx[~done.any(axis=1)] = np.nan
    return idx


# ---------------------------------------------------------------- sources -------------------
INAT_V1 = "https://api.inaturalist.org/v1/observations?"
INAT_V2 = "https://api.inaturalist.org/v2/observations?"
INAT_GRID = "https://api.inaturalist.org/v1/grid/{z}/{x}/{y}.grid.json?"
POWER_DAILY = ("https://power.larc.nasa.gov/api/temporal/daily/point?parameters=PRECTOTCORR,T2M_MAX,T2M_MIN"
               "&community=AG&longitude={lon}&latitude={lat}&start=19900101&end=20260630&format=JSON")
POWER_CLIM = ("https://power.larc.nasa.gov/api/temporal/climatology/regional?parameters={p}"
              "&community=AG&latitude-min={s}&latitude-max={n}&longitude-min={w}&longitude-max={e}"
              "&start=1991&end=2020&format=JSON")  # one parameter per request
UA = {"User-Agent": "funges-superbloom-calibration/1.0 (+https://www.fung.es)"}
ROOT = Path(__file__).resolve().parents[2]
DEM = ROOT.parent / "US" / "Static Info" / "na_con_3s.tif"  # HydroSHEDS 3" DEM, local
NLCD = ROOT.parent / "NLCD" / "Annual_NLCD_LndCov_2024_CU_C1V1.tif"  # local

BOX = {"swlat": 31.0, "swlng": -120.5, "nelat": 37.5, "nelng": -109.0}
WEST = {"swlat": 24.0, "swlng": -125.0, "nelat": 49.5, "nelng": -102.0}
YEARS = range(2014, 2027)
TRACHEOPHYTA = 211194
TAXA = {  # every taxon fetched; INDICATORS are the ones counted
    77248: "Geraea canescens", 50164: "Abronia villosa", 58222: "Oenothera deltoides",
    69421: "Lupinus arizonicus", 58029: "Malacothrix glabrata", 50171: "Phacelia campanularia",
    77083: "Eschscholzia glyptosperma", 48225: "Eschscholzia californica",
    76333: "Chylismia claviformis", 77054: "Eriophyllum wallacei", 64513: "Lupinus sparsiflorus",
    50876: "Layia platyglossa", 58033: "Monolopia lanceolata", 58050: "Amsinckia tessellata",
}
# The brief's seven desert annuals, the California poppy (ssp. mexicana is Picacho Peak's
# poppy; inside the arid mask its year signal tracks the desert annuals as well as they
# track each other, outside it the records are garden plantings), and the two candidates
# whose year signal tracks the others' within cells at rho >= 0.5.
INDICATORS = (77248, 50164, 58222, 69421, 58029, 50171, 77083, 48225, 76333, 64513)
DESERT = tuple(i for i in INDICATORS if i != 48225)  # what makes a cell desert bloom ground
FIELDS = ("id,observed_on,location,obscured,taxon.id,"
          "annotations.controlled_attribute_id,annotations.controlled_value_id")
GRID_Z, GEO_Z = 6, 11  # a z6 grid tile carries 32 x 32 cells, which are z11 geotiles
MONTHS = ("JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC")
MONTH_DAYS = np.array([31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31])
MID = np.array([15.5, 45.0, 74.5, 105.0, 135.5, 166.0, 196.5, 227.5, 258.0, 288.5, 319.0, 349.5])

# ---------------------------------------------------------------- analysis settings ---------
CELL_LAT, CELL_LON = 0.5, 0.625  # POWER's grid
MASK_RAIN, MASK_ELEV = 350.0, 1500.0  # bloom ground: 1991-2020 normal rain (mm/yr), elevation (m)
RANGE_KM, RANGE_RECORDS = 50.0, 25  # ... and this many desert-annual records (any year) within this radius
MIN_EFFORT = 100  # vascular-plant records a cell-year needs
MIN_RECORDS = 30  # desert-annual records (poppies aside) a cell needs over 2014-2026
MIN_PEAK_RECORDS = 10  # indicator records a cell-year needs for a peak date
OBS_CLASSES = (0.35, 0.80, 1.25)  # observed share / the cell's median year: none | ordinary | good | superbloom
SUPER, POOR = (2017, 2019, 2023), (2018, 2021, 2022)
SITES = {  # dry run: name -> lat, lon (the display, not the visitor centre)
    "Anza-Borrego (Borrego Valley)": (33.25, -116.33),
    "Death Valley (Badwater Rd)": (36.15, -116.75),
    "Joshua Tree (Pinto Basin)": (33.90, -115.75),
    "Antelope Valley Poppy Reserve": (34.733, -118.410),
    "Carrizo Plain (Soda Lake)": (35.20, -119.86),
    "Picacho Peak SP": (32.646, -111.401),
    "Walker Canyon, Lake Elsinore": (33.748, -117.400),
}


class Http:
    """Sequential, throttled GETs; a response is cached only once it parsed and validated."""

    def __init__(self, gap):
        self.gap, self.last = gap, 0.0

    def json(self, url, path, valid=lambda j: True):
        if path.exists():
            return json.loads(path.read_bytes())
        path.parent.mkdir(parents=True, exist_ok=True)
        for attempt in range(8):
            time.sleep(max(0.0, self.gap - (time.time() - self.last)))
            self.last = time.time()
            try:
                with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=300) as r:
                    raw = r.read()
                js = json.loads(raw)
                if not valid(js):
                    raise ValueError("incomplete response")
                tmp = path.with_suffix(".part")
                tmp.write_bytes(raw)
                tmp.replace(path)
                return js
            except urllib.error.HTTPError as e:
                wait = int(e.headers.get("Retry-After") or 0) if e.code == 429 else 0
                print(f"  HTTP {e.code} ({attempt}); waiting {max(wait, 5 * 2 ** attempt)} s", file=sys.stderr)
                time.sleep(max(wait, 5 * 2 ** attempt))
            except Exception as e:  # timeouts, resets, truncated JSON
                print(f"  {type(e).__name__}: {e} ({attempt})", file=sys.stderr)
                time.sleep(5 * 2 ** attempt)
        raise RuntimeError(f"failed: {url}")


INAT = Http(1.1)
POWER = Http(0.5)


def geotile(lat, lon, z=GEO_Z):
    n = 2 ** z
    lat = np.clip(np.asarray(lat, float), -85, 85)
    gx = np.floor((np.asarray(lon, float) + 180) / 360 * n).astype(np.int64)
    gy = np.floor((1 - np.arcsinh(np.tan(np.radians(lat))) / np.pi) / 2 * n).astype(np.int64)
    return gx, gy


def geotile_centre(gx, gy, z=GEO_Z):
    n = 2 ** z
    lon = (np.asarray(gx) + 0.5) / n * 360 - 180
    lat = np.degrees(np.arctan(np.sinh(np.pi * (1 - 2 * (np.asarray(gy) + 0.5) / n))))
    return lat, lon


def power_cell(lat, lon):
    return np.rint(np.asarray(lat) / CELL_LAT).astype(int), np.rint(np.asarray(lon) / CELL_LON).astype(int)


def geotile_cell(gx, gy):
    """The POWER cell a geotile belongs to (by its centre), so records and effort share cells."""
    return power_cell(*geotile_centre(gx, gy))


def inat_observations(cache):
    """Research-grade records of TAXA in BOX, February-May 2014-2026, one row each."""
    rows = []
    for taxon in TAXA:
        id_above = 0
        while True:
            q = dict(taxon_id=taxon, quality_grade="research", d1="2014-01-01", d2="2026-05-31",
                     month="2,3,4,5", per_page=200, order_by="id", order="asc", id_above=id_above,
                     fields=FIELDS, **BOX)
            js = INAT.json(INAT_V2 + urllib.parse.urlencode(q), cache / "inat" / f"obs_{taxon}_{id_above}.json",
                           lambda j: "results" in j and "total_results" in j)
            for o in js["results"]:
                if not o.get("location") or not o.get("observed_on"):
                    continue
                lat, lon = map(float, o["location"].split(","))
                flow = any(a.get("controlled_attribute_id") == 12 and a.get("controlled_value_id") == 13
                           for a in o.get("annotations") or [])
                rows.append((o["id"], o["taxon"]["id"], taxon, o["observed_on"], lat, lon, flow))
            if len(js["results"]) < 200:
                break
            id_above = js["results"][-1]["id"]
    df = pd.DataFrame(rows, columns=["id", "taxon", "query", "date", "lat", "lon", "flowering"])
    df = df.drop_duplicates("id")
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df = df.dropna(subset=["date"]).reset_index(drop=True)
    df["year"], df["doy"] = df.date.dt.year, df.date.dt.dayofyear
    df["ci"], df["cj"] = geotile_cell(*geotile(df.lat, df.lon))
    return df


def grid_tiles(box):
    x0, y1 = geotile(box["swlat"], box["swlng"], GRID_Z)
    x1, y0 = geotile(box["nelat"], box["nelng"], GRID_Z)
    return [(x, y) for x in range(int(x0), int(x1) + 1) for y in range(int(y0), int(y1) + 1)]


def inat_grid(cache, tag, box=BOX, **params):
    """Record counts per z11 geotile over the box's z6 tiles: DataFrame gx, gy, n."""
    rows = []
    for x, y in grid_tiles(box):
        url = INAT_GRID.format(z=GRID_Z, x=x, y=y) + urllib.parse.urlencode(params)
        js = INAT.json(url, cache / "inat" / f"grid_{tag}_{x}_{y}.json", lambda j: "data" in j)
        for v in js["data"].values():
            gx, gy = geotile(v["latitude"], v["longitude"])
            rows.append((int(gx), int(gy), int(v.get("cellCount", 0))))
    df = pd.DataFrame(rows, columns=["gx", "gy", "n"])
    return df.groupby(["gx", "gy"], as_index=False)["n"].max()  # a cell on a tile edge comes twice


def inat_effort(cache):
    """Research-grade vascular-plant records, February-May, per year and POWER cell."""
    out = []
    for year in YEARS:
        g = inat_grid(cache, f"trach_{year}", taxon_id=TRACHEOPHYTA, quality_grade="research",
                      month="2,3,4,5", year=year)
        g["year"] = year
        out.append(g)
    g = pd.concat(out, ignore_index=True)
    g["ci"], g["cj"] = geotile_cell(g.gx, g.gy)
    return g.groupby(["ci", "cj", "year"]).n.sum().rename("trach")


def inat_count(cache, tag, **params):
    js = INAT.json(INAT_V1 + urllib.parse.urlencode(dict(params, per_page=0)), cache / "inat" / f"count_{tag}.json",
                   lambda j: "total_results" in j)
    return js["total_results"]


def power_daily(lat, lon, cache):
    def ok(j):
        p = j.get("properties", {}).get("parameter", {})
        return all(len(p.get(k, {})) > 13000 for k in ("PRECTOTCORR", "T2M_MAX", "T2M_MIN"))

    js = POWER.json(POWER_DAILY.format(lat=lat, lon=lon), cache / "power" / f"daily_{lat}_{lon}.json", ok)
    p = js["properties"]["parameter"]
    df = pd.DataFrame({k: pd.Series(p[k], dtype=float) for k in ("PRECTOTCORR", "T2M_MAX", "T2M_MIN")})
    df.index = pd.to_datetime(df.index, format="%Y%m%d")
    return df.where(df > -900), float(js["geometry"]["coordinates"][2])


def power_cell_daily(ci, cj, cache):
    return power_daily(ci * CELL_LAT, round(cj * CELL_LON, 4), cache)


def power_climatology(cache, param, lat=(30, 40), lon=(-130, -100)):
    """1991-2020 monthly normals of one POWER parameter on POWER's grid, indexed by cell:
    DataFrame elev, m01..m12 (mm/day for PRECTOTCORR, degrees C for T2M)."""
    rows = []
    for s in range(lat[0], lat[1], 10):
        for w in range(lon[0], lon[1], 10):
            js = POWER.json(POWER_CLIM.format(p=param, s=s, n=s + 10, w=w, e=w + 10),
                            cache / "power" / f"clim_{param}_{s}_{w}.json",
                            lambda j: len(j.get("features", [])) > 100)
            for f in js["features"]:
                x, y, z = f["geometry"]["coordinates"]
                v = f["properties"]["parameter"][param]
                rows.append([y, x, z] + [v[m] for m in MONTHS])
    df = pd.DataFrame(rows, columns=["lat", "lon", "elev"] + [f"m{i:02d}" for i in range(1, 13)])
    df["ci"], df["cj"] = power_cell(df.lat, df.lon)
    return df.drop_duplicates(["ci", "cj"]).set_index(["ci", "cj"])


def dem_at(lat, lon):
    import rasterio

    with rasterio.open(DEM) as r:
        v = np.array([x[0] for x in r.sample(zip(lon, lat))], float)
    v[v == 32767] = np.nan
    return v


def nlcd_at(lat, lon):
    import rasterio
    from pyproj import Transformer

    with rasterio.open(NLCD) as r:
        x, y = Transformer.from_crs("EPSG:4326", r.crs, always_xy=True).transform(lon, lat)
        return np.array([v[0] for v in r.sample(zip(x, y))])


# ---------------------------------------------------------------- season arrays -------------
def season_first(year):
    return date(year - 1, 10, 1)


def season_days(year):
    return (date(year, 5, 31) - season_first(year)).days + 1


def index_of(year, md):
    month, day = md
    return (date(year - 1 if month >= 10 else year, month, day) - season_first(year)).days


def daily_from_monthly(monthly, first, n_days):
    """Monthly means (rows x 12) to days from `first`, linear between mid-months (bloom.py)."""
    doy = np.array([(first + timedelta(days=d)).timetuple().tm_yday for d in range(n_days)], float)
    ext = np.concatenate([[MID[-1] - 365], MID, [MID[0] + 365]])
    month = np.concatenate([[11], np.arange(12), [0]])
    hi = np.searchsorted(ext, doy, side="right").clip(1, len(ext) - 1)
    frac = (doy - ext[hi - 1]) / (ext[hi] - ext[hi - 1])
    return monthly[:, month[hi - 1]] * (1 - frac) + monthly[:, month[hi]] * frac


def season_block(power, keys, year):
    """Rain, Tmax, Tmin (rows x days from 1 Oct) and POWER grid elevation for `keys`."""
    idx = pd.date_range(season_first(year), periods=season_days(year))
    out = np.full((3, len(keys), len(idx)), np.nan)
    for i, k in enumerate(keys):
        df = power[k][0].reindex(idx)
        out[:, i] = df[["PRECTOTCORR", "T2M_MAX", "T2M_MIN"]].to_numpy().T
    return out[0], out[1], out[2], np.array([power[k][1] for k in keys])


# ---------------------------------------------------------------- observed table -------------
def observed_table(obs, effort, clim_p, clim_t):
    """One row per cell-year on bloom ground with enough effort; see the module docstring."""
    ind = obs[obs["query"].isin(INDICATORS)]
    key = ["ci", "cj", "year"]
    g = ind.groupby(key)
    t = pd.concat([g.size().rename("ind"), ind[ind.flowering].groupby(key).size().rename("flow"), effort],
                  axis=1).fillna(0)
    t = t[t.trach >= MIN_EFFORT].reset_index()
    t = t[t.year.isin(YEARS)]
    ann = (clim_p[[f"m{i:02d}" for i in range(1, 13)]].to_numpy() * MONTH_DAYS).sum(1)
    t["normal_mm"] = pd.Series(ann, index=clim_p.index).reindex(list(zip(t.ci, t.cj))).to_numpy()
    t["power_elev"] = clim_p.elev.reindex(list(zip(t.ci, t.cj))).to_numpy()
    t = t[(t.normal_mm < MASK_RAIN) & (t.power_elev < MASK_ELEV)]
    desert = obs[obs["query"].isin(DESERT)].groupby(["ci", "cj"]).size()
    t = t[desert.reindex(list(zip(t.ci, t.cj))).fillna(0).to_numpy() >= MIN_RECORDS].copy()
    t["share"] = t.ind / t.trach
    t["anom"] = np.log((t.ind + 0.5) / t.trach)
    t["anom"] -= t.groupby(["ci", "cj"]).anom.transform("median")
    t["rel"] = np.exp(t.anom)
    t["obs_level"] = np.digitize(t.rel, OBS_CLASSES)
    pk = g.agg(n=("doy", "size"), peak=("doy", "median"), z=("z", "median"),
               iqr=("doy", lambda d: d.quantile(0.75) - d.quantile(0.25)))
    pf = ind[ind.flowering].groupby(key).agg(nf=("doy", "size"), peak_flow=("doy", "median"))
    t = t.merge(pk.reset_index(), on=key, how="left").merge(pf.reset_index(), on=key, how="left")
    t.loc[t.n < MIN_PEAK_RECORDS, "peak"] = np.nan
    t.loc[~(t.nf >= MIN_PEAK_RECORDS), "peak_flow"] = np.nan
    return t.reset_index(drop=True)


def weather(t, power, clim_p, clim_t):
    """Season arrays for each row of t: rain (cleaned), normal rain, tmean at the records'
    elevation (POWER's otherwise), normal tmean likewise, Tmax, Tmin."""
    n = max(season_days(y) for y in YEARS)
    W = {k: np.full((len(t), n), np.nan) for k in ("rain", "nrain", "tmean", "ntmean", "tmax", "tmin")}
    for year in sorted(t.year.unique()):
        m = (t.year == year).to_numpy()
        keys = list(zip(t.ci[m], t.cj[m]))
        p, tx, tn, zg = season_block(power, keys, year)
        nd = p.shape[1]
        z = t.z[m].fillna(pd.Series(zg, index=t.index[m])).to_numpy()
        dz = LAPSE * (zg - z)[:, None]
        W["rain"][m, :nd] = clean_rain(p)
        W["tmax"][m, :nd], W["tmin"][m, :nd] = tx, tn
        W["tmean"][m, :nd] = (tx + tn) / 2 + dz
        first = season_first(year)
        W["nrain"][m, :nd] = daily_from_monthly(clim_p.reindex(keys)[[f"m{i:02d}" for i in range(1, 13)]].to_numpy(),
                                                first, nd)
        tz = clim_t.elev.reindex(keys).to_numpy()
        W["ntmean"][m, :nd] = daily_from_monthly(clim_t.reindex(keys)[[f"m{i:02d}" for i in range(1, 13)]].to_numpy(),
                                                 first, nd) + LAPSE * (tz - z)[:, None]
    return W


# ---------------------------------------------------------------- scoring helpers -----------
def spearman(a, b):
    from scipy.stats import spearmanr

    ok = np.isfinite(a) & np.isfinite(b)
    return float(spearmanr(a[ok], b[ok])[0])


def qwk(a, b, k=4):
    """Quadratic-weighted kappa between two integer labelings 0..k-1."""
    o = np.bincount(a * k + b, minlength=k * k).reshape(k, k).astype(float)
    w = (np.subtract.outer(np.arange(k), np.arange(k)) ** 2) / (k - 1) ** 2
    e = np.outer(o.sum(1), o.sum(0)) / o.sum()
    return 1 - (w * o).sum() / (w * e).sum()


def auc(pos, neg):
    from scipy.stats import mannwhitneyu

    return float(mannwhitneyu(pos, neg).statistic / (len(pos) * len(neg)))


def fit_levels(x, y, grid):
    """Three thresholds from `grid` maximising kappa of digitize(x) against y."""
    best, arg = -9, None
    for c in itertools.combinations(grid, 3):
        k = qwk(np.digitize(x, c), y)
        if k > best:
            best, arg = k, c
    return arg


def loyo_levels(x, y, years, grid):
    pred = np.zeros(len(x), int)
    for yr in np.unique(years):
        tr = years != yr
        pred[~tr] = np.digitize(x[~tr], fit_levels(x[tr], y[tr], grid))
    return pred


def window_ratio(W, t, md):
    out = np.full(len(t), np.nan)
    for year in t.year.unique():
        m = (t.year == year).to_numpy()
        out[m] = rain_ratio(W["rain"][m], W["nrain"][m], index_of(year, md))
    return out


def storm_max(W, t, days, last_md):
    out = np.full(len(t), np.nan)
    for year in t.year.unique():
        m = (t.year == year).to_numpy()
        c = np.cumsum(np.nan_to_num(W["rain"][m]), axis=1)
        s = c.copy()
        s[:, days:] -= c[:, :-days]
        out[m] = s[:, :index_of(year, last_md) + 1].max(1)
    return out


def issue_ratio(W, t, md_issue, md_end=RATIO_END):
    """The ratio as the forecast would read it on `md_issue`: normals after that day."""
    out = np.full(len(t), np.nan)
    for year in t.year.unique():
        m = (t.year == year).to_numpy()
        rain = W["rain"][m].copy()
        rain[:, index_of(year, md_issue):] = np.nan
        out[m] = rain_ratio(rain, W["nrain"][m], index_of(year, md_end))
    return out


def ratio_quantile_grid(x):
    return sorted(set(np.round(np.nanquantile(x, np.linspace(0.04, 0.96, 24)), 3)))


ROUND_GRID = tuple(np.round(np.arange(0.20, 2.01, 0.05), 2))


# ---------------------------------------------------------------- tests ----------------------
def documented_rel(t):
    """(documented level, iNat share against the cell's median year) at the dry-run places."""
    rows = []
    for name, (lat, lon) in SITES.items():
        ci, cj = (int(v) for v in power_cell(lat, lon))
        for year, lv in DOCUMENTED[name].items():
            o = t[(t.ci == ci) & (t.cj == cj) & (t.year == year) & (t.ind >= MIN_PEAK_RECORDS)]
            if len(o):
                rows.append((lv, float(o.rel.iloc[0])))
    return np.array(rows)


def test_taxa(obs, t, out):
    """Each fetched taxon's year signal against the other indicators', within cells: the log
    share of its records against the cell's median year, on the bloom-ground cells where it
    has at least 20 records; and how many of its records carry the flowering annotation."""
    key = ["ci", "cj", "year"]
    base = t.set_index(key)[["trach"]]
    ind = obs[obs["query"].isin(INDICATORS)]
    rows = []
    for taxon, name in TAXA.items():
        own = obs[obs["query"] == taxon].groupby(key).size().rename("own")
        rest = ind[ind["query"] != taxon].groupby(key).size().rename("rest")
        x = base.join(own).join(rest).fillna(0)
        x = x[x.groupby(level=[0, 1]).own.transform("sum") >= 20]
        if len(x) < 20:
            continue

        def anomaly(c):
            v = np.log((x[c] + 0.5) / x.trach)
            return (v - v.groupby(level=[0, 1]).transform("median")).to_numpy()

        rows.append(dict(taxon=name, counted=taxon in INDICATORS, cells=x.index.droplevel(2).nunique(),
                         cell_years=len(x), rho_within_cell=spearman(anomaly("own"), anomaly("rest")),
                         flowering_annotated=float(obs[obs["query"] == taxon].flowering.mean())))
    out["taxa"] = pd.DataFrame(rows).sort_values("rho_within_cell", ascending=False)


def test_strength(t, W, out):
    years = t.year.to_numpy()
    yA = t.obs_level.to_numpy()
    dr = documented_rel(t)
    doc_classes = fit_levels(dr[:, 1], dr[:, 0].astype(int), tuple(np.round(np.arange(0.2, 2.5, 0.05), 2)))
    yB = np.digitize(t.rel, doc_classes)
    out["doc_classes"] = dict(place_years=len(dr), cutoffs=tuple(float(c) for c in doc_classes),
                              kappa=qwk(np.digitize(dr[:, 1], doc_classes), dr[:, 0].astype(int)),
                              rho=spearman(dr[:, 0], dr[:, 1]))
    tot = np.array([np.nansum(W["rain"][i, :index_of(yr, RATIO_END) + 1]) for i, yr in enumerate(years)])
    ratio = window_ratio(W, t, RATIO_END)
    # literature: no germinating storm (>= 25 mm in 3 days by 31 Dec) halves the index; a
    # hard freeze (< -4 C after 1 Dec) or early heat (> 32 C in Feb-Mar) takes 2% a day.
    storm = storm_max(W, t, 3, (12, 31))
    frost = np.array([(W["tmin"][i, index_of(yr, (12, 1)):index_of(yr, (3, 31)) + 1] < -4).sum()
                      for i, yr in enumerate(years)])
    hot = np.array([(W["tmax"][i, index_of(yr, (2, 1)):index_of(yr, (3, 31)) + 1] > 32).sum()
                    for i, yr in enumerate(years)])
    lit = ratio * np.where(storm >= 25, 1.0, 0.5) * np.maximum(1 - 0.02 * (frost + hot), 0)
    s, p = np.isin(years, SUPER), np.isin(years, POOR)
    rows = []
    for name, x, grid in (("plain Oct-Mar rain total (mm)", tot, None),
                          ("percent of normal, Oct-Mar (the model)", ratio, ROUND_GRID),
                          ("literature: storm gate, freeze, heat", lit, None)):
        g = grid or ratio_quantile_grid(x)
        pA, pB = loyo_levels(x, yA, years, g), loyo_levels(x, yB, years, g)
        rows.append(dict(model=name, rho_share=spearman(x, t.share.to_numpy()), rho_anom=spearman(x, t.anom.to_numpy()),
                         auc_super_vs_poor_years=auc(x[s], x[p]),
                         kappa_inat_classes=qwk(pA, yA), kappa_doc_matched_classes=qwk(pB, yB),
                         super_years_good_plus=np.mean(pA[s] >= 2), poor_years_ordinary_minus=np.mean(pA[p] <= 1)))
        if name.startswith("percent"):
            out["levels_A"], out["levels_B"] = fit_levels(x, yA, g), fit_levels(x, yB, g)
    out["strength"] = pd.DataFrame(rows)
    lv = strength(ratio)
    out["fixed_levels"] = dict(levels=LEVELS, kappa_inat_classes=qwk(lv, yA), kappa_doc_matched_classes=qwk(lv, yB),
                               super_years_good_plus=float(np.mean(lv[s] >= 2)),
                               super_years_superbloom=float(np.mean(lv[s] == 3)),
                               poor_years_ordinary_minus=float(np.mean(lv[p] <= 1)),
                               poor_years_none=float(np.mean(lv[p] == 0)))
    out["confusion"] = pd.crosstab(pd.Series(yB, name="observed (doc-matched classes)"), pd.Series(lv, name="predicted"))
    t["ratio"], t["pred_level"] = ratio, lv
    curve_bins = [0, 0.3, 0.4, 0.5, 0.6, 0.75, 0.9, 1.0, 1.15, 1.25, 1.5, 1.75, 2.0, 9]
    out["curve"] = t.groupby(pd.cut(t.ratio, curve_bins), observed=True).agg(
        cell_years=("rel", "size"), median_rel=("rel", "median"), mean_anom=("anom", "mean"))
    rows = []  # the forecast as it stands on each issue date
    for name, md in (("1 Nov", (11, 1)), ("1 Dec", (12, 1)), ("1 Jan", (1, 1)), ("15 Jan", (1, 15)), ("1 Feb", (2, 1)),
                     ("15 Feb", (2, 15)), ("1 Mar", (3, 1)), ("1 Apr (complete)", (4, 1))):
        x = issue_ratio(W, t, md)
        pred = strength(x)
        rows.append(dict(issue=name, rho_anom=spearman(x, t.anom.to_numpy()), kappa_doc_matched=qwk(pred, yB),
                         same_level_as_complete=np.mean(pred == lv), off_by_2_plus=np.mean(abs(pred - lv) >= 2)))
    out["issue"] = pd.DataFrame(rows)
    yr = t.groupby("year").agg(cells=("ratio", "size"), median_ratio=("ratio", "median"),
                               median_rel=("rel", "median"))
    for k, nm in enumerate(STRENGTH_NAMES):
        yr[nm] = t.assign(v=lv == k).groupby("year").v.mean()
    out["years"] = yr
    resid = t.anom - t.groupby(pd.cut(t.ratio, curve_bins), observed=True).anom.transform("mean")
    out["partials"] = {"3-day storm by 31 Dec": spearman(storm, resid.to_numpy()),
                       "days < -4 C, Dec-Mar": spearman(frost.astype(float), resid.to_numpy()),
                       "days > 32 C, Feb-Mar": spearman(hot.astype(float), resid.to_numpy())}
    tab = []
    for thr in (10, 15, 25, 35):
        trig = storm >= thr
        tab.append(dict(storm_mm=thr, share_with=np.mean(trig), anom_with=resid[trig].mean(),
                        anom_without=resid[~trig].mean()))
    out["storm_table"] = pd.DataFrame(tab)


def loyo_peak(W, t, rows, start_md=FORCE_START, base=FORCE_BASE, target="peak", forcing=None, share=START_SHARE):
    """Predicted peak (day of year) for `rows`, FORCING refitted without the held-out year
    as the median forcing reached on the observed peak day."""
    years = t.year.to_numpy()
    obs = t[target].to_numpy()
    jan1 = np.array([index_of(y, (1, 1)) for y in years])
    st = np.zeros(len(t), int)
    for yr in np.unique(years):
        m = years == yr
        st[m] = forcing_start(W["rain"][m], W["nrain"][m], index_of(yr, start_md), index_of(yr, RATIO_END),
                              share) if share else index_of(yr, start_md)
    on = np.arange(W["tmean"].shape[1])[None, :] >= st[:, None]
    heat = np.cumsum(np.where(on, np.maximum(np.nan_to_num(W["tmean"], nan=-99) - base, 0.0), 0.0), axis=1)
    ok = rows & np.isfinite(obs)
    at = np.full(len(t), np.nan)
    at[ok] = heat[ok, (obs[ok] - 1 + jan1[ok]).astype(int)]
    pred = np.full(len(t), np.nan)
    for yr in np.unique(years[ok]):
        tr, te = ok & (years != yr), ok & (years == yr)
        f = forcing if forcing is not None else np.median(at[tr])
        done = heat[te] >= f
        pred[te] = np.where(done.any(1), done.argmax(1), np.nan) - jan1[te] + 1
    return pred, float(np.nanmedian(at[ok]))


def test_timing(t, W, out):
    years = t.year.to_numpy()
    drawn = (t.ratio >= LEVELS[0]).to_numpy()
    rows = []
    for target in ("peak", "peak_flow"):
        for label, sel in (("all cell-years", np.ones(len(t), bool)), ("drawn (ordinary or better)", drawn)):
            ok = sel & t[target].notna().to_numpy()
            obs = t[target].to_numpy()
            pred, f = loyo_peak(W, t, ok, FORCE_START, FORCE_BASE, target)
            e = {"model": np.abs(pred - obs)}
            z, lat = t.z.to_numpy(), t.ci.to_numpy() * CELL_LAT
            band = np.digitize(z, [300, 700, 1100])
            b1, b2, b3, b4 = (np.full(len(t), np.nan) for _ in range(4))
            for yr in np.unique(years[ok]):
                tr, te = ok & (years != yr), ok & (years == yr)
                b1[te] = np.median(obs[tr])
                med = {b: np.median(obs[tr & (band == b)]) for b in np.unique(band[tr])}
                b2[te] = [med.get(b, np.median(obs[tr])) for b in band[te]]
                X = np.column_stack([np.ones(len(t)), lat, z])
                b3[te] = X[te] @ np.linalg.lstsq(X[tr], obs[tr], rcond=None)[0]
            for i in np.where(ok)[0]:
                o = ok & (t.ci.to_numpy() == t.ci.iat[i]) & (t.cj.to_numpy() == t.cj.iat[i]) & (years != years[i])
                b4[i] = np.median(obs[o]) if o.any() else np.nan
            for nm, b in (("one fixed date", b1), ("date per elevation band", b2), ("latitude/elevation line", b3),
                          ("cell's own median, other years", b4)):
                e[nm] = np.abs(b - obs)
            both = ok & np.isfinite(b4)
            rows.append(dict(target="all records" if target == "peak" else "flowering-annotated", rows=label,
                             n=int(ok.sum()), **{k: np.nanmean(v[ok]) for k, v in e.items()},
                             model_on_cell_rows=np.nanmean(e["model"][both]), forcing=f,
                             bias=np.nanmean((pred - obs)[ok])))
    out["timing"] = pd.DataFrame(rows)
    ok = drawn & t.peak.notna().to_numpy()
    pred, _ = loyo_peak(W, t, ok, FORCE_START, FORCE_BASE)
    t["pred_peak"] = pred
    out["timing_years"] = t[ok].assign(err=(pred - t.peak)[ok]).groupby("year").err.agg(
        n="size", bias="mean", mae=lambda s: s.abs().mean())
    # forecast on 1 Feb and 1 Mar: temperatures and rain from normals after that day
    rows = []
    for name, md in (("1 Feb", (2, 1)), ("1 Mar", (3, 1)), ("complete", None)):
        W2 = dict(W)
        if md:
            tm, rn = W["tmean"].copy(), W["rain"].copy()
            for yr in np.unique(years):
                m = years == yr
                tm[m, index_of(yr, md):] = W["ntmean"][m, index_of(yr, md):]
                rn[m, index_of(yr, md):] = np.nan
            W2["tmean"], W2["rain"] = tm, rn
        pred2, _ = loyo_peak(W2, t, ok, FORCE_START, FORCE_BASE, forcing=FORCING)
        rows.append(dict(issue=name, mae=np.nanmean(np.abs(pred2 - t.peak.to_numpy())[ok]),
                         bias=np.nanmean((pred2 - t.peak.to_numpy())[ok])))
    out["timing_issue"] = pd.DataFrame(rows)
    out["record_iqr_days"] = float(t.iqr[ok].median())
    q = t.peak[ok]
    out["peak_spread"] = {p: str(date(2021, 1, 1) + timedelta(days=float(q.quantile(p)) - 1)) for p in (0.02, 0.1, 0.5, 0.9, 0.98)}


def test_grid(t, W, out):
    years, y, anom = t.year.to_numpy(), t.obs_level.to_numpy(), t.anom.to_numpy()
    rows = []
    for end_name, end in (("31 Jan", (1, 31)), ("28 Feb", (2, 28)), ("31 Mar", (3, 31)), ("30 Apr", (4, 30))):
        r = window_ratio(W, t, end)
        for size, days, last in itertools.product((0, 10, 15, 25, 35), (1, 3, 7), ((11, 30), (12, 31), (1, 31))):
            if size == 0 and (days, last) != (3, (12, 31)):
                continue
            x = r if size == 0 else r * np.where(storm_max(W, t, days, last) >= size, 1.0, 0.5)
            rows.append(dict(rain_window=f"1 Oct-{end_name}", storm=f"{size} mm/{days} d by {last[1]}/{last[0]}"
                             if size else "none", rho_anom=spearman(x, anom), rho_share=spearman(x, t.share.to_numpy())))
    out["grid_strength"] = pd.DataFrame(rows).sort_values("rho_anom", ascending=False)
    r = window_ratio(W, t, RATIO_END)
    yB = np.digitize(t.rel, out["doc_classes"]["cutoffs"])
    d = out["dry_run_raw"].dropna(subset=["documented"])
    rows = []
    for l1, l2, l3 in itertools.product((0.4, 0.5, 0.6, 0.7, 0.8), (0.8, 0.9, 1.0, 1.1), (1.25, 1.5, 1.75)):
        if l1 < l2:
            lv = (l1, l2, l3)
            pdoc = strength(d.rain_pct.to_numpy() / 100, lv)
            rows.append(dict(none_below=l1, good_from=l2, superbloom_from=l3, kappa_inat_classes=qwk(strength(r, lv), y),
                             kappa_doc_matched=qwk(strength(r, lv), yB),
                             kappa_documented=qwk(pdoc, d.documented.to_numpy(int))))
    out["grid_levels"] = pd.DataFrame(rows).sort_values("kappa_documented", ascending=False)
    rows = []
    for lv in (out["levels_A"], out["levels_B"], (0.40, 0.60, 1.25), LEVELS, (0.60, 1.00, 1.75), (0.70, 1.00, 1.50),
               (0.80, 1.00, 1.75)):
        lv = tuple(float(v) for v in lv)
        pdoc, ydoc = strength(d.ratio.to_numpy(), lv), d.documented.to_numpy(int)
        rows.append(dict(levels=lv, kappa_inat_classes=qwk(strength(r, lv), y), kappa_doc_matched=qwk(strength(r, lv), yB),
                         kappa_documented=qwk(pdoc, ydoc), superbloom_calls=int((pdoc == 3).sum()),
                         superbloom_hits=int(((pdoc == 3) & (ydoc == 3)).sum())))
    out["candidate_levels"] = pd.DataFrame(rows)
    ok = (r >= LEVELS[0]) & t.peak.notna().to_numpy()
    rows = []
    for st, share, base in itertools.product(((1, 1), (1, 15), (2, 1), (2, 15), (3, 1)), (0.0, 0.25, 0.4, 0.55),
                                             (-2, 0, 3, 6, 9)):
        pred, f = loyo_peak(W, t, ok, st, base, share=share)
        rows.append(dict(start=f"{st[1]}/{st[0]}", rain_share=share, base=base,
                         mae=np.nanmean(np.abs(pred - t.peak.to_numpy())[ok])))
    out["grid_timing"] = pd.DataFrame(rows).pivot_table(index=["rain_share", "start"], columns="base", values="mae")



# Documented strength at the dry-run sites, 0 none .. 3 superbloom, from park, NPS, Theodore
# Payne Foundation hotline, Tom Chester (Anza-Borrego) and press reports; sources in the record.
# Missing years had no report for the site.
DOCUMENTED = {
    "Anza-Borrego (Borrego Valley)": {2016: 1, 2017: 3, 2018: 0, 2019: 3, 2020: 1, 2021: 0, 2022: 0, 2023: 2,
                                      2024: 2, 2025: 0, 2026: 2},
    "Death Valley (Badwater Rd)": {2016: 3, 2017: 2, 2018: 0, 2019: 0, 2020: 0, 2021: 0, 2022: 0, 2023: 2,
                                   2024: 2, 2025: 0, 2026: 3},
    "Joshua Tree (Pinto Basin)": {2016: 1, 2017: 2, 2018: 0, 2019: 2, 2020: 1, 2022: 0, 2023: 2, 2026: 2},
    "Antelope Valley Poppy Reserve": {2016: 0, 2017: 2, 2018: 0, 2019: 3, 2020: 2, 2021: 0, 2022: 1, 2023: 1,
                                      2024: 0, 2025: 0, 2026: 2},
    "Carrizo Plain (Soda Lake)": {2016: 2, 2017: 3, 2018: 0, 2019: 3, 2020: 1, 2021: 0, 2022: 0, 2023: 3,
                                  2024: 2, 2025: 0, 2026: 2},
    "Picacho Peak SP": {2017: 3, 2019: 3, 2020: 2, 2021: 0, 2022: 0, 2023: 3, 2024: 1, 2025: 0, 2026: 0},
    "Walker Canyon, Lake Elsinore": {2017: 2, 2019: 3, 2020: 1, 2021: 0, 2022: 0, 2023: 1, 2024: 0},
}


def dry_run(t, cache, clim_p, clim_t, out):
    rows = []
    for name, (lat, lon) in SITES.items():
        ci, cj = (int(v) for v in power_cell(lat, lon))
        df, zg = power_cell_daily(ci, cj, cache)
        z = float(dem_at([lat], [lon])[0])
        pm = clim_p.loc[[(ci, cj)], [f"m{i:02d}" for i in range(1, 13)]].to_numpy()
        for year in range(2016, 2027):
            idx = pd.date_range(season_first(year), periods=season_days(year))
            d = df.reindex(idx)
            rain = clean_rain(d.PRECTOTCORR.to_numpy()[None])
            nrain = daily_from_monthly(pm, season_first(year), len(idx))
            tm = ((d.T2M_MAX + d.T2M_MIN) / 2).to_numpy()[None] + LAPSE * (zg - z)
            ratio = rain_ratio(rain, nrain, index_of(year, RATIO_END))[0]
            st = forcing_start(rain, nrain, index_of(year, FORCE_START), index_of(year, RATIO_END))
            pk = peak_index(tm, st)[0]
            peak = season_first(year) + timedelta(days=int(pk)) if np.isfinite(pk) else None
            o = t[(t.ci == ci) & (t.cj == cj) & (t.year == year)]
            doc = DOCUMENTED[name].get(year)
            rows.append(dict(site=name, year=year, elev=round(z), ratio=ratio, rain_pct=round(100 * ratio),
                             level=int(strength(np.array([ratio]))[0]), documented=doc,
                             peak=peak.strftime("%d %b") if peak and ratio >= LEVELS[0] else "-",
                             obs_rel=round(float(o.rel.iloc[0]), 2) if len(o) else np.nan,
                             obs_records=int(o.ind.iloc[0]) if len(o) else 0,
                             obs_median=(date(year, 1, 1) + timedelta(days=float(o.peak.iloc[0]) - 1)).strftime("%d %b")
                             if len(o) and np.isfinite(o.peak.iloc[0]) else "-"))
    d = pd.DataFrame(rows)
    out["dry_run_raw"] = d
    out["dry_run"] = d.drop(columns="ratio").assign(level=d.level.map(dict(enumerate(STRENGTH_NAMES))),
                              documented=d.documented.map(dict(enumerate(STRENGTH_NAMES))).fillna("-"))
    k = d.dropna(subset=["documented"])
    pred, doc = k.level.to_numpy(int), k.documented.to_numpy(int)
    out["documented"] = dict(
        place_years=len(k), kappa=qwk(pred, doc), exact=float(np.mean(pred == doc)),
        within1=float(np.mean(abs(pred - doc) <= 1)), rho=spearman(k.rain_pct.to_numpy(float), doc.astype(float)),
        superbloom_called=int((pred == 3).sum()), called_and_documented_super=int(((pred == 3) & (doc == 3)).sum()),
        documented_super=int((doc == 3).sum()), documented_none=int((doc == 0).sum()),
        documented_none_called_good_plus=int(((doc == 0) & (pred >= 2)).sum()),
        wet_place_years=int((k.ratio >= 1.25).sum()), wet_documented_super=float(np.mean(doc[k.ratio.to_numpy() >= 1.25] == 3)),
        documented_super_min_ratio=float(k.ratio[doc == 3].min()))
    out["documented_confusion"] = pd.crosstab(pd.Series(doc, name="documented"), pd.Series(pred, name="predicted"))


def inat_range(cache):
    """Desert-annual records (research grade, any year or month) per z11 geotile over the US West:
    centres (lat, lon) and counts."""
    g = inat_grid(cache, "desert_range", box=WEST, taxon_id=",".join(map(str, DESERT)), quality_grade="research")
    g = g[g.n > 0]
    lat, lon = geotile_centre(g.gx.to_numpy(), g.gy.to_numpy())
    return lat, lon, g.n.to_numpy()


def unit_vectors(lat, lon):
    la, lo = np.radians(np.asarray(lat, float)), np.radians(np.asarray(lon, float))
    return np.column_stack([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)])


def records_within(tree, counts, lat, lon, km=RANGE_KM):
    return np.array([counts[i].sum() for i in tree.query_ball_point(unit_vectors(lat, lon), r=km / 6371.0)])


def test_mask(obs, cache, clim_p, clim_t, out, usw_base=None):
    """Share of desert-annual sightings (February-May, BOX) and of land each mask keeps."""
    from scipy.spatial import cKDTree

    pm = clim_p[[f"m{i:02d}" for i in range(1, 13)]].to_numpy() * MONTH_DAYS
    tm = clim_t.reindex(clim_p.index)[[f"m{i:02d}" for i in range(1, 13)]].to_numpy()
    tree = cKDTree(unit_vectors(clim_p.lat.to_numpy(), clim_p.lon.to_numpy()))
    rlat, rlon, rn = inat_range(cache)
    rtree = cKDTree(unit_vectors(rlat, rlon))

    def normals(lat, lon):  # bloom.daily_normals' four-cell inverse-distance mean
        d, k = tree.query(unit_vectors(lat, lon), k=4)
        w = 1 / np.maximum(d, 1e-9) ** 2
        w /= w.sum(1, keepdims=True)
        return (w[..., None] * pm[k]).sum(1), (w[..., None] * tm[k]).sum(1)

    def koppen(p, tt):
        ann, mat, summer = p.sum(1), tt.mean(1), p[:, 3:9].sum(1)
        thr = np.where(summer >= 0.7 * ann, 20 * mat + 280, np.where(summer <= 0.3 * ann, 20 * mat, 20 * mat + 140))
        return np.where(ann < 0.5 * thr, "BW", np.where(ann < thr, "BS", "-"))

    def sample(la, lo, land_only):
        p, tt = normals(la, lo)
        lc, z = nlcd_at(la, lo), dem_at(la, lo)
        n = records_within(rtree, rn, la, lo)
        keep = ~np.isin(lc, (0, 11, 250)) if land_only else np.ones(len(la), bool)
        return dict(ann=p.sum(1)[keep], kop=koppen(p, tt)[keep], lc=lc[keep], z=z[keep], n=n[keep], jul=tt[keep, 6])

    rng = np.random.default_rng(1)
    desert = obs[obs["query"].isin(DESERT)]
    poppy = obs[obs["query"] == 48225]
    S = {"desert-annual sightings": sample(desert.lat.to_numpy(), desert.lon.to_numpy(), False),
         "poppy sightings": sample(poppy.lat.to_numpy(), poppy.lon.to_numpy(), False),
         "land in the box": sample(rng.uniform(BOX["swlat"], BOX["nelat"], 60000),
                                   rng.uniform(BOX["swlng"], BOX["nelng"], 60000), True),
         "land in the US West": sample(rng.uniform(WEST["swlat"], WEST["nelat"], 60000),
                                       rng.uniform(WEST["swlng"], WEST["nelng"], 60000), True)}
    wild = (31, 52, 71)

    def base(s):
        return (s["ann"] < MASK_RAIN) & (s["z"] < MASK_ELEV)

    def in_range(s):
        return s["n"] >= RANGE_RECORDS

    rules = {f"normal rain < {x} mm/yr": (lambda s, x=x: s["ann"] < x) for x in (200, 250, 300, 350, 400)}
    rules.update({
        "Koppen BW": lambda s: s["kop"] == "BW",
        "Koppen BW or BS": lambda s: s["kop"] != "-",
        "NLCD 52/71": lambda s: np.isin(s["lc"], (52, 71)),
        "NLCD 31/52/71": lambda s: np.isin(s["lc"], wild),
        "elevation < 1500 m": lambda s: s["z"] < MASK_ELEV,
        "July normal mean >= 25 C": lambda s: s["jul"] >= 25,
        "range: >= 1 desert-annual record within 50 km": lambda s: s["n"] >= 1,
        f"range: >= {RANGE_RECORDS} records within 50 km": in_range,
        f"< {MASK_RAIN:.0f} mm, < 1500 m": base,
        "  + range": lambda s: base(s) & in_range(s),
        "  + range + NLCD 31/52/71 (recommended)": lambda s: base(s) & in_range(s) & np.isin(s["lc"], wild),
        "  + July >= 25 C + NLCD 31/52/71": lambda s: base(s) & (s["jul"] >= 25) & np.isin(s["lc"], wild),
    })
    out["mask"] = pd.DataFrame([{"mask": k, **{nm: float(np.mean(f(S[nm]))) for nm in S}} for k, f in rules.items()])
    out["mask_nlcd"] = pd.Series(S["desert-annual sightings"]["lc"]).value_counts(normalize=True).head(8)
    out["mask_counts"] = {nm: len(v["ann"]) for nm, v in S.items()}
    la, lo = np.array([v[0] for v in SITES.values()]), np.array([v[1] for v in SITES.values()])
    s = sample(la, lo, False)
    out["mask_sites"] = pd.DataFrame(dict(site=list(SITES), normal_mm=s["ann"].round(), elev=s["z"].round(),
                                          records_50km=s["n"], nlcd=s["lc"], july_C=s["jul"].round(1)))
    ids = ",".join(map(str, DESERT))
    out["range"] = dict(
        us_west=inat_count(cache, "west_desert", taxon_id=ids, quality_grade="research", place_id=1, **WEST),
        in_box=inat_count(cache, "box_desert", taxon_id=ids, quality_grade="research", place_id=1, **BOX),
        north_of_box=inat_count(cache, "north_desert", taxon_id=ids, quality_grade="research", place_id=1,
                                **dict(WEST, swlat=BOX["nelat"])))
    if usw_base and Path(usw_base).exists():  # the production grid: USW's 0.1-degree cells
        b = pd.read_csv(usw_base, usecols=["Latitude", "Longitude"])
        c = pd.DataFrame({"y": np.rint(b.Latitude / 0.1), "x": np.rint(b.Longitude / 0.1)}).drop_duplicates()
        la, lo = c.y.to_numpy() * 0.1, c.x.to_numpy() * 0.1
        cp = power_climatology(cache, "PRECTOTCORR", lat=(20, 50))
        pm = cp[[f"m{i:02d}" for i in range(1, 13)]].to_numpy() * MONTH_DAYS
        d, k = cKDTree(unit_vectors(cp.lat.to_numpy(), cp.lon.to_numpy())).query(unit_vectors(la, lo), k=4)
        w = 1 / np.maximum(d, 1e-9) ** 2
        w /= w.sum(1, keepdims=True)
        ann, z = (w[..., None] * pm[k]).sum(1).sum(1), dem_at(la, lo)
        n = records_within(rtree, rn, la, lo)
        m1, m2 = ann < MASK_RAIN, (ann < MASK_RAIN) & (z < MASK_ELEV)
        m3 = m2 & (n >= RANGE_RECORDS)
        out["mask_cells"] = dict(usw_cells=len(c), under_rain=int(m1.sum()), and_elevation=int(m2.sum()),
                                 and_range=int(m3.sum()), north_of_38N=int((m3 & (la > 38)).sum()),
                                 lat_span=(float(la[m3].min()), float(la[m3].max())),
                                 lon_span=(float(lo[m3].min()), float(lo[m3].max())))


def test_power(t, power, clim_p, out):
    """POWER on the bloom-ground cells: its daily series against its own climatology, and the
    wettest October-May day of 1990-2026 (what RAIN_CAP must clear)."""
    rows = []
    for k, (df, _) in power.items():
        p = df.PRECTOTCORR["1991":"2020"]
        m = clim_p.loc[k, [f"m{i:02d}" for i in range(1, 13)]].to_numpy() * MONTH_DAYS
        om = p[p.index.month.isin((10, 11, 12, 1, 2, 3))].sum() / 30
        season = df.PRECTOTCORR[df.index.month.isin((10, 11, 12, 1, 2, 3, 4, 5))]
        rows.append((p.groupby(p.index.year).sum().mean() / m.sum(), om / m[[9, 10, 11, 0, 1, 2]].sum(), season.max()))
    r = np.array(rows)
    out["power"] = dict(cells=len(r), daily_over_climatology_annual=float(np.median(r[:, 0])),
                        daily_over_climatology_oct_mar=float(np.median(r[:, 1])),
                        wettest_oct_may_day_max=float(r[:, 2].max()), wettest_oct_may_day_median=float(np.median(r[:, 2])))


def test_master(url, era5_dir, out):
    """Days above RAIN_CAP in a live master (rain columns only, over HTTP range requests), with
    the neighbourhood median and ERA5 (step-2 blocks) on the same day."""
    import fsspec
    import pyarrow.parquet as pq

    with fsspec.filesystem("https").open(url, block_size=8 * 1024 * 1024) as f:
        df = pq.read_table(f, columns=["Date", "Latitude", "Longitude", "TotalPrecipitation_mm"]).to_pandas()
    df = df[df.Latitude.between(BOX["swlat"], BOX["nelat"]) & df.Longitude.between(BOX["swlng"], BOX["nelng"])]
    hi = df[df.TotalPrecipitation_mm > RAIN_CAP]
    rows = []
    for day, g in hi.groupby(hi.Date.dt.normalize()):
        top = g.loc[g.TotalPrecipitation_mm.idxmax()]
        near = df[(df.Date.dt.normalize() == day) & ((df.Latitude - top.Latitude).abs() < 0.3)
                  & ((df.Longitude - top.Longitude).abs() < 0.3)]
        blk = Path(era5_dir or "") / f"{np.floor(top.Latitude * 2) / 2:.2f}_{np.floor(top.Longitude * 2) / 2:.2f}.parquet"
        era5 = "-"
        if blk.exists():
            e = pd.read_parquet(blk, columns=["Date", "TotalPrecipitation_mm"])
            v = e[pd.to_datetime(e.Date) == day].TotalPrecipitation_mm
            era5 = f"{v.min():.1f}-{v.max():.1f}" if len(v) else "-"
        rows.append(dict(day=f"{day:%Y-%m-%d}", points=len(g), max_mm=top.TotalPrecipitation_mm, at=(top.Latitude, top.Longitude),
                         over_25_4=round(top.TotalPrecipitation_mm / 25.4, 1), neighbourhood_median=near.TotalPrecipitation_mm.median(),
                         era5_block=era5))
    out["master"] = dict(days=f"{df.Date.min():%d %b %Y} - {df.Date.max():%d %b %Y}", rows=len(df),
                         over_cap=len(hi), by_day=pd.DataFrame(rows))


def test_sources(t, clim_p, cache, era5_dir, wapi_csv, out):
    rows, seas, era5_cells = [], [], {}
    if era5_dir and Path(era5_dir).exists():
        ann = pd.Series((clim_p[[f"m{i:02d}" for i in range(1, 13)]].to_numpy() * MONTH_DAYS).sum(1), index=clim_p.index)
        for f in sorted(Path(era5_dir).glob("*.parquet")):
            la, lo = map(float, f.stem.split("_"))
            if not (BOX["swlat"] <= la < BOX["nelat"] and BOX["swlng"] <= lo < BOX["nelng"]):
                continue
            ci, cj = (int(v) for v in power_cell(la + 0.125, lo + 0.125))
            try:
                pdaily, _ = power_cell_daily(ci, cj, cache)
            except RuntimeError:
                continue
            e = pd.read_parquet(f, columns=["Date", "TotalPrecipitation_mm"])
            e = e.groupby(pd.to_datetime(e.Date)).TotalPrecipitation_mm.mean()
            era5_cells.setdefault((ci, cj), []).append(e)
            j = pd.concat([e.rename("era5"), pdaily.PRECTOTCORR.rename("power")], axis=1).dropna()
            rows.append(j.corr().iloc[0, 1])
            for y in range(2017, 2027):
                q = j[f"{y - 1}-10-01":f"{y}-03-31"]
                if len(q) > 170:
                    seas.append((la, lo, y, q.era5.sum(), q.power.sum(), ann.get((ci, cj), np.nan)))
        s = pd.DataFrame(seas, columns=["lat", "lon", "year", "era5", "power", "normal_mm"])
        if len(s):
            a = s.era5 / s.groupby(["lat", "lon"]).era5.transform("mean")
            b = s.power / s.groupby(["lat", "lon"]).power.transform("mean")
            dry = s[s.normal_mm < MASK_RAIN]
            out["era5"] = dict(blocks=len(rows), seasons=len(s), daily_r_median=float(np.median(rows)),
                               season_r=float(np.corrcoef(s.era5, s.power)[0, 1]),
                               anomaly_r=float(np.corrcoef(a, b)[0, 1]),
                               pooled_ratio=float(s.era5.sum() / s.power.sum()),
                               pooled_ratio_bloom_ground=float(dry.era5.sum() / dry.power.sum()),
                               bloom_ground_seasons=len(dry),
                               by_year=s.groupby("year")[["era5", "power"]].mean().round(0))
        # portability: the strength index on ERA5 rain, for the cell-years that have a block
        rr, pr, an, yy = [], [], [], []
        for row in t.itertuples():
            if (row.ci, row.cj) not in era5_cells or row.year < 2017:
                continue
            e = pd.concat(era5_cells[(row.ci, row.cj)], axis=1).mean(axis=1)
            idx = pd.date_range(season_first(row.year), periods=season_days(row.year))
            ev = e.reindex(idx).to_numpy()[None]
            if np.isnan(ev[0, :index_of(row.year, RATIO_END) + 1]).any():
                continue
            pm = clim_p.loc[[(row.ci, row.cj)], [f"m{i:02d}" for i in range(1, 13)]].to_numpy()
            nr = daily_from_monthly(pm, season_first(row.year), len(idx))
            rr.append(rain_ratio(clean_rain(ev), nr, index_of(row.year, RATIO_END))[0])
            pr.append(row.ratio)
            an.append(row.anom)
            yy.append(row.obs_level)
        rr, pr, an, yy = map(np.array, (rr, pr, an, yy))
        if len(rr):
            scale = out["era5"]["pooled_ratio_bloom_ground"]
            out["era5_portability"] = dict(
                cell_years=len(rr), rho_anom_power=spearman(pr, an), rho_anom_era5=spearman(rr, an),
                kappa_power=qwk(strength(pr), yy), kappa_era5_raw=qwk(strength(rr), yy),
                kappa_era5_scaled=qwk(strength(rr / scale), yy),
                same_level_raw=float(np.mean(strength(rr) == strength(pr))),
                same_level_scaled=float(np.mean(strength(rr / scale) == strength(pr))), scale=scale)
    if wapi_csv and Path(wapi_csv).exists():
        parts = []
        cols = ["Date", "Latitude", "Longitude", "Elevation (m)", "TotalPrecipitation_mm",
                "Temperature (C) Max", "Temperature (C) Min"]
        for ch in pd.read_csv(wapi_csv, usecols=cols, chunksize=2_000_000):
            parts.append(ch[ch.Latitude.between(BOX["swlat"], BOX["nelat"])
                            & ch.Longitude.between(BOX["swlng"], BOX["nelng"])])
        w = pd.concat(parts)
        w["Date"] = pd.to_datetime(w.Date)
        w["ci"], w["cj"] = power_cell(w.Latitude, w.Longitude)
        r = []
        for (ci, cj), g in w.groupby(["ci", "cj"]):
            try:
                pdaily, zg = power_cell_daily(ci, cj, cache)
            except RuntimeError:
                continue
            m = g.groupby("Date")[["TotalPrecipitation_mm", "Temperature (C) Max", "Temperature (C) Min",
                                   "Elevation (m)"]].mean().join(pdaily, how="inner")
            if len(m) < 60:
                continue
            dz = LAPSE * (m["Elevation (m)"] - zg)
            r.append((m.TotalPrecipitation_mm.sum(), m.PRECTOTCORR.sum(), m.TotalPrecipitation_mm.corr(m.PRECTOTCORR),
                      (m["Temperature (C) Max"] + dz - m.T2M_MAX).mean(), (m["Temperature (C) Min"] + dz - m.T2M_MIN).mean()))
        r = pd.DataFrame(r, columns=["wapi", "power", "r", "dtmax", "dtmin"])
        top = w.loc[w.TotalPrecipitation_mm.idxmax()]
        out["wapi"] = dict(days=f"{w.Date.min():%d %b %Y} - {w.Date.max():%d %b %Y}", cells=len(r),
                           max_mm=float(top.TotalPrecipitation_mm), max_at=(top.Latitude, top.Longitude, f"{top.Date:%d %b}"),
                           pooled_ratio=float(r.wapi.sum() / r.power.sum()), daily_r_median=float(r.r.median()),
                           dtmax=float(r.dtmax.median()), dtmin=float(r.dtmin.median()),
                           over_150=int((w.TotalPrecipitation_mm > RAIN_CAP).sum()), rows=len(w))


def show(title, x):
    print(f"\n## {title}")
    if isinstance(x, (pd.DataFrame, pd.Series)):
        print(x.round(3).to_string())
    else:
        print(x)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=Path.home() / ".cache" / "funges-superbloom")
    ap.add_argument("--grid", action="store_true")
    ap.add_argument("--era5", default=str(ROOT.parent / "era5_training" / "era5_blocks"))
    ap.add_argument("--weatherapi", default=str(ROOT.parent / "US" / "US_weather_data.csv"))
    ap.add_argument("--usw-base", default=str(ROOT.parent / "US" / "USW" / "USW_base.csv"))
    ap.add_argument("--master", help="a live master parquet URL to scan for rain glitches, e.g. "
                    "https://data.fung.es/USA/USW/USW_weather_data.parquet (rain columns only)")
    args = ap.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    pd.set_option("display.width", 200)

    obs = inat_observations(args.cache)
    obs["z"] = dem_at(obs.lat.to_numpy(), obs.lon.to_numpy())
    effort = inat_effort(args.cache)
    clim_p, clim_t = power_climatology(args.cache, "PRECTOTCORR"), power_climatology(args.cache, "T2M")
    t = observed_table(obs, effort, clim_p, clim_t)
    power = {k: power_cell_daily(*k, args.cache) for k in sorted(set(zip(t.ci, t.cj)))}
    W = weather(t, power, clim_p, clim_t)
    print(f"{len(obs)} records, {len(t)} cell-years in {t[['ci', 'cj']].drop_duplicates().shape[0]} cells "
          f"({t.peak.notna().sum()} with a peak date)")
    show("indicator share by year (all cells, per 1000 vascular records)",
         t.groupby("year")[["ind", "flow", "trach"]].sum().assign(per_1000=lambda d: 1000 * d.ind / d.trach,
                                                                   flowering_share=lambda d: d.flow / d.ind))
    out = {}
    test_taxa(obs, t, out)
    show("taxa: year signal against the other indicators", out["taxa"].to_string(index=False))
    test_strength(t, W, out)
    for k in ("doc_classes", "strength", "fixed_levels", "confusion", "curve", "issue", "years", "partials",
              "storm_table"):
        show(f"strength: {k}", out[k])
    print("rain thresholds fitted on all years: iNat classes", out["levels_A"], "| doc-matched classes", out["levels_B"])
    test_timing(t, W, out)
    for k in ("timing", "timing_years", "timing_issue", "peak_spread", "record_iqr_days"):
        show(f"timing: {k}", out[k])
    dry_run(t, args.cache, clim_p, clim_t, out)
    show("dry run", out["dry_run"].to_string(index=False))
    show("dry run against documented reports", out["documented"])
    show("documented vs predicted", out["documented_confusion"])
    if args.grid:
        test_grid(t, W, out)
        show("grid: rain window x storm gate (index halved without the storm)", out["grid_strength"].head(25))
        show("grid: rain window, no storm gate", out["grid_strength"][out["grid_strength"].storm == "none"])
        show("grid: level thresholds (kappa)", out["grid_levels"].head(20))
        show("grid: candidate levels", out["candidate_levels"].to_string(index=False))
        for k in ("grid_strength", "grid_levels", "candidate_levels", "grid_timing"):
            out[k].to_csv(args.cache / f"{k}.csv")
        show("grid: rain share x forcing start x base (MAE, days)", out["grid_timing"])
    test_mask(obs, args.cache, clim_p, clim_t, out, args.usw_base)
    show("mask: share kept", out["mask"])
    show("mask: points", out["mask_counts"])
    show("mask: NLCD class of desert-annual sightings", out["mask_nlcd"])
    show("mask: the named places", out["mask_sites"].to_string(index=False))
    show("mask: indicator range", out["range"])
    if "mask_cells" in out:
        show("mask: USW 0.1-degree cells", out["mask_cells"])
    test_power(t, power, clim_p, out)
    show("POWER on bloom ground", out["power"])
    test_sources(t, clim_p, args.cache, args.era5, args.weatherapi, out)
    for k in ("era5", "era5_portability", "wapi"):
        if k in out:
            show(f"rain source: {k}", out[k])
    if args.master:
        test_master(args.master, args.era5, out)
        show("live master: days above RAIN_CAP", out["master"])
    t.to_csv(args.cache / "cell_years.csv", index=False)


if __name__ == "__main__":
    main()
