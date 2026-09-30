#!/usr/bin/env python3
"""Reproduce the cherry blossom calibration behind backend/bloom.py's constants.

Everything runs on NASA POWER daily mean temperature (MERRA-2), the source of the
forecast's normals; WeatherAPI, which production runs on, sits within 0.6 °C of
it. Three tests:

1. DC Tidal Basin, NPS peak bloom 1982-2026 (Yoshino). FORCING["yoshino"] is the
   median forcing reached on the peak day; the error is leave-one-year-out.
2. Japan Meteorological Agency Yoshino first bloom 1982-2021, Kyushu to northern
   Honshu. The requirement is fitted on the northern half and tested on the
   southern half, and back: the climate-transfer test that keeps the chill step.
3. iNaturalist Prunus serrulata, February-May 2024-26, in 0.5° cells with at least
   8 records. FORCING["kanzan"] is the median forcing at the cells' median date;
   fitted on one continent, tested on the other.

    python backend/tools/calibrate_bloom.py [--cache DIR] [--grid]

--grid repeats the search over the chill threshold, chill days and forcing base.
The first run downloads about 500 POWER series and 70 iNaturalist pages.
"""
import argparse
import itertools
import json
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import bloom  # noqa: E402

GMU = "https://raw.githubusercontent.com/GMU-CherryBlossomCompetition/peak-bloom-prediction/main/data/{}.csv"
POWER = ("https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M&community=AG"
         "&longitude={lon}&latitude={lat}&start={start}&end={end}&format=JSON")
INAT = "https://api.inaturalist.org/v1/observations?"
JAN1 = 61  # index of 1 January in a season array that starts on 1 November


def fetch(url, path, parse=json.load):
    if not path.exists():
        for attempt in range(4):
            try:
                with urllib.request.urlopen(url, timeout=120) as r:
                    path.write_bytes(r.read())
                break
            except Exception:
                time.sleep(3 * (attempt + 1))
    with open(path, "rb") as f:
        return parse(f)


def power(lat, lon, start, end, cache):
    j = fetch(POWER.format(lat=lat, lon=lon, start=start, end=end), cache / f"power_{lat}_{lon}_{start}.json")
    s = pd.Series(j["properties"]["parameter"]["T2M"], dtype=float)
    s.index = pd.to_datetime(s.index)
    return s.where(s > -900).interpolate(limit=5)


def season(series, year):
    """Daily means from 1 Nov (year - 1) to 30 Jun (year), or None if incomplete. The
    iNaturalist cells' series end on 31 May 2026, so the last season is shorter."""
    a = series[pd.Timestamp(year - 1, 11, 1):pd.Timestamp(year, 6, 30)].to_numpy()
    return a if len(a) >= 200 and np.isfinite(a).all() else None  # to mid-May at least


def curve(a, tc=bloom.CHILL_BELOW, cstar=bloom.CHILL_DAYS, tb=bloom.FORCE_BASE):
    """Cumulative forcing per day; NaN until the chill count is met, so a bloom seen
    before then says nothing about the requirement."""
    started = np.cumsum(a < tc) >= cstar
    heat = np.cumsum(np.where(started, np.maximum(a - tb, 0.0), 0.0))
    return np.where(started, heat, np.nan)


def at(c, doy):
    i = int(doy) + JAN1 - 1
    return c[i] if i < len(c) else np.nan


def predict(c, fstar):
    done = c >= fstar
    return int(np.argmax(done)) - JAN1 + 1 if done.any() else np.nan


def two_fold(curves, obs, fold):
    """Requirement fitted on each side of `fold`, tested on the other side."""
    f = np.array([at(c, d) for c, d in zip(curves, obs)])
    err = np.full(len(obs), np.nan)
    for side in (fold, ~fold):
        fstar = np.nanmedian(f[side])
        err[~side] = [predict(c, fstar) - d for c, d, s in zip(curves, obs, ~side) if s]
    return err, float(np.nanmedian(f))


def datasets(cache):
    dc_obs = fetch(GMU.format("washingtondc"), cache / "washingtondc.csv", pd.read_csv).set_index("year").bloom_doy
    dc_t = power(38.89, -77.04, 19810101, 20260630, cache)
    dc = [(y, season(dc_t, y), dc_obs[y]) for y in range(1982, 2027) if y in dc_obs.index]
    dc = [d for d in dc if d[1] is not None]

    jp = fetch(GMU.format("japan"), cache / "japan.csv", pd.read_csv)
    jp = jp[(jp.lat >= 31) & (jp.lat <= 41.5) & (jp.year >= 1982)]
    locs = jp.groupby("location")[["lat", "long"]].first()
    with ThreadPoolExecutor(4) as ex:
        series = dict(zip(locs.index, ex.map(lambda r: power(r.lat, r.long, 19811101, 20210630, cache),
                                                locs.itertuples())))
    japan = [(r.lat, season(series[r.location], r.year), r.bloom_doy) for r in jp.itertuples()]
    japan = [j for j in japan if j[1] is not None]

    rows = []
    for region, place in (("US", 1), ("EU", 97391)):
        for year in (2024, 2025, 2026):
            page = 1
            while True:
                q = urllib.parse.urlencode({"taxon_id": 125742, "place_id": place, "d1": f"{year}-02-01",
                                            "d2": f"{year}-05-31", "per_page": 200, "page": page,
                                            "order_by": "id", "order": "asc"})
                js = fetch(INAT + q, cache / f"inat_{region}_{year}_{page}.json")
                rows += [(region, year, o["observed_on"], *map(float, o["location"].split(",")))
                         for o in js["results"] if o.get("location") and not o.get("obscured")
                         and (o.get("positional_accuracy") or 0) <= 1000]
                if page * 200 >= min(js["total_results"], 10000):
                    break
                page += 1
    obs = pd.DataFrame(rows, columns=["region", "year", "date", "lat", "lon"])
    obs["date"] = pd.to_datetime(obs.date, errors="coerce")
    obs = obs[obs.date.dt.year == obs.year]
    obs["clat"] = (np.floor(obs.lat / 0.5) * 0.5 + 0.25).round(2)
    obs["clon"] = (np.floor(obs.lon / 0.625) * 0.625 + 0.3125).round(4)
    cells = []
    for (region, year, clat, clon), g in obs.groupby(["region", "year", "clat", "clon"]):
        if len(g) >= 8:
            a = season(power(clat, clon, 20231101, 20260531, cache), year)
            if a is not None:
                cells.append((region, a, g.date.dt.dayofyear.median()))
    return dc, japan, cells


def report(dc, japan, cells, p):
    out = {}
    c = [curve(a, *p) for _, a, _ in dc]
    obs = np.array([d for *_, d in dc], float)
    f = np.array([at(ci, d) for ci, d in zip(c, obs)])
    loyo = np.array([predict(ci, np.nanmedian(np.delete(f, i))) - obs[i] for i, ci in enumerate(c)], float)
    out["dc"] = (np.nanmean(np.abs(loyo)), int(np.isnan(loyo).sum()), float(np.nanmedian(f)))
    lat = np.array([j[0] for j in japan])
    e, fj = two_fold([curve(a, *p) for _, a, _ in japan], np.array([j[2] for j in japan], float),
                     lat >= np.median(lat))
    out["japan"] = (np.nanmean(np.abs(e)), int(np.isnan(e).sum()), fj)
    e, fk = two_fold([curve(a, *p) for _, a, _ in cells], np.array([d for *_, d in cells], float),
                     np.array([r == "US" for r, *_ in cells]))
    out["inat"] = (np.nanmean(np.abs(e)), int(np.isnan(e).sum()), fk)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=Path.home() / ".cache" / "funges-bloom")
    ap.add_argument("--grid", action="store_true")
    args = ap.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    dc, japan, cells = datasets(args.cache)
    print(f"DC {len(dc)} years, Japan {len(japan)} location-years, iNaturalist {len(cells)} cells")
    grid = (itertools.product((13, 15, 17, 19, 21), (90, 105, 120, 135), (-4.0, -3.0, -2.0, -1.0, 0.0))
            if args.grid else [(bloom.CHILL_BELOW, bloom.CHILL_DAYS, bloom.FORCE_BASE)])
    for p in grid:
        o = report(dc, japan, cells, p)
        cost = sum(v[0] + 30 * v[1] / n for v, n in zip(o.values(), (len(dc), len(japan), len(cells))))
        print(f"{p}: total {cost:.2f} | " + " | ".join(
            f"{k} MAE {v[0]:.2f} d, {v[1]} without a peak, requirement {v[2]:.0f}" for k, v in o.items()))


if __name__ == "__main__":
    main()
