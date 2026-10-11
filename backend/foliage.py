"""Fall foliage: a peak-colour forecast for the US hardwoods and aspens (roadmap #272 step 5).

Leaves turn as the season cools. From 15 August, each day adds how far its mean falls
below BASE, and the peak is the day the sum reaches the requirement. At 33 °C nearly
every day counts, so the sum is a cooling clock rather than a physiological threshold:
about 2.5-3 days later per 1 °C warmer. West of WEST_LON the requirement changes: the
aspens of the Rockies (cells from ASPEN_MIN_ELEV up) turn on a smaller sum than the
eastern hardwoods, the Pacific lowlands' oaks and maples (west of PACIFIC_LON) on a
larger one; the interior lowlands keep the eastern one. A photoperiod term added
nothing.

Weather adds little over geography here: the model beats one fixed date clearly and a
latitude + elevation line only a little, and its year-to-year skill is weak. Fitted on
iNaturalist "colored leaves" records and NASA POWER temperatures, checked on PhenoCam
and USA-NPN: docs/species/2026-10-11-fall-foliage.md, from
backend/tools/calibrate_foliage.py.

Drawn on the deciduous and mixed forest (NLCD 41, 43) pieces the region's species
layers are drawn on, handed over by the MapLayer script, each coloured by the forecast
at its middle.
"""
from __future__ import annotations

import os
from datetime import date

import numpy as np

import bloom

START = 45  # 15 August, as an index in a season from 1 July
BASE = 33.0  # °C, daily mean
REQUIREMENT = 1031.0  # °C·days below BASE: the eastern hardwoods (and the interior west's lowlands)
WEST_LON = -102.0  # west of this, the requirement depends on the cell:
ASPEN_MIN_ELEV = 1500.0  # m: ... from this high, the aspens' ...
ASPEN_REQUIREMENT = 897.0
PACIFIC_LON = -116.0  # ... and lower, west of this, the Pacific lowlands' oaks, maples and cottonwoods'
PACIFIC_REQUIREMENT = 1247.0  # (the eastern one ran 9-10 days early there: 99 cell-years)
LAND = (41, 43)  # NLCD deciduous and mixed forest
SIMPLIFY = 0.01  # degrees: the pieces simplified as the species forecast's are, so they look alike
# A cell is drawn only where a normal year peaks by this day: that hides Florida, the
# Gulf coast, south Texas and the low deserts (4.4% of USE's cells, 1.1% of USW's).
LATEST_NORMAL_PEAK = (11, 30)  # month, day
REGIONS = frozenset({"use", "usw"})


def season(today):
    """1 July - 31 December of `today`'s year, or None outside 1 September - 30 November."""
    if not 9 <= today.month <= 11:
        return None
    return date(today.year, 7, 1), date(today.year, 12, 31)


def requirement_of(lon, elev):
    """Each cell's requirement from its longitude and mean elevation (NaN counts as low)."""
    lon, high = np.asarray(lon, float), np.nan_to_num(np.asarray(elev, float)) >= ASPEN_MIN_ELEV
    return np.where(lon >= WEST_LON, REQUIREMENT,
                    np.where(high, ASPEN_REQUIREMENT, np.where(lon < PACIFIC_LON, PACIFIC_REQUIREMENT, REQUIREMENT)))


def peak_index(tmean, requirement=REQUIREMENT):
    """Index of the peak day in each row of `tmean` (points x days from 1 July), NaN if
    none; `requirement` is one number or one per row."""
    cold = np.cumsum(np.maximum(BASE - tmean[:, START:], 0.0), axis=1)
    done = cold >= np.asarray(requirement, float).reshape(-1, 1)
    idx = done.argmax(axis=1).astype(float) + START
    idx[~done.any(axis=1)] = np.nan
    return idx


def build_foliage(master_path, region_code, r2_prefix, to_pmtiles, upload,
                  *, land=None, build_mbtiles=bloom._tippecanoe_mesh, today=None, normals=None):
    """Build and upload `<region>_foliage.pmtiles` on the woods of `land` (the MapLayer
    script's land-cover pieces, `raster_val` and geometry). Returns a small summary, or
    None out of season or without land."""
    today = today or date.today()
    span = season(today)
    if span is None:
        print(f"Foliage: out of season on {today}, skipped.")
        return None
    if land is None:
        print("Foliage: no land cover handed over, skipped.")
        return None
    first, last = span
    n_days = (last - first).days + 1
    if normals is None:
        normals = bloom.load_normals(region_code)

    local, downloaded = bloom._local_master(master_path)
    try:
        cy, cx, elev, obs = bloom._cells(local, first, n_days)
    finally:
        if downloaded:
            os.unlink(local)
    normal = bloom.daily_normals(normals, cy * bloom.CELL, cx * bloom.CELL, elev, first, n_days)
    tmean = np.where(np.isfinite(obs), obs, normal)
    del obs
    requirement = requirement_of(cx * bloom.CELL, elev)
    grows = peak_index(normal, requirement) <= (date(last.year, *LATEST_NORMAL_PEAK) - first).days
    del normal
    peak = (first - bloom.EPOCH).days + peak_index(tmean, requirement)
    drawn = np.isfinite(peak) & grows
    woods = land[land["raster_val"].isin(LAND)]
    features = []
    if drawn.any():
        features = bloom._sample(cy[drawn], cx[drawn], {"peak": peak[drawn]}, woods, {"peak": bloom.PEAK_STEP})
        # Simplified multi-part pieces often cross themselves; buffer(0) mends them, where
        # dropping them, as the forecast does, lost three in four woods.
        features["geometry"] = features.geometry.simplify(SIMPLIFY, preserve_topology=True).buffer(0)
        features = features[~features.is_empty]
    print(f"Foliage {region_code}: {int(drawn.sum())} of {len(peak)} cells drawn, "
          f"{len(features)} of {len(woods)} wood pieces coloured")
    pieces = bloom.publish(features, region_code, "foliage", r2_prefix, to_pmtiles, upload, build_mbtiles)
    return {"cells": len(peak), "drawn": int(drawn.sum()), "pieces": pieces}
