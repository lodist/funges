#!/usr/bin/env python3
"""Local season curves: when each mushroom fruits here, from the GBIF records around each place.

The region curves (build_season_curves.py) give one season to half a continent. In Florida
the chanterelles' October is half their July peak (11 against 22 records per 1,000 fungi),
in the US East as a whole a tenth, so the US East curve closed Florida's season a month
early; central Italy's chanterelles peak in October, the Alps' in July.

Every 0.1° cell gets its own curve, the species' records against all fungi records, month by
month, from three layers, each leaning on the next where its records are few (k pseudo-records):
  - here: a Gaussian kernel of `km` around the cell;
  - its climate: every place on the continent with a similar summer, winter and summer share of
    the year's rain (ERA5 normals), so central Italy borrows from Spain and Greece, not from the
    Alps next door, and a mountain from other mountains;
  - the continent.

    python backend/tools/build_local_season.py --crawl        # GBIF tiles -> --cache
    python backend/tools/build_local_season.py --test         # held-out test, CSVs in --cache
    python backend/tools/build_local_season.py --show EU chant 43.9 10.9
    python backend/tools/build_local_season.py --export       # R2 + generated/local_season.json
"""
import argparse
import json
import sys
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np

_TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(_TOOLS.parent))
sys.path.insert(0, str(_TOOLS))
sys.path.append(str(_TOOLS.parents[1] / "scripts"))  # qa_spatial_weights.region_config
import build_range_priors as rp  # noqa: E402  (GBIF map tiles, the 0.1° macro grids)
from species_registry import get_empirical_taxon_map, get_region_species  # noqa: E402

APP = _TOOLS.parents[2]
ROOT = _TOOLS.parents[1]
FUNGI = 5  # kingdom: everyone's effort, the denominator of every curve
# Two periods, so the curves can be fitted on one and tested on the other; production sums them.
PERIODS = ("2010,2019", "2020,2026")
WORKERS = 4


def macro_species(code):
    """{species: GBIF keys} for the mushrooms with a season curve in one macro region."""
    available = set().union(*(get_region_species(r) for r in rp.MACROS[code]["regions"]))
    return {sp: keys for sp, keys in get_empirical_taxon_map().items() if sp in available}


def month_grids(macro, keys, years, workers=WORKERS):
    """(12, rows, cols) human-observation records per 0.1° cell, one grid per calendar month.

    A tile that fails after its retries raises, so nothing incomplete reaches the cache.
    """
    out = np.zeros((12, *rp.grid_shape(macro)), np.float32)
    jobs = [(m, t) for m in range(1, 13) for t in rp.tiles_for(macro)]

    def fetch(job):
        month, (x, y) = job
        params = urllib.parse.urlencode(
            [("srs", "EPSG:4326"), ("basisOfRecord", "HUMAN_OBSERVATION"), ("occurrenceStatus", "PRESENT"),
             ("mode", "GEO_CENTROID"), ("year", years), ("month", month)] + [("taxonKey", k) for k in keys])
        return rp._get(rp.GBIF_TILE.format(z=rp.ZOOM, x=x, y=y) + "?" + params)

    with ThreadPoolExecutor(max_workers=workers) as ex:
        for (month, (x, y)), body in zip(jobs, ex.map(fetch, jobs)):
            if body:
                rp.bin_tile(out[month - 1], macro, body, x, y)
    return out


def cached_grids(cache, code, name, keys, years):
    """month_grids() through a cache keyed by the taxon keys: changed keys are fetched again."""
    path = cache / code / f"{name}_{years.replace(',', '-')}.npz"
    if path.exists():
        with np.load(path) as z:
            if json.loads(str(z["keys"])) == list(keys):
                return z["counts"]
    counts = month_grids(rp.MACROS[code], keys, years)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".part.npz")
    np.savez_compressed(tmp, counts=counts, keys=json.dumps(list(keys)))
    tmp.replace(path)
    return counts


def crawl(cache):
    """Every species' and the fungi's monthly grids, both macros and periods, into the cache."""
    for code in rp.MACROS:
        todo = {"fungi": [FUNGI], **macro_species(code)}
        for years in PERIODS:
            for name, keys in todo.items():
                counts = cached_grids(cache, code, name, keys, years)
                by_month = counts.sum(axis=(1, 2)).astype(int)
                print(f"[{code} {years}] {name:22s} {int(by_month.sum()):9d} records  "
                      f"by month {by_month.tolist()}", flush=True)


def load_counts(cache, code, name, periods):
    """The cached month grids of one taxon, summed over `periods`."""
    keys = [FUNGI] if name == "fungi" else macro_species(code)[name]
    return sum(cached_grids(cache, code, name, keys, years) for years in periods)


# ------------------------------------------------------------------ the curves ------------

LOW, HIGH = 0.6, 1.0  # build_season_curves' multiplier range: the score's tilt across the season
MIN_EFFORT = 1.0  # kernel-weighted fungi records below which a month's rate is unknown
WIDE_KM = 500.0  # the "wide" prior: the species' own curve within this distance
# Climate space: summer (Jun-Aug) and winter (Dec-Feb) mean temperature and the summer share of
# the year's rain, binned; the kernel's widths are CLIMATE_SIGMA bins (x the variant's scale).
CLIMATE_LOW = (-5.0, -35.0, 0.0)
CLIMATE_STEP = (1.0, 1.5, 0.035)
CLIMATE_BINS = (40, 40, 20)
CLIMATE_SIGMA = (1.5, 1.5, 1.5)


def axes(code):
    """Cell-centre latitudes (south to north) and longitudes of a macro grid."""
    macro = rp.MACROS[code]
    lats = rp.lat_centers(macro)
    lons = macro["lon"][0] + (np.arange(rp.grid_shape(macro)[1]) + 0.5) * rp.STEP
    return lats, lons


def smooth12(counts, lats, km):
    """Kernel-weighted record counts (a Gaussian of `km`, weight 1 at the centre) per month."""
    return np.stack([rp.smooth_counts(c, lats, km) for c in counts])


def month_shares(s, b):
    """Effort-corrected activity, the species' records per fungi record, as shares of the
    year: (12, ...) -> (12, ...); NaN where nobody looked. The effort's floor divides rather
    than cuts: zeroing months below it switched sparse places' winters on and off cell by cell."""
    with np.errstate(divide="ignore", invalid="ignore"):
        rate = s / np.maximum(b, MIN_EFFORT)
        total = rate.sum(axis=0)
        return np.where(total > 0, rate / np.where(total > 0, total, 1.0), np.nan)


def shrink(f, n, prior, k):
    """Month shares from n records here, pulled toward `prior` as if it brought k records."""
    w = n / (n + k)
    return np.where(np.isfinite(f), w * np.nan_to_num(f) + (1 - w) * prior, prior)


def to_ratio(f):
    """Shares -> each month against the peak month (1.0), the form the season gate reads."""
    peak = np.nanmax(f, axis=0)
    with np.errstate(divide="ignore", invalid="ignore"):
        return np.where(peak > 0, f / np.where(peak > 0, peak, 1.0), np.nan)


def climate_coords(code):
    """(3, rows, cols) every cell's place in climate space, in bins (fractional; NaN off the
    normals): its summer and winter mean temperature and the summer share of its rain, bilinear
    from the ERA5 normals, so neighbouring cells move through climate space without steps."""
    import era5_normals
    from scipy.ndimage import map_coordinates
    grid = era5_normals.load("NE" if code == "EU" else "USE")
    glat, glon = grid["lat"].astype(float), grid["lon"].astype(float)
    lats, lons = axes(code)
    la, lo = np.meshgrid(lats, lons, indexing="ij")
    fi, fj = (glat[0] - la) / (glat[0] - glat[1]), (lo - glon[0]) / (glon[1] - glon[0])
    inside = (fi >= -0.5) & (fi <= len(glat) - 0.5) & (fj >= -0.5) & (fj <= len(glon) - 0.5)

    def at(field):
        field = field.astype(float)
        lin = map_coordinates(field, [fi, fj], order=1, mode="nearest")
        return np.where(np.isfinite(lin), lin, map_coordinates(field, [fi, fj], order=0, mode="nearest"))

    t = np.stack([at(grid["tmean"][m]) for m in range(12)])
    rain = np.stack([at(grid["rain"][m]) for m in range(12)])
    with np.errstate(invalid="ignore", divide="ignore"):
        features = (t[5:8].mean(axis=0), t[[11, 0, 1]].mean(axis=0), rain[5:8].sum(axis=0) / rain.sum(axis=0))
    coords = np.stack([(x - low) / step for x, low, step in zip(features, CLIMATE_LOW, CLIMATE_STEP)])
    return np.where(inside, coords, np.nan)


def climate_counts(counts, coords, scale):
    """(12, n_bins) records pooled by climate bin, kernel-weighted across bins (weight 1 at the bin)."""
    from scipy.ndimage import gaussian_filter
    ok = np.isfinite(coords).all(axis=0)
    flat = np.zeros(ok.sum(), int)
    for x, n in zip(coords, CLIMATE_BINS):
        flat = flat * n + np.clip(np.floor(x[ok]), 0, n - 1).astype(int)
    size = int(np.prod(CLIMATE_BINS))
    sigma = tuple(s * scale for s in CLIMATE_SIGMA)
    mass = (2 * np.pi) ** 1.5 * np.prod(sigma)
    out = np.empty((12, size))
    for m in range(12):
        raw = np.bincount(flat, weights=counts[m][ok], minlength=size).reshape(CLIMATE_BINS)
        out[m] = (gaussian_filter(raw, sigma, mode="constant") * mass).ravel()
    return out


def climate_lookup(f_bins, coords, fallback):
    """(12, rows, cols) the climate layer at every cell, trilinear between bin centres."""
    from scipy.ndimage import map_coordinates
    ok = np.isfinite(coords).all(axis=0)
    at = [np.clip(np.nan_to_num(x) - 0.5, 0, n - 1) for x, n in zip(coords, CLIMATE_BINS)]
    out = np.stack([map_coordinates(f_bins[m].reshape(CLIMATE_BINS), at, order=1, mode="nearest")
                    for m in range(12)])
    return np.where(ok, out, fallback)


JOINT_BAND = 2.0  # °C of summer temperature between the joint kernel's bands, and its width


def joint_counts(counts, lats, km, coords):
    """(12, rows, cols) records near each cell, weighted by distance and by how close their
    summer temperature is to the cell's (a Gaussian of JOINT_BAND °C): in the mountains the
    slopes count the slopes and the valleys the valleys, which a distance alone mixes."""
    t = CLIMATE_LOW[0] + coords[0] * CLIMATE_STEP[0]
    centres = np.arange(np.floor(np.nanmin(t)), np.nanmax(t) + JOINT_BAND, JOINT_BAND)
    band = np.where(np.isfinite(t), np.rint((np.nan_to_num(t) - centres[0]) / JOINT_BAND), -1).astype(int)
    out = np.zeros(counts.shape)
    for b, centre in enumerate(centres):
        mask = band == b
        if not mask.any():
            continue
        weight = np.nan_to_num(np.exp(-0.5 * ((t - centre) / JOINT_BAND) ** 2))
        out += weight[None] * smooth12(counts * mask[None], lats, km)
    return out


def season_ratio(S, F, lats, variant, coords, caches):
    """(12, rows, cols) season ratio of one species under `variant`: (prior, km, k, scale), the
    prior "wide" (its own curve within WIDE_KM), "climate" (its climate analogues), "climate
    only" (no local layer) or "joint" (the local layer weighs records by distance and summer
    temperature, over the climate analogues). `caches` holds the smoothed grids by kernel:
    {"fungi": {}, "own": {}}."""
    prior, km, k, scale = variant
    fungi, own = caches["fungi"], caches["own"]

    def geo(counts_cache, counts, width):
        key = ("joint" if prior == "joint" and width != WIDE_KM else "geo", width)
        if key not in counts_cache:
            counts_cache[key] = (joint_counts(counts, lats, width, coords) if key[0] == "joint"
                                 else smooth12(counts, lats, width))
        return counts_cache[key]

    def clim(counts_cache, counts):
        if ("clim", scale) not in counts_cache:
            counts_cache["clim", scale] = climate_counts(counts, coords, scale)
        return counts_cache["clim", scale]

    f_macro = month_shares(S.sum(axis=(1, 2)), F.sum(axis=(1, 2)))[:, None, None]
    if prior == "wide":
        s_wide = geo(own, S, WIDE_KM)
        f_prior = shrink(month_shares(s_wide, geo(fungi, F, WIDE_KM)), s_wide.sum(axis=0), f_macro, k)
    else:
        s_c, b_c = clim(own, S), clim(fungi, F)
        f_bins = shrink(month_shares(s_c, b_c), s_c.sum(axis=0), f_macro[:, :, 0], k)
        f_prior = climate_lookup(f_bins, coords, f_macro)
    if prior == "climate only":
        return to_ratio(f_prior)
    s_here = geo(own, S, km)
    return to_ratio(shrink(month_shares(s_here, geo(fungi, F, km)), s_here.sum(axis=0), f_prior, k))


def season_factor(ratio):
    """The app's season factor from a ratio: the multiplier's tilt times the gate."""
    import seasonality as sn
    ratio = np.nan_to_num(np.asarray(ratio, float))
    return (LOW + (HIGH - LOW) * ratio) * np.clip((ratio - sn.GATE_OFF) / (sn.GATE_FULL - sn.GATE_OFF), 0.0, 1.0)


def label(variant):
    prior, km, k, scale = variant
    where = "" if km is None else f"{km:g} km, "
    clim = "" if scale is None else f", climate kernel x{scale:g}"
    return f"{prior}: {where}k {k:g}{clim}"


# ------------------------------------------------------------------ the test --------------

BLOCK_DEG = 1.0  # the bootstrap resamples 1° blocks: neighbouring cells share observers and weather
N_BOOT = 2000
MIN_TEST = 150  # held-out records of a species-region, both periods together, before it can ship
DEAD = 0.3  # a season factor below this reads as out of season on the map
EPS = 0.01  # floor of the season factor in the test: a closed month is unlikely, not impossible
VARIANTS = ([("wide", km, k, None) for km in (50.0, 100.0) for k in (10.0, 30.0)]
            + [("climate", km, k, s) for km in (50.0, 100.0) for k in (10.0, 30.0) for s in (1.0, 2.0)]
            + [("climate only", None, k, s) for k in (10.0, 30.0) for s in (1.0, 2.0)]
            + [("joint", km, k, 1.0) for km in (50.0, 100.0) for k in (10.0, 30.0)]
            + [(prior, 50.0, 100.0, 1.0) for prior in ("climate", "joint")])


def cell_regions(code):
    """(rows, cols) forecast region of every cell, as species_registry.infer_region assigns it."""
    from species_registry import get_region_boundaries
    b = get_region_boundaries()
    lats, lons = axes(code)
    la, lo = np.meshgrid(lats, lons, indexing="ij")
    if code == "US":
        return np.where(lo < b["uswMaxLongitude"], "USW", "USE")
    return np.where(la < b["seMaxLatitude"], "SE", "NE")


def cell_zones(code):
    """(rows, cols) climate zone of every cell: its nearest scored coordinate's, within 0.2°."""
    import build_season_curves as bsc
    from scipy.spatial import cKDTree
    slat, slon, szone = bsc.load_static_coords(bsc.MACROS[code]["static_env"])
    lats, lons = axes(code)
    la, lo = np.meshgrid(lats, lons, indexing="ij")
    dist, near = cKDTree(np.column_stack([slat, slon])).query(np.column_stack([la.ravel(), lo.ravel()]))
    return np.where(dist <= 0.2, szone[near], "").reshape(la.shape)


_PRODUCTION = {}


def todays_factor(region, species, lats, lons, zones):
    """(12, n) production's season factor at n cell centres, mid-month: the zone curve, else
    the region curve, else the hand-set months, from the files production reads now."""
    import pandas as pd
    import forecast_pipeline as fp
    import seasonality as sn
    from qa_spatial_weights import region_config
    if region not in _PRODUCTION:
        _PRODUCTION[region] = fp._load_species_and_curves(region_config(region))
    params, zone_curves = _PRODUCTION[region]
    n = len(lats)
    df = pd.DataFrame({"Latitude": np.tile(lats, 12), "Longitude": np.tile(lons, 12),
                       "climate_zone": np.tile(zones, 12),
                       "Date": pd.to_datetime(np.repeat([f"2026-{m:02d}-15" for m in range(1, 13)], n))})
    p = {key: value for key, value in params[species].items() if key != "local_season"}
    factor = (sn.season_multiplier_for_species(df, species, p, zone_curves)
              * sn.season_gate_for_species(df, species, p, zone_curves))
    return np.asarray(factor, float).reshape(12, n)


MIN_TOTAL = 200  # build_season_curves --min-total: records a zone or region needs for its own curve


def regional_factor(code, name, S, F, regions, zones, here):
    """(12, n) today's method refitted on S and F, at the cells `here`: the zone curve where the
    species has MIN_TOTAL records in the cell's climate zone, else its region's (the region's
    scored coordinates' box, as build_season_curves samples it), else the hand-set months. The
    fair comparison: today's published curves were built on 2020-2026, one of the test periods."""
    import build_season_curves as bsc
    if code not in _BOXES:
        _BOXES[code] = bsc.sampling_boxes()
    boxes = _BOXES[code]
    lats, lons = axes(code)
    la, lo = np.meshgrid(lats, lons, indexing="ij")
    curve = {}
    for zone in set(zones[here]) - {""}:
        mask = zones == zone
        if S[:, mask].sum() >= MIN_TOTAL:
            curve["zone", zone] = to_ratio(month_shares(S[:, mask].sum(axis=1), F[:, mask].sum(axis=1)))
    for region in set(regions[here]):
        b = boxes[region]
        mask = (la >= b["lat"][0]) & (la <= b["lat"][1]) & (lo >= b["lon"][0]) & (lo <= b["lon"][1])
        if S[:, mask].sum() >= MIN_TOTAL:
            curve["region", region] = to_ratio(month_shares(S[:, mask].sum(axis=1), F[:, mask].sum(axis=1)))
    out = np.empty((12, int(here.sum())))
    for c, (zone, region) in enumerate(zip(zones[here], regions[here])):
        ratio = curve.get(("zone", zone), curve.get(("region", region)))
        out[:, c] = season_factor(ratio) if ratio is not None else months_factor(region, name)
    return out


_BOXES = {}


def months_factor(region, name):
    """(12,) the hand-set months' season factor of a species in a region, mid-month."""
    import pandas as pd
    import seasonality as sn
    from species_registry import get_species_params
    key = (region, name)
    if key not in _MONTHS:
        p = {k: v for k, v in get_species_params(region)[name].items() if k in ("season_months", "season_factor")}
        df = pd.DataFrame({"Date": pd.to_datetime([f"2026-{m:02d}-15" for m in range(1, 13)]), "climate_zone": "",
                           "Latitude": 0.0, "Longitude": 0.0})
        _MONTHS[key] = np.asarray(sn.season_multiplier_for_species(df, name, p, {})
                                  * sn.season_gate_for_species(df, name, p, {}), float)
    return _MONTHS[key]


_MONTHS = {}


def log_p(factor, effort):
    """log P(a record falls in each month) at each cell: season factor x that month's looking."""
    w = np.maximum(factor, EPS) * effort
    with np.errstate(divide="ignore", invalid="ignore"):
        return np.log(w / w.sum(axis=0, keepdims=True))


def block_ci(diff, n, blocks, seed=0):
    """Mean gain per record and its 95% interval, resampling 1° blocks."""
    ids, inv = np.unique(blocks, return_inverse=True)
    d, m = np.bincount(inv, diff), np.bincount(inv, n)
    rng = np.random.default_rng(seed)
    draws = rng.integers(0, len(ids), (N_BOOT, len(ids)))
    boot = d[draws].sum(axis=1) / np.maximum(m[draws].sum(axis=1), 1)
    return d.sum() / max(m.sum(), 1), np.percentile(boot, 2.5), np.percentile(boot, 97.5)


TEST_DEG = 0.5  # held-out records and effort are scored per 0.5° block: GBIF clusters a species'
# records and the kingdom's apart, so at 0.1° half of a species' cell-months had no fungi record


def to_blocks(values, block, weights=None):
    """(12, n_cells) -> (12, n_blocks): sums per block, or the weights' weighted mean."""
    size = block.max() + 1
    if weights is None:
        return np.stack([np.bincount(block, v, size) for v in values])
    mass = np.bincount(block, weights, size)
    with np.errstate(invalid="ignore", divide="ignore"):
        return np.stack([np.bincount(block, v * weights, size) / mass for v in values])


def test(cache, code, variants, species=None):
    """Each species' curves fitted on one period, scored on the other's records against today's
    season factor, per TEST_DEG block. One row per species, region, variant and held-out period."""
    lats, lons = axes(code)
    regions, zones, coords = cell_regions(code), cell_zones(code), climate_coords(code)
    la, lo = np.meshgrid(lats, lons, indexing="ij")
    per = int(round(TEST_DEG / rp.STEP))
    rows_b = np.arange(len(lats))[:, None] // per
    cols_b = np.arange(len(lons))[None, :] // per
    block_of = rows_b * (len(lons) // per + 1) + cols_b
    fungi = {p: load_counts(cache, code, "fungi", [p]) for p in PERIODS}
    fungi_caches = {p: {} for p in PERIODS}
    out = []
    for name in sorted(species or macro_species(code)):
        for train, held in ((PERIODS[0], PERIODS[1]), (PERIODS[1], PERIODS[0])):
            s_train, s_test = load_counts(cache, code, name, [train]), load_counts(cache, code, name, [held])
            cells = s_test.sum(axis=0) > 0
            caches = {"fungi": fungi_caches[train], "own": {}}
            tested = {}
            for region in sorted(set(regions[cells])):
                if name not in get_region_species(region):
                    continue
                here = cells & (regions == region)
                ids, block = np.unique(block_of[here], return_inverse=True)
                n_cells = s_test[:, here]
                weight = n_cells.sum(axis=0)
                n = to_blocks(n_cells, block)
                # The species' records are fungi records too, whatever cluster GBIF put them in.
                effort = np.maximum(to_blocks(fungi[held][:, here], block), n)
                # Each block's cell with the most held-out records names its 1° bootstrap block and zone.
                order = np.lexsort((-weight, block))
                heaviest = order[np.r_[0, np.flatnonzero(np.diff(block[order])) + 1]]
                today = to_blocks(todays_factor(region, name, la[here], lo[here], zones[here]), block, weight)
                refit = to_blocks(regional_factor(code, name, s_train, fungi[train], regions, zones, here), block, weight)
                tested[region] = dict(here=here, block=block, weight=weight, n=n, effort=effort, today=today, refit=refit,
                                      bootstrap=(np.floor(la[here][heaviest] / BLOCK_DEG) * 1000
                                                 + np.floor(lo[here][heaviest] / BLOCK_DEG)).astype(int),
                                      zones=zones[here][heaviest])
            for variant in variants:
                ratio = season_ratio(s_train, fungi[train], lats, variant, coords, caches)
                for region, t in tested.items():
                    local = to_blocks(season_factor(ratio[:, t["here"]]), t["block"], t["weight"])
                    n, effort = t["n"], t["effort"]
                    lp = log_p(local, effort)
                    out.append(dict(
                        species=name, continent=code, region=region, variant=label(variant), held=held,
                        records=int(n.sum()), cells=n.shape[1],
                        # against today's method refitted on the same years: what decides
                        gain=np.where(n > 0, n * (lp - log_p(t["refit"], effort)), 0.0).sum(axis=0),
                        # against the curves production reads now (built on 2020-2026)
                        gain_today=np.where(n > 0, n * (lp - log_p(t["today"], effort)), 0.0).sum(axis=0),
                        n=n.sum(axis=0), blocks=t["bootstrap"], zones=t["zones"],
                        dead_today=float((n * (t["today"] < DEAD)).sum() / n.sum()),
                        dead_local=float((n * (local < DEAD)).sum() / n.sum())))
            print(f"  tested {code} {name} (held out {held})", flush=True)
    return out


MIN_ZONE = 300  # held-out records of a climate zone before it counts in the zone-balanced mean


def by_zone(rows):
    """Held-out gain per record by variant and climate zone (all species, regions, periods)."""
    import pandas as pd
    parts = []
    for r in rows:
        z = pd.DataFrame({"zone": r["zones"], "gain": r["gain"], "records": r["n"]})
        z = z.groupby("zone", as_index=False)[["gain", "records"]].sum()
        parts.append(z.assign(variant=r["variant"], continent=r["continent"]))
    t = pd.concat(parts).groupby(["variant", "continent", "zone"], as_index=False)[["gain", "records"]].sum()
    t["per_record"] = t.gain / t.records
    return t


def choose(rows):
    """The variant with the best zone-balanced held-out gain: the mean over climate zones (with at
    least MIN_ZONE records) of the gain per record, so the curves must hold in the Mediterranean
    and the boreal north alike, not only where most records are. Returns it and the table."""
    import pandas as pd
    t = pd.DataFrame([{"variant": r["variant"], "species": r["species"], "region": r["region"],
                       "records": r["records"], "gain": r["gain"].sum()} for r in rows])
    g = t.groupby("variant").agg(gain=("gain", "sum"), records=("records", "sum"))
    g["per_record"] = g.gain / g.records
    each = t.groupby(["variant", "species", "region"])[["gain", "records"]].sum()
    g["species_mean"] = (each.gain / each.records).groupby("variant").mean()
    z = by_zone(rows)
    g["zone_mean"] = z[z.records >= MIN_ZONE].groupby("variant").per_record.mean()
    g["worst_zone"] = z[z.records >= MIN_ZONE].groupby("variant").per_record.min()
    return g.zone_mean.idxmax(), g.sort_values("zone_mean", ascending=False).reset_index()


MIN_BLOCKS = 5  # 1° blocks of held-out records before a region can veto a species (one block cannot)


def verdicts(rows, variant):
    """Per species and continent, for the chosen variant, and whether it ships on the whole
    continent (one season, so no seam at a region border). Two fair comparisons, 95% intervals
    over 1° blocks:
      - the method: against today's method refitted on the same years, both periods pooled;
      - the map: against the curves the map reads now, on the records neither was built from
        (they were built on 2020-2026, so the 2010-2019 records, the local curves fitted on
        2020-2026 too).
    It ships when it is better beyond doubt in at least one and worse beyond doubt in neither,
    no region over at least MIN_BLOCKS blocks is worse beyond doubt against the method, and at
    least MIN_TEST records were held out."""

    def pooled(sub, key="gain"):
        return block_ci(np.concatenate([r[key] for r in sub]), np.concatenate([r["n"] for r in sub]),
                        np.concatenate([r["blocks"] for r in sub]))

    out = []
    picked = [r for r in rows if r["variant"] == variant]
    for key in sorted({(r["species"], r["continent"]) for r in picked}):
        mine = [r for r in picked if (r["species"], r["continent"]) == key]
        per, today = {}, {}
        for held in sorted({r["held"] for r in mine}):
            sub = [r for r in mine if r["held"] == held]
            records = max(sum(r["n"].sum() for r in sub), 1)
            per[held] = sum(r["gain"].sum() for r in sub) / records
            today[held] = sum(r["gain_today"].sum() for r in sub) / records
        gain, lo, hi = pooled(mine)
        unseen = [r for r in mine if r["held"] == PERIODS[0]]
        pub, pub_lo, pub_hi = pooled(unseen, "gain_today") if unseen else (np.nan, np.nan, np.nan)
        regions = {}
        for region in sorted({r["region"] for r in mine}):
            sub = [r for r in mine if r["region"] == region]
            regions[region] = (*pooled(sub), sum(r["records"] for r in sub),
                               len(np.unique(np.concatenate([r["blocks"] for r in sub]))))
        records = sum(r["records"] for r in mine)
        weights = np.array([r["records"] for r in mine], float)
        worse = [region for region, (_, _, rhi, _, nb) in regions.items() if rhi < 0 and nb >= MIN_BLOCKS]
        better, harmed = (lo > 0 or pub_lo > 0), (hi < 0 or pub_hi < 0)
        ships = bool(records >= MIN_TEST and better and not harmed and not worse)
        out.append(dict(species=key[0], continent=key[1], records=records,
                        **{f"vs refit {p}": round(v, 4) for p, v in per.items()},
                        vs_refit=round(gain, 4), refit_ci=f"[{lo:+.4f}, {hi:+.4f}]",
                        **{f"vs map {p}": round(v, 4) for p, v in today.items()},
                        map_unseen_ci=f"[{pub_lo:+.4f}, {pub_hi:+.4f}]",
                        regions="; ".join(f"{region} {g:+.3f} [{rlo:+.3f}, {rhi:+.3f}] n={n} blocks={nb}"
                                          for region, (g, rlo, rhi, n, nb) in regions.items()),
                        dead_today=round(float(np.average([r["dead_today"] for r in mine], weights=weights)), 3),
                        dead_local=round(float(np.average([r["dead_local"] for r in mine], weights=weights)), 3),
                        ships=ships))
    return out


# A seam is a step between neighbours with the same climate: within 0.5 °C in summer and in
# winter and 0.02 in the summer share of rain (in climate bins). Steps between a valley and a
# slope 20 km apart follow the ground and are not counted.
SAME_CLIMATE = (0.5, 0.5 / 1.5, 0.02 / 0.035)
# The 99.9th percentile of the season factor's steps between same-climate neighbours (0.2°)
# may not exceed today's, the zone and region borders; where today's curve is flat everywhere
# (no curve, the hand-set months) it may not exceed SEAM_FLOOR.
SEAM_FLOOR = 0.35


def steps(factor, valid, coords=None):
    """Absolute changes of a (12, rows, cols) factor between neighbouring valid cells, all months;
    with `coords` (3, rows, cols) only between neighbours of the same climate."""
    out = []
    for axis in (1, 2):
        a, b = [np.take(factor, range(n0, factor.shape[axis] - 1 + n0), axis=axis) for n0 in (0, 1)]
        va, vb = [np.take(valid, range(n0, valid.shape[axis - 1] - 1 + n0), axis=axis - 1) for n0 in (0, 1)]
        pair = va & vb
        if coords is not None:
            ca, cb = [np.take(coords, range(n0, coords.shape[axis] - 1 + n0), axis=axis) for n0 in (0, 1)]
            pair &= (np.abs(ca - cb) < np.array(SAME_CLIMATE)[:, None, None]).all(axis=0)
        out.append(np.abs(a - b)[:, pair].ravel())
    return np.concatenate(out)


def seams(cache, code, variant, species, step=2):
    """Per species: the season factor's steps between neighbouring 0.2° cells with scored places,
    all months, 99.9th percentile, for the local curves and today's (its zone and region borders;
    production's score blend at region splits is not in it): between all neighbours, and between
    neighbours of the same climate, which decides."""
    import build_season_curves as bsc
    lat, lon, q = export(cache, code, variant, species, step)
    coords = climate_coords(code)[:, ::-1][:, step // 2::step, step // 2::step]
    slat, slon, _ = bsc.load_static_coords(bsc.MACROS[code]["static_env"])
    scored = np.zeros((len(lat), len(lon)), bool)
    i = np.rint((lat[0] - slat) / (lat[0] - lat[1])).astype(int)
    j = np.rint((slon - lon[0]) / (lon[1] - lon[0])).astype(int)
    keep = (i >= 0) & (i < len(lat)) & (j >= 0) & (j < len(lon))
    scored[i[keep], j[keep]] = True
    scored &= np.isfinite(coords).all(axis=0)
    la, lo = np.meshgrid(lat, lon, indexing="ij")
    full_regions, full_zones = cell_regions(code), cell_zones(code)
    lats, lons = axes(code)
    ri = np.clip(np.rint((la - lats[0]) / rp.STEP).astype(int), 0, len(lats) - 1)
    rj = np.clip(np.rint((lo - lons[0]) / rp.STEP).astype(int), 0, len(lons) - 1)
    regions, zones = full_regions[ri, rj], full_zones[ri, rj]
    rows = []
    for k, name in enumerate(species):
        local = season_factor(np.where(q[k] == 255, np.nan, q[k] / 254.0))
        available = scored & np.isin(regions, [r for r in rp.MACROS[code]["regions"] if name in get_region_species(r)])
        today = np.full((12, *scored.shape), np.nan)
        for region in rp.MACROS[code]["regions"]:
            here = available & (regions == region)
            if here.any():
                today[:, here] = todays_factor(region, name, la[here], lo[here], zones[here])
        valid = available & np.isfinite(local).all(axis=0)
        p = {key: float(np.percentile(steps(field, valid, c), 99.9))
             for key, field, c in (("local_all", local, None), ("today_all", today, None),
                                   ("local_same", local, coords), ("today_same", today, coords))}
        rows.append(dict(species=name, continent=code, **{f"{key}_p999": round(v, 3) for key, v in p.items()},
                         smooth=bool(p["local_same"] <= max(p["today_same"], SEAM_FLOOR))))
    return rows


# ------------------------------------------------------------------ the runs --------------

R2_FOLDER = "models/local_season"


def parse_variant(text):
    """label() back to a variant tuple."""
    for variant in VARIANTS:
        if label(variant) == text:
            return variant
    raise ValueError(f"unknown variant {text!r}")


def run_test(cache, macros, species=None):
    """The held-out test of each macro region, its rows kept in the cache for run_decide()."""
    import pickle
    for code in macros:
        rows = test(cache, code, VARIANTS, species)
        path = cache / f"test_rows_{code}.pkl"
        if species and path.exists():   # a rerun of some species replaces only their rows
            rows = [r for r in pickle.loads(path.read_bytes()) if r["species"] not in species] + rows
        path.write_bytes(pickle.dumps(rows))
        print(f"[{code}] {len(rows)} test rows kept", flush=True)


def run_decide(cache, out):
    """From every macro's kept test rows: the variant table, the zone table and the per species
    and continent verdicts with the seam check, printed and saved to `out`."""
    import pickle
    import pandas as pd
    rows = [r for path in sorted(cache.glob("test_rows_*.pkl")) for r in pickle.loads(path.read_bytes())]
    best, table = choose(rows)
    print("\nHeld-out log-likelihood gain per record against today's season factor, every species:\n")
    print(table.round(4).to_string(index=False))
    print(f"\nChosen: {best}\n")
    zones = by_zone(rows)
    print("Gain per record by climate zone, chosen variant (records):\n")
    print(zones[zones.variant == best].sort_values(["continent", "zone"]).round(4).to_string(index=False))
    zones.to_csv(out / "local_season_zones.csv", index=False)
    v = pd.DataFrame(verdicts(rows, best))
    variant = parse_variant(best)
    tested = sorted({r["continent"] for r in rows})
    smooth = pd.DataFrame([r for code in tested for r in seams(cache, code, variant, sorted(macro_species(code)))])
    v = v.merge(smooth, on=["species", "continent"], how="left")
    v["ships"] = v.ships & v.smooth.fillna(False).astype(bool)
    print(v.drop(columns=["regions"]).to_string(index=False))
    for _, r in v.iterrows():
        print(f"  {r.species:22s} {r.continent}: {r.regions}")
    out.mkdir(parents=True, exist_ok=True)
    table.to_csv(out / "local_season_variants.csv", index=False)
    v.assign(variant=best).to_csv(out / "local_season_test.csv", index=False)
    pd.DataFrame([dict(variant=r["variant"], species=r["species"], region=r["region"], held=r["held"],
                       records=r["records"], gain=r["gain"].sum() / max(r["n"].sum(), 1),
                       gain_today=r["gain_today"].sum() / max(r["n"].sum(), 1),
                       dead_today=r["dead_today"], dead_local=r["dead_local"]) for r in rows]
                 ).to_csv(out / "local_season_all.csv", index=False)


def place_table(cache, code, name, lat, lon, variant):
    """One place's season by month (both periods) against today's season factor there."""
    import pandas as pd
    lats, lons = axes(code)
    i, j = int(np.argmin(np.abs(lats - lat))), int(np.argmin(np.abs(lons - lon)))
    ratio = season_ratio(load_counts(cache, code, name, PERIODS), load_counts(cache, code, "fungi", PERIODS),
                         lats, variant, climate_coords(code), {"fungi": {}, "own": {}})[:, i, j]
    region = str(cell_regions(code)[i, j])
    today = todays_factor(region, name, np.array([lats[i]]), np.array([lons[j]]), cell_zones(code)[i:i + 1, j])[:, 0]
    return pd.DataFrame({"month": range(1, 13), "local ratio": ratio.round(2),
                         "local factor": season_factor(ratio).round(2), "today's factor": today.round(2)})


def export(cache, code, variant, species, step=2):
    """(lat, lon, ratio) for production: the season ratio from both periods, every `step`-th
    0.1° cell, rows north to south, uint8 x 254 (255 only where a cell has no curve). Far from
    any record of the species the climate analogues carry the curve; a cut there would draw a
    seam, and where the species does not grow its range prior zeroes it anyway."""
    lats, lons = axes(code)
    coords = climate_coords(code)
    fungi = load_counts(cache, code, "fungi", PERIODS)
    fungi_cache, out = {}, []
    for name in species:
        s = load_counts(cache, code, name, PERIODS)
        caches = {"fungi": fungi_cache, "own": {}}
        ratio = season_ratio(s, fungi, lats, variant, coords, caches)
        out.append(ratio[:, ::-1][:, step // 2::step, step // 2::step])
    ratio = np.stack(out)
    q = np.where(np.isfinite(ratio), np.rint(np.clip(ratio, 0.0, 1.0) * 254), 255).astype(np.uint8)
    return lats[::-1][step // 2::step], lons[step // 2::step], q


def run_export(cache, verdict_csv):
    """Upload the shipped species' grids (R2_FOLDER/<date>/local_season_<EU|US>.npz) and write
    backend/generated/local_season.json naming each with its sha256."""
    import hashlib
    import io
    import time
    import pandas as pd
    import forecast_pipeline as fp
    v = pd.read_csv(verdict_csv)
    variant = parse_variant(v.variant.iloc[0])
    shipped = v[v.ships]
    fp.load_dotenv(ROOT / ".env")
    fp.load_dotenv(ROOT / ".env.secret")
    client, bucket = fp._r2_client(), fp.get_required_env("R2_BUCKET_NAME")
    folder = f"{R2_FOLDER}/{time.strftime('%Y%m%d-%H%M')}"
    prior, km, k, scale = variant
    spec = {"variant": label(variant), "kernel_km": km, "prior_records": k, "climate_scale": scale,
            "periods": list(PERIODS),
            "shipped_if": "held-out log-likelihood per record, 95% intervals over 1° blocks: better beyond doubt "
                          "than today's method refitted on the same years (both periods) or than the map's curves "
                          "on the 2010-2019 records (neither built on them), worse beyond doubt in neither, no "
                          f"region over {MIN_BLOCKS}+ blocks worse beyond doubt; at least {MIN_TEST} records; "
                          "the seam check",
            "continents": {}}
    for code, macro in rp.MACROS.items():
        species = sorted(shipped[shipped.continent == code].species)
        regions = {r: [sp for sp in species if sp in get_region_species(r)] for r in macro["regions"]}
        if not species:
            continue
        lat, lon, ratio = export(cache, code, variant, species)
        buffer = io.BytesIO()
        np.savez_compressed(buffer, lat=lat, lon=lon, species=np.array(species), ratio=ratio)
        data = buffer.getvalue()
        key = f"{folder}/local_season_{code}.npz"
        client.put_object(Bucket=bucket, Key=key, Body=data, ContentType="application/octet-stream")
        spec["continents"][code] = {"file": key, "sha256": hashlib.sha256(data).hexdigest(),
                                    "species": species, "regions": regions}
        print(f"uploaded {key}: {len(species)} species, {len(data) / 1e6:.1f} MB", flush=True)
    (ROOT / "backend" / "generated" / "local_season.json").write_text(
        json.dumps(spec, indent=1) + "\n", encoding="utf-8", newline="\n")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cache", type=Path, default=APP / "season_local_cache")
    ap.add_argument("--crawl", action="store_true", help="fetch the GBIF month grids into --cache")
    ap.add_argument("--test", action="store_true", help="the held-out test of --macros; rows kept in --cache")
    ap.add_argument("--macros", nargs="*", default=list(rp.MACROS), help="--test these (EU, US)")
    ap.add_argument("--species", nargs="*", help="--test only these")
    ap.add_argument("--decide", action="store_true", help="variant, verdicts and seams from the kept rows; CSVs")
    ap.add_argument("--show", nargs=4, metavar=("MACRO", "SPECIES", "LAT", "LON"),
                    help="one place's months, with the variant --test chose")
    ap.add_argument("--export", action="store_true", help="upload the shipped grids, write generated/local_season.json")
    args = ap.parse_args()
    import forecast_pipeline as fp
    fp.load_dotenv(ROOT / ".env")
    fp.load_dotenv(ROOT / ".env.secret")
    if args.crawl:
        crawl(args.cache)
    if args.test:
        run_test(args.cache, args.macros, args.species)
    if args.decide:
        run_decide(args.cache, args.cache)
    if args.show:
        import pandas as pd
        variant = parse_variant(pd.read_csv(args.cache / "local_season_test.csv").variant.iloc[0])
        code, name, lat, lon = args.show
        print(place_table(args.cache, code, name, float(lat), float(lon), variant).to_string(index=False))
    if args.export:
        run_export(args.cache, args.cache / "local_season_test.csv")


if __name__ == "__main__":
    main()
