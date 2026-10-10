"""Desert superbloom forecast (roadmap #272 step 5).

How strong a desert spring bloom is depends on the winter's rain. A season's rain
from 1 October to 31 March, as a share of its 1991-2020 normal, sets the strength:
under 60% none, then ordinary, good from 100%, and a superbloom possible from 150%.
Once that share is known, a germinating autumn storm, frost and early heat add
nothing. The peak is the day the mean temperature's degree-days above FORCE_BASE
reach FORCING, counted from 15 January at the earliest and not before the season's
rain reaches 40% of its normal.

Rain counts only once ERA5 has measured it ("Rain Measured" in the master), up to
RAIN_CAP mm a day. Every other day counts as its normal: the forecast days, days
not measured yet, and WeatherAPI's stored rain, which in the desert reads about
three times POWER's with almost no day-to-day agreement. Measured rain is scaled
to POWER, the source of the normals, and WeatherAPI's temperatures are warmed by
TEMP_OFFSET to match it.

Fitted on iNaturalist records of desert annuals and NASA POWER weather:
docs/species/2026-10-10-desert-superbloom.md, from
backend/tools/calibrate_superbloom.py. The cells are clipped to bloom ground
(backend/generated/superbloom_ground_US.geojson, from
backend/tools/build_spectacle_ground.py): dry, low and open desert where the
annuals are recorded.
"""
from __future__ import annotations

import os
from datetime import date

import numpy as np

import bloom

RAIN_CAP = 150.0  # mm/day; above it a day is a glitch (US masters reach 2415 mm) and counts as missing
MEASURED_SCALE = 0.89  # ERA5 rains 1.124x POWER on bloom ground
TEMP_OFFSET = 1.1  # °C; WeatherAPI's daily mean runs 1.14 °C under POWER's on bloom ground (provisional)
RATIO_END = (3, 31)  # the season's rain is counted from 1 October to here
LEVELS = (0.60, 1.00, 1.50)  # rain / normal at which ordinary, good and superbloom start
FORCE_START = (1, 15)  # degree-days for the peak count from here at the earliest ...
START_SHARE = 0.40  # ... and not before the season's rain reaches this share of its normal
FORCE_BASE = 0.0  # °C, daily mean (Tmax + Tmin) / 2
FORCING = 840.0  # °C·days above FORCE_BASE from the start to the peak
REGIONS = frozenset({"usw"})


def season(today):
    """1 October - 31 May of the season `today` falls in, or None outside 1 Jan - 31 May."""
    if not 1 <= today.month <= 5:
        return None
    return date(today.year - 1, 10, 1), date(today.year, 5, 31)


def rain_ratio(rain, normal, end):
    """Rain up to index `end` as a share of its normal; a NaN day counts as its normal."""
    r, n = rain[:, :end + 1], normal[:, :end + 1]
    with np.errstate(invalid="ignore", divide="ignore"):
        return np.where(np.isfinite(r), r, n).sum(axis=1) / n.sum(axis=1)


def strength(ratio, levels=LEVELS):
    """0 none, 1 ordinary, 2 good, 3 superbloom; an unknown share is none."""
    return np.where(np.isfinite(ratio), np.digitize(ratio, levels), 0)


def forcing_start(rain, normal, first, end, share=START_SHARE):
    """The day the degree-days start: `first`, or later if the rain (normals where
    missing) has not reached `share` of the season's normal by then."""
    filled = np.where(np.isfinite(rain), rain, normal)
    need = share * normal[:, :end + 1].sum(axis=1)
    reached = np.cumsum(filled, axis=1) >= need[:, None]
    when = np.where(reached.any(axis=1), reached.argmax(axis=1), rain.shape[1])
    return np.maximum(when, first)


def peak_index(tmean, start, base=FORCE_BASE, forcing=FORCING):
    """Index of the peak day in each row of `tmean` (points x days from 1 Oct), counting
    from each row's `start`; NaN if none."""
    on = np.arange(tmean.shape[1])[None, :] >= np.asarray(start)[:, None]
    heat = np.cumsum(np.where(on, np.maximum(tmean - base, 0.0), 0.0), axis=1)
    done = heat >= forcing
    idx = done.argmax(axis=1).astype(float)
    idx[~done.any(axis=1)] = np.nan
    return idx


def build_superbloom(master_path, region_code, r2_prefix, to_pmtiles, upload,
                     *, build_mbtiles=bloom._tippecanoe, today=None, normals=None, ground=None):
    """Build and upload `<region>_superbloom.pmtiles`: each cell's `peak` (days since
    1970-01-01) and `level` (0-3), on bloom ground. Returns a small summary, or None
    out of season."""
    today = today or date.today()
    span = season(today)
    if span is None:
        print(f"Superbloom: out of season on {today}, skipped.")
        return None
    first, last = span
    n_days = (last - first).days + 1
    if normals is None:
        normals = bloom.load_normals(region_code)
    if ground is None:
        ground = bloom.load_ground("superbloom_ground", region_code)

    local, downloaded = bloom._local_master(master_path)
    try:
        cy, cx, elev, obs, rain = bloom._cells(local, first, n_days, rain_cap=RAIN_CAP)
    finally:
        if downloaded:
            os.unlink(local)
    lat, lon = cy * bloom.CELL, cx * bloom.CELL
    tmean = np.where(np.isfinite(obs), obs + TEMP_OFFSET, bloom.daily_normals(normals, lat, lon, elev, first, n_days))
    del obs
    normal_rain = bloom.daily_normals(normals, lat, lon, elev, first, n_days, key="prectotcorr")
    rain = rain * MEASURED_SCALE
    end = (date(last.year, *RATIO_END) - first).days
    level = strength(rain_ratio(rain, normal_rain, end))
    earliest = (date(last.year, *FORCE_START) - first).days
    # A cell without a bloom is still dated, by warmth alone: the map draws it as
    # "no bloom" for the season and drops last season's.
    start = np.where(level == 0, earliest, forcing_start(rain, normal_rain, earliest, end))
    peak = (first - bloom.EPOCH).days + peak_index(tmean, start)
    drawn = np.isfinite(peak)
    counts = {name: int(((level == i) & drawn).sum()) for i, name in enumerate(("none", "ordinary", "good", "superbloom"))}
    print(f"Superbloom {region_code}: {int(drawn.sum())} of {len(peak)} cells drawn "
          f"({int((~drawn).sum())} without a peak), by level {counts}")
    features = []
    if drawn.any():
        features = bloom._bands(cy[drawn], cx[drawn], {"peak": peak[drawn], "level": level[drawn]}, ground)
    bands = bloom.publish(features, region_code, "superbloom", r2_prefix, to_pmtiles, upload, build_mbtiles)
    return {"cells": len(peak), "drawn": int(drawn.sum()), "bands": bands, "levels": counts}
