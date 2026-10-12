#!/usr/bin/env python3
"""Calibrate a peak-bloom forecast for bluebell woods (Hyacinthoides non-scripta).

The second "spectacle" after cherry blossom (backend/bloom.py), fitted the same way:
on NASA POWER daily mean temperature (MERRA-2 T2M), the source of the forecast's
1991-2020 normals. The observed peak is the median date of iNaturalist records of
the native bluebell (taxon 56132; the Spanish bluebell, 57635, and the hybrid,
863646, are other taxa and stay out) per POWER grid cell (0.5° x 0.625°, centred on
POWER's own grid points) and year, for cells with at least MIN_RECORDS records. Each
cell-year's series is moved from POWER's grid elevation to the median ground
elevation of its records, as production moves the normals to a cell's elevation,
and cells under MIN_LAND land are dropped. A model's requirement is the median
forcing reached on the observed day of its training cell-years, as for cherry.

Tests, all printed as tables:

1. Leave one year out (2016-2026): fitted on the other springs, tested on one.
2. Geographic transfer: fitted on Great Britain, tested on Ireland (the island) and
   France, Belgium, the Netherlands and Germany, and back.
3. Hallerbos (Halle, Belgium): the warden's peak in 15 springs (HALLERBOS), against
   the iNaturalist requirement and, leave one year out, the wood's own.
4. Baselines on the same cells and folds: one fixed date, a latitude line and each
   cell's own median date in its other years; and in-sample, the year-to-year
   (within-cell anomalies) and place-to-place (cell means) skill.
5. Model family: degree-days from a fixed date against chill-plus-forcing, over a
   grid of start dates, bases and chill settings. The recommended model is the best
   degree-day setting by the sum of the three MAEs (1-3), as for cherry, unless a
   chill setting beats it by more than half a day.
6. A normal year (normals only, as the map shows before spring) at well-known
   bluebell woods, at the mean elevation of their 0.1° cell, as production uses.

Then where to draw it (skipped with --no-where):

- range: the app's GBIF range prior (build_range_priors.py) built for the taxon,
  and the taxon's share of plant records within 50 km relative to its typical share;
- habitat: the broadleaf share (fagus + quercus + other_broadleaf) of the EU host
  cover grid (build_host_cover.py) at each sighting and over the range's land;
- a normal-year cutoff; with --base, on production's 0.1° cells from a local master
  or weather parquet's base-point elevations.

    python backend/tools/calibrate_bluebell.py [--cache DIR] [--records SET] [--grid]
        [--model START,BASE] [--no-lapse] [--keep-sea] [--strict-accuracy] [--base PARQUET] [--no-where]

--records picks the observations: `march_june` (every research-grade record, March-
June, not annotated as budding, fruiting or without flowers: the default),
`april_may` (the same, April and May) or `flowering` (annotated Flowering; most of
them are from 2026). Unknown positional accuracy counts as good, as in
calibrate_bloom.py; --strict-accuracy drops it. --model reports one degree-day
setting instead of the recommended one; --grid prints every grid setting.

Requests, all cached and sequential: about 90 iNaturalist pages (1 s apart,
Retry-After honoured), about 120 POWER series, 55 Open-Meteo elevation calls (100
points each, 12 s apart: it counts every point against 5,000 an hour), the Natural
Earth map units, 112 GBIF map tiles and the host cover from R2 (or its public URL
when the R2 API is unreachable). A response is cached only once it is complete, so
a failed one is fetched again on the next run.
"""
import argparse
import gzip
import io
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

ROOT = _TOOLS.parents[1]
UA = {"User-Agent": "funges-calibrate-bluebell/1.0 (+https://www.fung.es)"}
INAT = "https://api.inaturalist.org/v1/observations?"
TAXON = 56132  # Hyacinthoides non-scripta. H. hispanica is 57635, H. x massartiana 863646.
EUROPE = 97391
YEARS = range(2016, 2027)
MIN_RECORDS = 8
# A POWER cell mostly over the sea follows the sea: warm in March, cool in May. Its
# cliff-top bluebells (Skomer, Anglesey) are not the woods the map follows either.
MIN_LAND = 0.5
POWER = ("https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M&community=AG"
         "&longitude={lon}&latitude={lat}&start={start}&end={end}&format=JSON")
POWER_SPAN = (date(2015, 11, 1), date(2026, 6, 30))
NE = ("https://raw.githubusercontent.com/nvkelso/natural-earth-vector/"
      "ca96624a56bd078437bca8184e78163e5039ad19/geojson/{}.geojson")
ELEVATION = "https://api.open-meteo.com/v1/elevation?"
GBIF_TAXON = 5304283  # Hyacinthoides non-scripta (L.) Chouard ex Rothm.
PLANTAE = 6
GB = {"ENG", "SCT", "WLS"}
IRELAND = {"IRL", "NIR"}
# Natural Earth map units: metropolitan France is FXX, Belgium is Flanders, Wallonia and Brussels.
CONTINENT = {"FXX", "BFR", "BWR", "BCR", "NLD", "DEU"}
# Indices in a season that starts on 1 November; from March, a day earlier in a leap season.
JAN1, FEB1, MAR1, APR1 = 61, 92, 120, 151

# Hallerbos (Halle, Belgium): the forest warden's near-daily bloom reports,
# https://www.hallerbos.be/wanneer-bloeien-hyacinten/bloeiperiode-<year>/. The peak is the
# first report that calls the wood at its best ("het bos is nu op zijn mooist", "de mooiste
# dagen", "de topdag", "volop in bloei"), or the middle of the best period where a report
# names it. False marks the years without such a phrase, read as the middle between the
# full carpet and the first wilting. 2020: the wood was closed (COVID); 2021: no reports.
HALLERBOS = {
    2010: ("04-28", True),   # 28 Apr: "since Sunday [25 Apr] the most beautiful period (7-8 days)"
    2011: ("04-16", True),   # 21 Apr: "this year the bluebells were at their best from 13 to 20 April"
    2012: ("04-29", True),   # 29 Apr: "het bos is nu op zijn mooist"
    2013: ("05-01", True),   # 1 May: "de topdag voor de hyacinten"
    2014: ("04-16", True),   # 16 Apr: "het bos is nu op zijn mooist"
    2015: ("04-24", True),   # 24 Apr: "het bos is nu op zijn mooist" (again 27 Apr)
    2016: ("04-20", True),   # 20 Apr: "het zijn nu de mooiste dagen in het bos"
    2017: ("04-26", True),   # 26 Apr: "het bos is nu op zijn mooist"
    2018: ("04-17", True),   # 17 Apr: "het mooiste van de lente in het bos is nu te beleven"
    2019: ("04-20", False),  # 22 Apr: "five lovely sunny days" of a purple sea; wilting from 24 Apr
    2022: ("04-21", True),   # 21 Apr: "de hyacinten staan nu volop in bloei"; over the peak 26 Apr
    2023: ("04-25", False),  # 25 Apr: purple carpet; 3 May: "het hoogtepunt van de bloei voorbij"
    2024: ("04-14", False),  # 10 Apr: carpet ever more intense; 18 Apr: the first wilting
    2025: ("04-19", True),   # 19 Apr: "het bos is nu op zijn mooist"
    2026: ("04-15", True),   # 15 Apr: "op dit moment is het bos op zijn mooist"
}
HALLERBOS_CELL = (50.5, 4.375)  # the POWER cell of the wood (50.66 N, 4.26 E)

# Well-known bluebell woods for the dry run; their usual windows and sources are in
# the results write-up.
WOODS = [
    ("Ashridge Estate (Dockey Wood), Herts", 51.812, -0.567),
    ("Kew Gardens, London", 51.478, -0.295),
    ("Wakehurst (Bethlehem Wood), W Sussex", 51.066, -0.088),
    ("Blickling Estate (Great Wood), Norfolk", 52.819, 1.221),
    ("Rannerdale, Buttermere, Cumbria", 54.553, -3.291),
    ("Hallerbos, Halle (BE)", 50.664, 4.262),
    ("Zonienwoud / Foret de Soignes (BE)", 50.765, 4.420),
    ("Kluisbos, Kluisbergen (BE)", 50.770, 3.505),
    ("Buggenhoutbos (BE)", 51.012, 4.183),
]


# --- Fetching ----------------------------------------------------------------

def fetch(url, path, valid=lambda body: True, pause=0.0, tries=6):
    """GET through a disk cache. Only a response that passes `valid` is written (via a
    temporary file), so a failed or partial one is fetched again next time."""
    if path.exists():
        return gzip.decompress(path.read_bytes())
    path.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(tries):
        wait = 5.0 * 2 ** attempt
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180) as r:
                body = r.read() if r.status == 200 else b""
            if valid(body):
                tmp = path.with_suffix(".part")
                tmp.write_bytes(gzip.compress(body))
                tmp.replace(path)
                time.sleep(pause)
                return body
            print(f"  incomplete response, retrying: {url[:120]}", file=sys.stderr)
        except urllib.error.HTTPError as e:
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


def inat_pages(cache, flowering):
    """Every research-grade record of the taxon in Europe, March-June 2016-2026."""
    tag = "flowering" if flowering else "all"
    for year in YEARS:
        page = 1
        while True:
            q = {"taxon_id": TAXON, "place_id": EUROPE, "quality_grade": "research",
                 "d1": f"{year}-03-01", "d2": f"{year}-06-30", "per_page": 200, "page": page,
                 "order_by": "id", "order": "asc"}
            if flowering:
                q.update(term_id=12, term_value_id=13)  # Plant Phenology: Flowering
            js = fetch_json(INAT + urllib.parse.urlencode(q), cache / "inat" / f"{tag}_{year}_{page}.json.gz",
                            lambda j, p=page: "results" in j and (len(j["results"]) == 200
                                                                  or p * 200 >= j["total_results"]),
                            pause=1.0)
            yield from js["results"]
            if page * 200 >= min(js["total_results"], 10000):
                break
            page += 1


def phenology(o):
    """'flowering', 'other' (budding, fruiting or no flowers) or '' from the Plant Phenology annotation."""
    values = {a.get("controlled_value_id") for a in o.get("annotations") or []
              if a.get("controlled_attribute_id") == 12 and (a.get("vote_score") or 0) >= 0}
    return "flowering" if 13 in values else "other" if values else ""


def records(cache, strict_accuracy=False):
    """All records as one table; `phen` from the annotation, the flowering query's records included."""
    flowering_ids = {o["id"] for o in inat_pages(cache, True)}
    rows = []
    for o in inat_pages(cache, False):
        if not o.get("location") or o.get("obscured") or not o.get("observed_on"):
            continue
        if (o.get("taxon") or {}).get("id") != TAXON:
            continue
        acc = o.get("positional_accuracy")
        if (acc is None and strict_accuracy) or (acc or 0) > 1000:
            continue
        lat, lon = map(float, o["location"].split(","))
        rows.append((o["id"], o["observed_on"], lat, lon, "flowering" if o["id"] in flowering_ids else phenology(o)))
    df = pd.DataFrame(rows, columns=["id", "date", "lat", "lon", "phen"]).drop_duplicates("id")
    df["flowering"] = df.phen == "flowering"
    df["date"] = pd.to_datetime(df.date, errors="coerce")
    df = df.dropna(subset=["date"])
    df["year"] = df.date.dt.year
    # Index in the season that starts on 1 November of the year before.
    df["idx"] = (df.date - pd.to_datetime((df.year - 1).astype(str) + "-11-01")).dt.days
    return df


def map_units(cache):
    """Natural Earth's 1:50m map units (ENG, SCT, WLS, NIR, IRL, FXX, BFR, ...), in EPSG:3035."""
    import geopandas as gpd

    raw = fetch(NE.format("ne_50m_admin_0_map_units"), cache / "ne_50m_admin_0_map_units.geojson.gz")
    path = cache / "ne_50m_admin_0_map_units.geojson"
    if not path.exists():
        path.write_bytes(raw)
    return gpd.read_file(path)[["GU_A3", "geometry"]].to_crs(3035)


def units(df, cache):
    """The map unit of each record, the nearest within 20 km on the coast."""
    import geopandas as gpd

    pts = gpd.GeoDataFrame(df[["id"]], geometry=gpd.points_from_xy(df.lon, df.lat), crs=4326).to_crs(3035)
    hit = gpd.sjoin_nearest(pts, map_units(cache), how="left", max_distance=20_000)
    return hit.groupby(level=0).GU_A3.first().reindex(df.index)


def land_share(clat, clon, cache):
    """Share of each POWER cell (0.5° x 0.625° around its centre) that is land."""
    import geopandas as gpd
    from shapely.geometry import box

    land = map_units(cache).union_all()
    boxes = gpd.GeoSeries([box(x - 0.3125, y - 0.25, x + 0.3125, y + 0.25) for y, x in zip(clat, clon)],
                          crs=4326).to_crs(3035)
    return np.array([b.intersection(land).area / b.area for b in boxes])


def elevations(lat, lon, cache):
    """Ground elevation (Copernicus 90 m DEM, via Open-Meteo) at each point, read at 0.01°.

    Open-Meteo counts every point as a call (600 a minute, 5,000 an hour), so the
    points are cached one by one and fetched 100 at a time, 12 s apart.
    """
    store = cache / "elevation" / "points.json"
    found = json.loads(store.read_text()) if store.exists() else {}
    pts = [f"{a:.2f},{b:.2f}" for a, b in zip(np.asarray(lat, float), np.asarray(lon, float))]
    missing = sorted(set(pts) - set(found))
    for k in range(0, len(missing), 100):
        chunk = missing[k:k + 100]
        url = ELEVATION + urllib.parse.urlencode({"latitude": ",".join(c.split(",")[0] for c in chunk),
                                                  "longitude": ",".join(c.split(",")[1] for c in chunk)})
        store.with_name("batch.json.gz").unlink(missing_ok=True)  # never another batch's answer
        body = fetch(url, store.with_name("batch.json.gz"), lambda raw, n=len(chunk): len(
            json.loads(raw).get("elevation", [])) == n, pause=12.0, tries=9)
        store.with_name("batch.json.gz").unlink()  # the points store is the cache
        found.update(zip(chunk, json.loads(body)["elevation"]))
        store.parent.mkdir(parents=True, exist_ok=True)
        store.with_suffix(".part").write_text(json.dumps(found))
        store.with_suffix(".part").replace(store)
    return np.array([found[p] for p in pts], float)


def power(lat, lon, cache, span=POWER_SPAN):
    """POWER daily T2M and the grid cell's elevation, NaN where POWER has no value."""
    start, end = span
    n = (end - start).days + 1
    tag = "" if span == POWER_SPAN else f"_{start:%Y%m%d}"
    js = fetch_json(POWER.format(lat=lat, lon=lon, start=start.strftime("%Y%m%d"), end=end.strftime("%Y%m%d")),
                    cache / "power" / f"{lat}_{lon}{tag}.json.gz",
                    lambda j: len(j["properties"]["parameter"]["T2M"]) == n, pause=0.5)
    s = pd.Series(js["properties"]["parameter"]["T2M"], dtype=float)
    s.index = pd.to_datetime(s.index)
    return s.where(s > -900).interpolate(limit=5), float(js["geometry"]["coordinates"][2])


def season(series, year):
    """Daily means from 1 November (year - 1) to 30 June (year), or None if incomplete."""
    a = series[pd.Timestamp(year - 1, 11, 1):pd.Timestamp(year, 6, 30)].to_numpy()
    return a if np.isfinite(a).all() else None


def cells(df, cache, lapse=True):
    """One row per POWER cell and year with >= MIN_RECORDS records: its median day and series.

    With `lapse`, the series is moved from POWER's grid elevation to the median ground
    elevation of the cell-year's records, as production moves the normals to a cell's.
    """
    df = df.assign(clat=(np.round(df.lat / 0.5) * 0.5).round(3), clon=(np.round(df.lon / 0.625) * 0.625).round(4))
    df = df.groupby(["clat", "clon", "year"]).filter(lambda h: len(h) >= MIN_RECORDS)
    df = df.assign(ground=elevations(df.lat, df.lon, cache))
    out, temps = [], []
    for (clat, clon), g in df.groupby(["clat", "clon"]):
        series, elev = power(clat, clon, cache)
        unit = g.unit.mode().iloc[0] if g.unit.notna().any() else None
        for year, h in g.groupby("year"):
            a = season(series, year)
            if a is None:
                continue
            ground = float(np.nanmedian(h.ground))
            out.append(dict(lat=clat, lon=clon, elev=elev, ground=ground, year=year, n=len(h), unit=unit,
                            obs=float(np.median(h.idx)), leap=len(a) == 243))
            temps.append(a[:242] + (bloom.LAPSE * (elev - ground) if lapse else 0.0))  # to 29 Jun in a leap year
    c = pd.DataFrame(out)
    c["group"] = np.select([c.unit.isin(GB), c.unit.isin(IRELAND | CONTINENT)], ["GB", "IE+cont"], "other")
    c["land"] = land_share(c.lat, c.lon, cache)
    return c, np.array(temps)


# --- Models --------------------------------------------------------------------
# A model turns points x days of daily mean (from 1 November) into the forcing summed
# so far, NaN before it starts counting, so a bloom seen before then says nothing.

def degree_days(t, start, base):
    heat = np.cumsum(np.where(np.arange(t.shape[1]) >= start, np.maximum(t - base, 0.0), 0.0), axis=1)
    out = heat.copy()
    out[:, :start] = np.nan
    return out


def chill_forcing(t, below, days, base):
    started = np.cumsum(t < below, axis=1) >= days
    heat = np.cumsum(np.where(started, np.maximum(t - base, 0.0), 0.0), axis=1)
    return np.where(started, heat, np.nan)


def curves(t, model):
    kind, *p = model
    return degree_days(t, *p) if kind == "dd" else chill_forcing(t, *p)


def predict(curve, f):
    done = curve >= f
    idx = done.argmax(axis=1).astype(float)
    idx[~done.any(axis=1)] = np.nan
    return idx


def at(curve, obs):
    i = np.clip(np.rint(obs).astype(int), 0, curve.shape[1] - 1)
    return curve[np.arange(len(curve)), i]


def folds(c, kind):
    """(train mask, test mask) pairs."""
    if kind == "loyo":
        return [(c.year != y).to_numpy() for y in sorted(c.year.unique())], None
    gb = (c.group == "GB").to_numpy()
    other = (c.group == "IE+cont").to_numpy()
    return [gb, other], [other, gb]


def evaluate(c, curve, kind):
    """Errors (predicted - observed, days) of the model and the baselines over the folds."""
    trains, tests = folds(c, kind)
    tests = tests or [~m for m in trains]
    obs, lat = c.obs.to_numpy(), c.lat.to_numpy()
    f_at = at(curve, obs)
    err = {k: np.full(len(c), np.nan) for k in ("model", "fixed", "latitude")}
    req = []
    for train, test in zip(trains, tests):
        f = np.nanmedian(f_at[train])
        req.append(f)
        err["model"][test] = predict(curve[test], f) - obs[test]
        err["fixed"][test] = np.median(obs[train]) - obs[test]
        k, b = np.polyfit(lat[train], obs[train], 1)
        err["latitude"][test] = k * lat[test] + b - obs[test]
    tested = np.zeros(len(c), bool)
    for t in tests:
        tested |= t
    return err, tested, req


def skill(c, pred):
    """Year to year and place to place, in-sample: within-cell anomalies (cells with >= 3 years)
    and cell means, observed against predicted. A slope of observed on predicted near 1 means the
    model's spread is right; above 1, it compresses the differences."""
    d = c.assign(pred=pred, key=c.lat.astype(str) + "," + c.lon.astype(str))
    d = d[np.isfinite(d.pred)]  # cell-years without a peak are counted elsewhere
    cm = d.groupby("key")[["obs", "pred"]].mean()
    d = d[d.key.map(d.key.value_counts()) >= 3]
    if len(d) < 10 or len(cm) < 10:  # a setting whose forcing never starts
        return dict(anom_r=np.nan, anom_slope=np.nan, anom_mae=np.nan, anom_zero=np.nan, anom_n=len(d),
                    space_r=np.nan, space_slope=np.nan)
    oa, pa = d.obs - d.groupby("key").obs.transform("mean"), d.pred - d.groupby("key").pred.transform("mean")
    return dict(anom_r=np.corrcoef(oa, pa)[0, 1], anom_slope=np.polyfit(pa, oa, 1)[0],
                anom_mae=float(np.mean(np.abs(oa - pa))), anom_zero=float(np.mean(np.abs(oa))), anom_n=len(d),
                space_r=np.corrcoef(cm.pred, cm.obs)[0, 1], space_slope=np.polyfit(cm.pred, cm.obs, 1)[0])


def mae(e, mask=None):
    e = e if mask is None else e[mask]
    return float(np.nanmean(np.abs(e))), int(np.isnan(e).sum())


# --- Where to draw it ------------------------------------------------------------

def gbif_grid(macro, taxon, cache, datasets=()):
    """The app's range-prior count grid (build_range_priors.count_grid), tile by tile through the cache."""
    import build_range_priors as brp

    params = urllib.parse.urlencode([
        ("srs", "EPSG:4326"), ("taxonKey", taxon), ("basisOfRecord", "HUMAN_OBSERVATION"),
        ("year", "1990,2025"), ("mode", "GEO_CENTROID")] + [("datasetKey", d) for d in datasets])
    grid = np.zeros(brp.grid_shape(macro))
    tag = f"{taxon}_{'casual' if datasets else 'all'}"
    for x, y in brp.tiles_for(macro):
        url = brp.GBIF_TILE.format(z=brp.ZOOM, x=x, y=y) + "?" + params
        body = fetch(url, cache / "gbif" / f"{tag}_{x}_{y}.mvt.gz", pause=0.5)
        if body:
            brp.bin_tile(grid, macro, body, x, y)
    return grid


def range_grids(cache):
    """The range prior as the app builds it, and the taxon's local share relative to its typical share."""
    import build_range_priors as brp

    macro = brp.MACROS["EU"]
    lats = brp.lat_centers(macro)
    raw, bg = gbif_grid(macro, GBIF_TAXON, cache), gbif_grid(macro, PLANTAE, cache)  # 1990-2025, as the app
    craw = gbif_grid(macro, GBIF_TAXON, cache, brp.CASUAL_DATASETS)
    cbg = gbif_grid(macro, PLANTAE, cache, brp.CASUAL_DATASETS)
    targets = [brp.smooth_counts(raw, lats, s) for s in brp.SCALES_KM]
    backgrounds = [brp.smooth_counts(bg, lats, s) for s in brp.SCALES_KM]
    prior = np.maximum(brp.range_prior(targets, backgrounds),
                       brp.casual_presence(brp.smooth_counts(craw, lats), brp.smooth_counts(cbg, lats)))
    with np.errstate(invalid="ignore", divide="ignore"):
        rel = np.nan_to_num(targets[0] / backgrounds[0]) / brp.typical_share(targets[0], backgrounds[0])
    return macro, prior, rel


def lookup(grid, lat0, lon0, step, lat, lon, fill=np.nan):
    i = np.floor((np.asarray(lat) - lat0) / step).astype(int)
    j = np.floor((np.asarray(lon) - lon0) / step).astype(int)
    ok = (i >= 0) & (i < grid.shape[0]) & (j >= 0) & (j < grid.shape[1])
    out = np.full(len(i), fill, float)
    out[ok] = grid[i[ok], j[ok]]
    return out


def host_cover(cache):
    """The EU host cover grid (from R2, as the pipeline reads it) and its broadleaf share of the ground."""
    import build_season_curves as curves
    from range_prior import COVER_SCALE, load_host_cover

    path = cache / "EU_host_cover.npz"
    if not path.exists():
        curves.load_dotenv(ROOT / ".env")
        curves.load_dotenv(ROOT / ".env.secret")
        url = curves.get_required_env("EU_HOST_COVER")
        try:
            raw = curves.r2_fetch(url)
        except Exception as e:  # the R2 API is unreachable at times; the public URL serves the same file
            print(f"  R2 API failed ({type(e).__name__}); reading {url}", file=sys.stderr)
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=300) as r:
                raw = r.read()
        np.load(io.BytesIO(raw))  # a truncated file fails here, before it is cached
        path.with_suffix(".part").write_bytes(raw)
        path.with_suffix(".part").replace(path)
    cover = load_host_cover(path.read_bytes())
    broadleaf = sum(cover["classes"][k].astype(float) for k in ("fagus", "quercus", "other_broadleaf")) / COVER_SCALE
    return cover, broadleaf


# --- Report ------------------------------------------------------------------------

def table(header, rows):
    print("| " + " | ".join(header) + " |")
    print("|" + "|".join("---" for _ in header) + "|")
    for r in rows:
        print("| " + " | ".join(str(x) for x in r) + " |")
    print()


def day_name(idx, leap=False):
    """Season index -> '23 Apr' (a non-leap season unless `leap`)."""
    d = date(2023 if leap else 2022, 11, 1) + timedelta(days=int(round(idx)))  # the February after is 2024 or 2023
    return f"{d.day} {d:%b}"


def model_name(m):
    if m[0] == "dd":
        return f"degree-days from {day_name(m[1])}, base {m[2]:g} °C"
    return f"chill {m[2]} d below {m[1]:g} °C, then base {m[3]:g} °C"


def select(allrec, which):
    """The records a set uses: annotated flowering, or every record not annotated otherwise."""
    month = allrec.date.dt.month
    return allrec[{"flowering": allrec.flowering,
                   "april_may": month.isin([4, 5]) & (allrec.phen != "other"),
                   "march_june": allrec.phen != "other"}[which]]


def proxy_check(allrec):
    """2026 cells with >= MIN_RECORDS flowering records: each plain set's median against theirs."""
    a = allrec[allrec.year == 2026].assign(clat=lambda d: (np.round(d.lat / 0.5) * 0.5).round(3),
                                           clon=lambda d: (np.round(d.lon / 0.625) * 0.625).round(4))
    fl = a[a.flowering].groupby(["clat", "clon"]).idx.agg(["median", "size"])
    fl = fl[fl["size"] >= MIN_RECORDS]
    rows = []
    for name in ("april_may", "march_june"):
        p = select(a, name).groupby(["clat", "clon"]).idx.agg(["median", "size"])
        j = fl.join(p, rsuffix="_p", how="inner")
        j = j[j.size_p >= MIN_RECORDS]
        d = j.median_p - j["median"]
        rows.append((name, len(j), f"{d.mean():+.1f}", f"{d.abs().mean():.1f}", f"{d.abs().max():.0f}"))
    print(f"## Plain records as a stand-in for the flowering annotation (2026, {len(fl)} cells with "
          f">= {MIN_RECORDS} flowering records)\n")
    table(["set", "cells", "median minus the flowering median (mean)", "mean absolute", "largest"], rows)


def hallerbos(cache, lapse=True):
    """The warden's peaks (HALLERBOS) and POWER at the wood's cell from 1 November 2009, at its elevation."""
    series, elev = power(*HALLERBOS_CELL, cache, (date(2009, 11, 1), POWER_SPAN[1]))
    wood = next(w for w in WOODS if w[0].startswith("Hallerbos"))
    shift = bloom.LAPSE * (elev - elevations([wood[1]], [wood[2]], cache)[0]) if lapse else 0.0
    years = sorted(HALLERBOS)
    t = np.array([season(series, y)[:242] + shift for y in years])
    obs = np.array([(pd.Timestamp(f"{y}-{HALLERBOS[y][0]}") - pd.Timestamp(y - 1, 11, 1)).days for y in years], float)
    return years, t, obs, np.array([HALLERBOS[y][1] for y in years])


def hallerbos_errors(curve, obs, f_inat):
    """Errors with the iNaturalist requirement, and leave one year out on the wood's own."""
    f_at = at(curve, obs)
    own = np.array([predict(curve[i:i + 1], np.nanmedian(np.delete(f_at, i)))[0] for i in range(len(obs))]) - obs
    return predict(curve, f_inat) - obs, own


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cache", type=Path, default=Path.home() / ".cache" / "funges-bluebell")
    ap.add_argument("--records", choices=("flowering", "april_may", "march_june"), default="march_june")
    ap.add_argument("--strict-accuracy", action="store_true")
    ap.add_argument("--grid", action="store_true")
    ap.add_argument("--no-where", action="store_true")
    ap.add_argument("--no-lapse", action="store_true", help="keep POWER at its grid elevation")
    ap.add_argument("--keep-sea", action="store_true", help=f"keep POWER cells under {MIN_LAND:.0%} land")
    ap.add_argument("--model", help="START,BASE: report this degree-day model (START a season index) instead")
    ap.add_argument("--base", type=Path, help="a regional master or weather parquet: its base points' elevations "
                                              "give production's 0.1° cells for the late-peak cutoff check")
    args = ap.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    pd.set_option("display.width", 200)

    allrec = records(args.cache, args.strict_accuracy)
    allrec["unit"] = units(allrec, args.cache)
    rec = select(allrec, args.records)
    print(f"# Records: {len(allrec)} research grade, March-June 2016-2026, not obscured, coordinates good to "
          f"1 km{'' if args.strict_accuracy else ' or of unknown accuracy'}; {int(allrec.flowering.sum())} "
          f"annotated flowering, {int((allrec.phen == 'other').sum())} annotated otherwise; using "
          f"{args.records}: {len(rec)}\n")
    table(["year", "records", "annotated flowering", args.records],
          [(y, int((allrec.year == y).sum()), int((allrec.flowering & (allrec.year == y)).sum()),
            int((rec.year == y).sum())) for y in YEARS])
    table(["map unit", "records", "share"], [(u, n, f"{n / len(rec):.1%}")
                                             for u, n in rec.unit.fillna("sea").value_counts().head(15).items()])
    proxy_check(allrec)
    c, t = cells(rec, args.cache, not args.no_lapse)
    sea = (c.land < MIN_LAND).to_numpy()
    where_sea = sorted({f"{a} N {b} E ({u}, {x:.0%} land)"
                        for a, b, u, x in c[sea][["lat", "lon", "unit", "land"]].itertuples(index=False)})
    dz = c.ground - c.elev
    print(f"POWER cells under {MIN_LAND:.0%} land: {len(where_sea)} cells, {int(sea.sum())} cell-years, "
          f"{'kept' if args.keep_sea else 'dropped'}: {'; '.join(where_sea)}.\n")
    print(f"Records' median ground elevation minus POWER's grid elevation: median {np.median(dz):+.0f} m, "
          f"10-90% {np.percentile(dz, 10):+.0f} to {np.percentile(dz, 90):+.0f} m; the series are "
          f"{'not moved' if args.no_lapse else f'moved at {bloom.LAPSE * 1000:g} °C/km'}.\n")
    if not args.keep_sea:
        c, t = c[~sea].reset_index(drop=True), t[~sea]
    print(f"Cell-years with >= {MIN_RECORDS} records: {len(c)} in {c[['lat', 'lon']].drop_duplicates().shape[0]} "
          f"cells, {c.n.sum()} records; GB {int((c.group == 'GB').sum())}, Ireland + FR/BE/NL/DE "
          f"{int((c.group == 'IE+cont').sum())}, elsewhere {int((c.group == 'other').sum())}\n")
    table(["year", "cell-years", "median observed peak"],
          [(y, len(g), day_name(g.obs.median())) for y, g in c.groupby("year")])
    table(["map unit", "cell-years", "median observed peak"],
          [(u, len(g), day_name(g.obs.median())) for u, g in c.groupby("unit")])
    hb_years, hb_t, hb_obs, hb_exact = hallerbos(args.cache, not args.no_lapse)

    # --- 5. the family and the grid ---
    grid = ([("dd", s, b) for s in (JAN1, FEB1, 106, MAR1, 134, APR1, 166) for b in (-6, -4, -2, -1, 0, 1, 2, 4, 6)]
            + [("chill", tc, cd, b) for tc in (3, 5, 7, 10, 12) for cd in (15, 30, 45, 60, 90) for b in (0, 2, 4)])
    scores = []
    for m in grid:
        cv = curves(t, m)
        e_loyo, _, req = evaluate(c, cv, "loyo")
        e_tr, tested, _ = evaluate(c, cv, "transfer")
        (l_mae, l_none), (t_mae, t_none) = mae(e_loyo["model"]), mae(e_tr["model"], tested)
        f_all = float(np.nanmedian(at(cv, c.obs.to_numpy())))
        hb_inat, hb_own = hallerbos_errors(curves(hb_t, m), hb_obs, f_all)
        scores.append(dict(model=m, loyo=l_mae, loyo_none=l_none, transfer=t_mae, transfer_none=t_none,
                           hb=mae(hb_own)[0], hb_inat=mae(hb_inat)[0], hb_bias=float(np.nanmean(hb_inat)),
                           requirement=f_all, **skill(c, predict(cv, f_all)),
                           cost=l_mae + t_mae + mae(hb_own)[0] + 30 * (l_none + t_none) / len(c)))
    s = pd.DataFrame(scores)
    s["kind"] = s.model.str[0]
    best = s.loc[s.cost.idxmin()]
    best_dd = s[s.kind == "dd"].loc[s[s.kind == "dd"].cost.idxmin()]
    best_ch = s[s.kind == "chill"].loc[s[s.kind == "chill"].cost.idxmin()]
    dd = s[s.kind == "dd"].assign(start=s.model.str[1], base=s.model.str[2])
    for col, title in (("loyo", "leave-one-year-out MAE"), ("transfer", "geographic transfer MAE (both directions)"),
                       ("hb", "Hallerbos MAE, leave one year out on its own requirement")):
        print(f"## 5. Degree-days from a fixed date: {title} (days), by start and base\n")
        piv = dd.pivot(index="start", columns="base", values=col)
        table(["start"] + [f"{b:g} °C" for b in piv.columns],
              [[day_name(i)] + [f"{v:.2f}" for v in r] for i, r in piv.iterrows()])
    print("## 5. Chill + forcing: best settings by the total\n")
    ch = s[s.kind == "chill"].sort_values("cost")
    head = ["model", "LOYO", "transfer", "Hallerbos", "total", "no peak", "requirement",
            "year-to-year r (iNat)", "spatial slope"]

    def line(r):
        return (model_name(r.model), f"{r.loyo:.2f}", f"{r.transfer:.2f}", f"{r.hb:.2f}", f"{r.cost:.2f}",
                r.loyo_none + r.transfer_none, f"{r.requirement:.0f}", f"{r.anom_r:.2f}", f"{r.space_slope:.2f}")
    table(head, [line(r) for r in (ch if args.grid else ch.head(8)).itertuples()])
    print("## 5. Degree-days: best settings by the total\n")
    table(head, [line(r) for r in s[s.kind == "dd"].sort_values("cost").head(8).itertuples()])
    print("## 5. Best of each family\n")
    table(["family"] + head, [(k, *line(r)) for k, r in (("degree-days", best_dd), ("chill + forcing", best_ch))])
    near = s[s.cost <= best.cost + 0.5]
    print(f"{len(near)} settings within 0.5 days of the best total ({best.cost:.2f}, the sum of the three MAEs); "
          f"degree-day settings among them: {int((near.kind == 'dd').sum())}\n")
    if args.grid:
        print(s.sort_values("cost").to_string(), "\n")

    # The recommended model: the best plain degree-day model, unless chill clearly wins.
    m = best_dd.model if best_dd.cost <= best_ch.cost + 0.5 else best_ch.model
    if args.model:
        start, base = args.model.split(",")
        m = ("dd", int(start), float(base))
    print(f"# {'Chosen with --model' if args.model else 'Recommended'}: {model_name(m)}\n")
    cv = curves(t, m)
    f_all = float(np.nanmedian(at(cv, c.obs.to_numpy())))
    sk = skill(c, predict(cv, f_all))
    print(f"Requirement on all {len(c)} cell-years: {f_all:.1f} °C·days\n")
    print(f"In-sample skill. Year to year, within {sk['anom_n']} cell-years of cells with >= 3 years: "
          f"r = {sk['anom_r']:.2f}, slope of observed on predicted {sk['anom_slope']:.2f}, MAE of the anomaly "
          f"{sk['anom_mae']:.2f} d against {sk['anom_zero']:.2f} d for 'a normal year'. Place to place, cell means: "
          f"r = {sk['space_r']:.2f}, slope {sk['space_slope']:.2f}.\n")
    if args.records != "flowering":
        # The plain-record median as a stand-in for full flower: the requirement on the 2026 cells
        # that also have >= MIN_RECORDS annotated flowering records, from each set.
        cf, tf = cells(select(allrec, "flowering"), args.cache, not args.no_lapse)
        ff = cf.assign(f=at(curves(tf, m), cf.obs.to_numpy()))
        fp = c.assign(f=at(cv, c.obs.to_numpy()))
        same = fp[fp.year == 2026].merge(ff[ff.year == 2026], on=["lat", "lon"], suffixes=("_p", "_f"))
        gap = float(np.nanmedian(same.f_p) - np.nanmedian(same.f_f))
        f_peak = round(f_all - gap)
        e_hb, _ = hallerbos_errors(curves(hb_t, m), hb_obs, f_peak)
        e_in = predict(cv, f_peak) - c.obs.to_numpy()
        print(f"On the {len(same)} cells of 2026 with both: requirement {np.nanmedian(same.f_p):.0f} °C·days from "
              f"{args.records}, {np.nanmedian(same.f_f):.0f} from the flowering annotation. Lowered by that gap, "
              f"{f_peak} °C·days: Hallerbos MAE {mae(e_hb)[0]:.2f} d (bias {np.nanmean(e_hb):+.1f}), the cells "
              f"in-sample {mae(e_in)[0]:.2f} d (bias {np.nanmean(e_in):+.1f}).\n")
    reg = c.unit.replace({"BFR": "BE", "BWR": "BE", "BCR": "BE", "NIR": "IE", "IRL": "IE"})
    bias = pd.Series(predict(cv, f_all) - c.obs.to_numpy()).groupby(reg.to_numpy())
    table(["region (in-sample)", "cell-years", "bias, predicted - observed (d)", "MAE (d)"],
          [(k, len(g), f"{g.mean():+.1f}", f"{g.abs().mean():.1f}") for k, g in bias if len(g) >= 3])

    # --- 1. leave one year out, with baselines ---
    e, _, req = evaluate(c, cv, "loyo")
    clim = np.full(len(c), np.nan)  # the cell's own median day in the other years
    for i, r in enumerate(c.itertuples()):
        other = c[(c.lat == r.lat) & (c.lon == r.lon) & (c.year != r.year)]
        if len(other):
            clim[i] = other.obs.median() - r.obs
    rows = []
    for y in sorted(c.year.unique()):
        k = (c.year == y).to_numpy()
        rows.append((y, int(k.sum()), f"{req[len(rows)]:.0f}", *(f"{mae(e[x], k)[0]:.1f}" for x in e),
                     f"{np.nanmean(e['model'][k]):+.1f}"))
    rows.append(("all", len(c), f"{np.median(req):.0f}", *(f"**{mae(e[x])[0]:.2f}**" for x in e),
                 f"{np.nanmean(e['model']):+.1f}"))
    print("## 1. Leave one year out (MAE, days)\n")
    table(["held-out year", "cell-years", "requirement", "model", "fixed date", "latitude line", "model bias"], rows)
    has = np.isfinite(clim)
    print(f"Cell-years whose cell has other years: {int(has.sum())}. On those: model "
          f"{mae(e['model'], has)[0]:.2f}, the cell's own median in its other years {mae(clim, has)[0]:.2f}, "
          f"fixed date {mae(e['fixed'], has)[0]:.2f}, latitude line {mae(e['latitude'], has)[0]:.2f} days; "
          f"without a peak: {mae(e['model'])[1]}\n")
    yr = c.assign(pred=e["model"] + c.obs).groupby("year")[["obs", "pred"]].mean()
    print(f"Year means, observed vs predicted (LOYO): r = {np.corrcoef(yr.obs, yr.pred)[0, 1]:.2f}, "
          f"observed spread (SD) {yr.obs.std():.1f} d, predicted {yr.pred.std():.1f} d\n")
    big = (c.n >= 15).to_numpy()
    print(f"Cell-years with >= 15 records ({int(big.sum())}): model {mae(e['model'], big)[0]:.2f}, "
          f"fixed date {mae(e['fixed'], big)[0]:.2f}, latitude line {mae(e['latitude'], big)[0]:.2f} days\n")

    # --- 2. transfer ---
    e, tested, req = evaluate(c, cv, "transfer")
    gb = (c.group == "GB").to_numpy()
    other = (c.group == "IE+cont").to_numpy()
    print("## 2. Geographic transfer (MAE, days)\n")
    table(["fitted on", "tested on", "cell-years", "requirement", "model", "fixed date", "latitude line",
           "model bias", "without a peak"],
          [("GB", "Ireland + FR/BE/NL/DE", int(other.sum()), f"{req[0]:.0f}",
            *(f"{mae(e[x], other)[0]:.1f}" for x in e), f"{np.nanmean(e['model'][other]):+.1f}",
            mae(e["model"], other)[1]),
           ("Ireland + FR/BE/NL/DE", "GB", int(gb.sum()), f"{req[1]:.0f}",
            *(f"{mae(e[x], gb)[0]:.1f}" for x in e), f"{np.nanmean(e['model'][gb]):+.1f}",
            mae(e["model"], gb)[1])])
    table(["tested unit", "cell-years", "model MAE", "model bias"],
          [(u, int((c.unit == u).sum()), f"{mae(e['model'], (c.unit == u).to_numpy())[0]:.1f}",
            f"{np.nanmean(e['model'][(c.unit == u).to_numpy()]):+.1f}")
           for u in sorted(c[gb | other].unit.unique())])

    # --- 3. Hallerbos, 15 springs ---
    hb_cv = curves(hb_t, m)
    hb_inat, hb_own = hallerbos_errors(hb_cv, hb_obs, f_all)
    fixed = np.array([np.median(np.delete(hb_obs, i)) for i in range(len(hb_obs))]) - hb_obs
    print(f"## 3. Hallerbos, {len(hb_years)} springs ({int(hb_exact.sum())} with an explicit 'at its best')\n")
    table(["year", "warden's peak", "predicted, iNaturalist requirement", "error", "predicted, own LOYO", "error"],
          [(y, day_name(o, y % 4 == 0) + ("" if x else " (approx.)"),
            day_name(o + a, y % 4 == 0), f"{a:+.0f}", day_name(o + b, y % 4 == 0), f"{b:+.0f}")
           for y, o, x, a, b in zip(hb_years, hb_obs, hb_exact, hb_inat, hb_own)])
    print(f"MAE with the iNaturalist requirement {mae(hb_inat)[0]:.2f} d (bias {np.nanmean(hb_inat):+.1f}); "
          f"leave one year out on its own requirement {mae(hb_own)[0]:.2f} d "
          f"(explicit years only {mae(hb_own, hb_exact)[0]:.2f}); its own fixed date, leave one year out, "
          f"{mae(fixed)[0]:.2f} d. Its requirement: {np.nanmedian(at(hb_cv, hb_obs)):.0f} °C·days. "
          f"r(observed, predicted) = {np.corrcoef(hb_obs, hb_obs + hb_own)[0, 1]:.2f}\n")

    # --- the normal year at the cells, and the WeatherAPI offset ---
    normals = dict(np.load(ROOT / "backend" / "generated" / "bloom_normals_EU.npz"))
    # The normals at each cell-year's elevation, as its series (the normal year has 28 February only).
    nt = bloom.daily_normals(normals, c.lat.to_numpy(), c.lon.to_numpy(),
                             (c.elev if args.no_lapse else c.ground).to_numpy(), date(2026, 11, 1), 242)
    n_err = predict(curves(nt, m), f_all) - c.obs.to_numpy()
    w_err = predict(curves(t - 0.5, m), f_all) - predict(cv, f_all)
    print(f"Normals only (1991-2020) at the cells: MAE {mae(n_err)[0]:.2f} d, bias {np.nanmean(n_err):+.1f} d. "
          f"Daily POWER, in-sample requirement: MAE {mae(predict(cv, f_all) - c.obs.to_numpy())[0]:.2f} d.")
    print(f"WeatherAPI 0.5 °C colder than POWER moves the peak {np.nanmean(w_err):+.1f} d "
          f"(range {np.nanmin(w_err):+.0f} to {np.nanmax(w_err):+.0f}).\n")

    # --- 6. a normal year at the woods ---
    q = []
    for _, lat, lon in WOODS:
        cy, cx = np.rint(lat / bloom.CELL) * bloom.CELL, np.rint(lon / bloom.CELL) * bloom.CELL
        g = np.arange(-0.04, 0.041, 0.02)
        q.append([(lat, lon)] + [(cy + a, cx + b) for a in g for b in g])
    pts = [p for qq in q for p in qq]
    elev = []
    for k in range(0, len(pts), 100):
        chunk = pts[k:k + 100]
        url = ELEVATION + urllib.parse.urlencode({"latitude": ",".join(f"{p[0]:.4f}" for p in chunk),
                                                  "longitude": ",".join(f"{p[1]:.4f}" for p in chunk)})
        elev += fetch_json(url, args.cache / "elevation" / f"woods_{k}.json.gz",
                           lambda j, n=len(chunk): len(j.get("elevation", [])) == n)["elevation"]
    elev = np.array(elev, float).reshape(len(WOODS), -1)
    site_e, cell_e = elev[:, 0], np.where(elev[:, 1:] > 0, elev[:, 1:], np.nan).mean(axis=1)
    wt = bloom.daily_normals(normals, [w[1] for w in WOODS], [w[2] for w in WOODS], cell_e, date(2026, 11, 1), 242)
    wp = predict(curves(wt, m), f_all)
    print("## 6. A normal year at bluebell woods (normals at the 0.1° cell's mean elevation)\n")
    table(["wood", "site elevation", "cell elevation", "predicted peak"],
          [(w[0], f"{a:.0f} m", f"{b:.0f} m", day_name(p) if np.isfinite(p) else "none")
           for w, a, b, p in zip(WOODS, site_e, cell_e, wp)])

    if args.no_where:
        return
    where(allrec, normals, m, f_all, args.cache, args.base)


def where(allrec, normals, m, f_all, cache, base=None):
    """Range and habitat: what share of the sightings each mask keeps, and of the ground."""
    import geopandas as gpd

    print("# Where to draw it\n")
    macro, prior, rel = range_grids(cache)
    lat0, lon0 = macro["lat"][0], macro["lon"][0]
    cover, broadleaf = host_cover(cache)
    # Land: the host grid's 0.05° cells whose centre is on Natural Earth land and that the tree
    # map covers (the same box as the range grid, at half its step), and the 0.1° cells holding one.
    from rasterio.features import rasterize
    from rasterio.transform import from_origin

    step, (ny, nx) = cover["step"], cover["mapped"].shape
    land05 = rasterize(((g, 1) for g in map_units(cache).to_crs(4326).geometry), out_shape=(ny, nx),
                       transform=from_origin(cover["lon0"], cover["lat0"] + ny * step, step, step),
                       fill=0, dtype="uint8")[::-1] > 0
    land05 &= cover["mapped"]
    land = land05.reshape(rel.shape[0], 2, rel.shape[1], 2).any(axis=(1, 3))
    rec = allrec.assign(prior=lookup(prior, lat0, lon0, 0.1, allrec.lat, allrec.lon, 1.0),
                        rel=lookup(rel, lat0, lon0, 0.1, allrec.lat, allrec.lon, 0.0))
    native = rec.unit.isin(GB | IRELAND | CONTINENT - {"DEU"} | {"ESP", "PRX", "IMN", "GGY", "JEY"}).to_numpy()
    held = (rec.year == 2026).to_numpy()
    print(f"Sightings: {len(rec)} research-grade records 2016-2026, {int(native.sum())} in the native range by "
          f"country (GB, IE, FR, BE, NL, ES, PT after POWO, with Man and the Channel Islands), "
          f"{int((~native).sum())} elsewhere. Land: "
          f"{int(land.sum())} 0.1° cells.\n")
    print("## Range: the app's range prior (TOLERANCE 0.02), or the taxon's share of plant records near a cell "
          "relative to its typical share (50 km)\n")
    rows = []
    for name, grid, col, thr in ([("range prior", prior, "prior", 0.5)]
                                 + [("relative share", rel, "rel", x) for x in (0.02, 0.05, 0.1, 0.2, 0.3, 0.5)]):
        k = (rec[col] >= thr).to_numpy()
        rows.append((f"{name} >= {thr:g}", f"{k.mean():.1%}", f"{k[held].mean():.1%}", f"{k[native].mean():.1%}",
                     f"{k[~native].mean():.1%}", f"{int((grid >= thr)[land].sum())}"))
    table(["mask", "sightings kept", "2026 sightings kept", "native countries", "elsewhere", "land cells drawn"], rows)
    by = rec.assign(keep=rec.rel >= 0.1, keep_prior=rec.prior >= 0.5).groupby(rec.unit.fillna("sea"))
    table(["map unit", "sightings", "kept, relative share >= 0.1", "kept, range prior >= 0.5"],
          [(r.Index, int(r.n), f"{r.k:.0%}", f"{r.p:.0%}") for r in by.agg(
              n=("id", "size"), k=("keep", "mean"), p=("keep_prior", "mean")).sort_values("n", ascending=False)
           .head(20).itertuples()])
    # What the mask draws, by map unit.
    iy, ix = np.nonzero((rel >= 0.1) & land)
    centres = gpd.GeoDataFrame(geometry=gpd.points_from_xy(lon0 + (ix + 0.5) * 0.1, lat0 + (iy + 0.5) * 0.1),
                               crs=4326).to_crs(3035)
    drawn = gpd.sjoin_nearest(centres, map_units(cache), how="left", max_distance=20_000)
    drawn = drawn[~drawn.index.duplicated()].GU_A3.fillna("sea").value_counts()
    print("Land cells drawn with relative share >= 0.1, by map unit: "
          + ", ".join(f"{u} {n}" for u, n in drawn.head(16).items()) + "\n")
    # Natuurpunt's native edge in Belgium (Mechelen - Gembloux - Namur - Meuse), roughly 4.6° E.
    be = rec[rec.unit.isin(["BFR", "BWR", "BCR"])]
    east, west = be[be.lon > 4.6], be[be.lon <= 4.6]
    nor = rec[rec.unit == "NOR"]
    print(f"Belgium: kept {(west.rel >= 0.1).mean():.0%} of {len(west)} sightings west of 4.6° E and "
          f"{(east.rel >= 0.1).mean():.0%} of {len(east)} east of it. Norway: {len(nor)} sightings, "
          f"{int((nor.rel >= 0.1).sum())} kept, at "
          + ", ".join(f"{a:.2f} N {b:.2f} E" for a, b in nor[nor.rel >= 0.1][["lat", "lon"]].itertuples(index=False))
          + ".\n")

    # The normal-year peak (normals at POWER's grid elevation) as a cutoff.
    nt = bloom.daily_normals(normals, normals["lat"], normals["lon"], normals["elev"], date(2026, 11, 1), 242)
    npk = predict(curves(nt, m), f_all)
    near = np.array([np.argmin((normals["lat"] - a) ** 2 + (normals["lon"] - b) ** 2)
                     for a, b in zip(rec.lat, rec.lon)])
    pk = npk[near]
    in_range = lookup(rel, lat0, lon0, 0.1, normals["lat"], normals["lon"], 0.0) >= 0.1
    print(f"## A normal year as a cutoff\n\nNormal-year peak at the sightings' POWER cells (grid elevation): 1st-99th "
          f"percentile {day_name(np.nanpercentile(pk, 1))} - {day_name(np.nanpercentile(pk, 99))}, earliest "
          f"{day_name(np.nanmin(pk))}, latest {day_name(np.nanmax(pk))}; without a peak by 30 June: "
          f"{int(np.isnan(pk).sum())}. POWER cells in the range mask later than that: "
          f"{np.mean(~(npk[in_range] <= np.nanmax(pk))):.1%}.\n")
    if base is not None:
        # Production's 0.1° cells: base points averaged, the normals moved to the cell's mean elevation.
        import pyarrow.parquet as pq

        pf = pq.ParquetFile(base)
        pts = pd.concat(pf.read_row_group(g, columns=["Latitude", "Longitude", "Elevation (m)"]).to_pandas()
                        .drop_duplicates() for g in range(pf.num_row_groups)).drop_duplicates()
        pts = pts.assign(cy=np.rint(pts.Latitude / bloom.CELL), cx=np.rint(pts.Longitude / bloom.CELL))
        cl = pts.groupby(["cy", "cx"])["Elevation (m)"].mean().reset_index()
        cl = cl[lookup(rel, lat0, lon0, 0.1, cl.cy * bloom.CELL, cl.cx * bloom.CELL, 0.0) >= 0.1]
        cp = predict(curves(bloom.daily_normals(normals, cl.cy * bloom.CELL, cl.cx * bloom.CELL,
                                                cl["Elevation (m)"].to_numpy(), date(2026, 11, 1), 242), m), f_all)
        rows = [(f"after {day_name(d)}", f"{np.mean(~(cp <= d)):.2%}", int((~(cp <= d)).sum()),
                 f"{cl['Elevation (m)'][~(cp <= d)].min():.0f} m" if (~(cp <= d)).any() else "-")
                for d in (195, 211, 226)]  # after 15 May, 31 May, 15 June (a normal year has no 29 February)
        print(f"{base.name}: {len(cl)} of its 0.1° cells in the range mask; normal-year peak 1st-99th percentile "
              f"{day_name(np.nanpercentile(cp, 1))} - {day_name(np.nanpercentile(cp, 99))}, none by 30 June: "
              f"{int(np.isnan(cp).sum())}.\n")
        table(["normal-year peak", "share of the cells", "cells", "lowest such cell"], rows)

    # --- habitat ---
    b = lookup(broadleaf, cover["lat0"], cover["lon0"], cover["step"], rec.lat, rec.lon)
    mapped = lookup(cover["mapped"].astype(float), cover["lat0"], cover["lon0"], cover["step"], rec.lat, rec.lon, 0) > 0
    keep = (rec.rel >= 0.1).to_numpy()
    inside = np.repeat(np.repeat(rel >= 0.1, 2, axis=0), 2, axis=1) & land05  # the range's 0.05° land cells
    print("## Habitat: broadleaf share of the ground (fagus + quercus + other_broadleaf, smoothed over ~5 km)\n")
    print(f"Sightings on mapped ground: {mapped.mean():.1%}. Median broadleaf share: at the sightings in the range "
          f"mask {np.nanmedian(b[mapped & keep]):.1%}, over the range's ground {np.median(broadleaf[inside]):.1%}.\n")
    rows = []
    for thr in (0.0, 0.01, 0.02, 0.03, 0.05, 0.075, 0.1, 0.15, 0.2):
        k = b >= thr
        rows.append((f">= {thr:.1%}", f"{k[mapped & keep].mean():.1%}", f"{k[mapped & keep & held].mean():.1%}",
                     f"{(broadleaf[inside] >= thr).mean():.1%}"))
    table(["broadleaf share", "sightings in the range mask kept", "2026 sightings kept", "range ground kept"], rows)
    rec = rec.assign(broadleaf=b)
    table(["map unit", "sightings", "median broadleaf share", "kept at >= 3%", "kept at >= 5%"],
          [(r.Index, int(r.n), f"{r.med:.1%}", f"{r.k3:.0%}", f"{r.k5:.0%}") for r in rec[mapped & keep].groupby(
              rec.unit.fillna("sea")).broadleaf.agg(n="size", med="median", k3=lambda x: (x >= 0.03).mean(),
                                                     k5=lambda x: (x >= 0.05).mean())
           .sort_values("n", ascending=False).head(12).itertuples()])
    wb = lookup(broadleaf, cover["lat0"], cover["lon0"], cover["step"], [w[1] for w in WOODS], [w[2] for w in WOODS])
    wr = lookup(rel, lat0, lon0, 0.1, [w[1] for w in WOODS], [w[2] for w in WOODS], 0.0)
    table(["wood", "broadleaf share", "relative share"],
          [(w[0], f"{x:.1%}", f"{y:.2f}") for w, x, y in zip(WOODS, wb, wr)])


if __name__ == "__main__":
    main()
