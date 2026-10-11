"""Fall foliage: a peak-colour forecast for the US and Europe (roadmap #272 step 5).

Leaves turn as the season cools. From 15 August, each day adds how far its mean falls
below BASE, and the peak is the day the sum reaches the requirement. At 33 °C nearly
every day counts, so the sum is a cooling clock rather than a physiological threshold:
about 2.5-3 days later per 1 °C warmer. West of WEST_LON the requirement changes: the
aspens of the Rockies (cells from ASPEN_MIN_ELEV up) turn on a smaller sum than the
eastern hardwoods, the Pacific lowlands' oaks and maples (west of PACIFIC_LON) on a
larger one; the interior lowlands keep the eastern one. A photoperiod term added
nothing.

Europe keeps the clock but not the US requirement: its peak, as people photograph it, is
a later stage, about when half the beech leaves have fallen at the stations, two weeks
after half are coloured. So the temperate forests take EU_REQUIREMENT, and the boreal
north from BOREAL_LAT its smaller one. The larch takes the temperate requirement; it
only needs its own ground.

Weather adds little over geography here: in the US the model beats one fixed date
clearly and a latitude + elevation line only a little, and its year-to-year skill is
weak; in Europe the year-to-year evidence comes from the station networks alone. Fitted on
iNaturalist "colored leaves" records and NASA POWER temperatures, checked on PhenoCam
and USA-NPN (the US) and the DWD and MeteoSwiss phenology networks (Europe):
docs/species/2026-10-11-fall-foliage.md, from backend/tools/calibrate_foliage.py and
calibrate_foliage_eu.py.

Drawn on the deciduous and mixed forest pieces the region's species layers are drawn on
(NLCD 41, 43 in the US; CORINE 311, 313 in Europe, and the larch's 312), handed over by
the MapLayer script, each coloured by the forecast at its middle.
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
# Europe (CORINE): the temperate forests, and the boreal north from BOREAL_LAT.
EU_REQUIREMENT = 1539.0  # stations: beech leaf fall 1,501 (DWD), 1,525 (MeteoSwiss); larch needles 1,482
BOREAL_LAT = 60.0
BOREAL_REQUIREMENT = 869.0  # Fennoscandia's birch, rowan and aspen
EU_LAND = (311, 313)  # CORINE broadleaf and mixed forest
LARCH_LAND = 312  # CORINE coniferous, drawn where it is larch: its middle in a host-cover cell
# where larch is at least a tenth of the trees (backend/generated/larch_mask_EU.npz), or in
# the Alps from LARCH_ALPS_MIN_ELEV up (the host cover gives the Dolomites 2%).
ALPS = (5.0, 43.5, 16.5, 48.2)  # west, south, east, north
LARCH_ALPS_MIN_ELEV = 1300.0  # m, the cell's mean elevation at the piece's middle
REGIONS = frozenset({"use", "usw", "ne", "se"})


def season(today):
    """1 July - 31 December of `today`'s year, or None outside 1 September - 30 November."""
    if not 9 <= today.month <= 11:
        return None
    return date(today.year, 7, 1), date(today.year, 12, 31)


def requirement_of(lon, elev):
    """Each US cell's requirement from its longitude and mean elevation (NaN counts as low)."""
    lon, high = np.asarray(lon, float), np.nan_to_num(np.asarray(elev, float)) >= ASPEN_MIN_ELEV
    return np.where(lon >= WEST_LON, REQUIREMENT,
                    np.where(high, ASPEN_REQUIREMENT, np.where(lon < PACIFIC_LON, PACIFIC_REQUIREMENT, REQUIREMENT)))


def eu_requirement_of(lat):
    """Each European cell's requirement from its latitude."""
    return np.where(np.asarray(lat, float) >= BOREAL_LAT, BOREAL_REQUIREMENT, EU_REQUIREMENT)


def larch_mask():
    """The host-cover cells where larch is at least a tenth of the trees: (lat0, lon0, step, mask)."""
    m = np.load(bloom._BACKEND / "generated" / "larch_mask_EU.npz")
    return float(m["lat0"]), float(m["lon0"]), float(m["step"]), m["mask"].astype(bool)


def is_larch(lat, lon, elev):
    """Whether a CORINE 312 piece with its middle here (and its cell this high) is larch."""
    lat, lon = np.asarray(lat, float), np.asarray(lon, float)
    lat0, lon0, step, mask = larch_mask()
    i, j = np.floor((lat - lat0) / step).astype(int), np.floor((lon - lon0) / step).astype(int)
    inside = (i >= 0) & (i < mask.shape[0]) & (j >= 0) & (j < mask.shape[1])
    share = np.zeros(len(lat), bool)
    share[inside] = mask[i[inside], j[inside]]
    alps = (lon >= ALPS[0]) & (lat >= ALPS[1]) & (lon < ALPS[2]) & (lat < ALPS[3])
    return share | (alps & (np.nan_to_num(np.asarray(elev, float)) >= LARCH_ALPS_MIN_ELEV))


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
    europe = bloom.NORMALS_MACRO[region_code] == "EU"
    requirement = eu_requirement_of(cy * bloom.CELL) if europe else requirement_of(cx * bloom.CELL, elev)
    grows = peak_index(normal, requirement) <= (date(last.year, *LATEST_NORMAL_PEAK) - first).days
    del normal
    peak = (first - bloom.EPOCH).days + peak_index(tmean, requirement)
    drawn = np.isfinite(peak) & grows
    classes = (*EU_LAND, LARCH_LAND) if europe else LAND
    woods = land.loc[land["raster_val"].isin(classes), ["raster_val", "geometry"]]
    features = []
    if drawn.any():
        features = bloom._sample(cy[drawn], cx[drawn], {"peak": peak[drawn], "elev": np.nan_to_num(elev[drawn])},
                                 woods, {"peak": bloom.PEAK_STEP})
        if europe:
            middle = features.geometry.representative_point()
            conifer = features["raster_val"].to_numpy() == LARCH_LAND
            larch = is_larch(middle.y.to_numpy(), middle.x.to_numpy(), features["elev"].to_numpy())
            features = features[~conifer | larch]
        features = features.drop(columns=["raster_val", "elev"])
        # Simplified multi-part pieces often cross themselves; buffer(0) mends them, where
        # dropping them, as the forecast does, lost three in four woods.
        features["geometry"] = features.geometry.simplify(SIMPLIFY, preserve_topology=True).buffer(0)
        features = features[~features.is_empty]
    print(f"Foliage {region_code}: {int(drawn.sum())} of {len(peak)} cells drawn, "
          f"{len(features)} of {len(woods)} wood pieces coloured")
    pieces = bloom.publish(features, region_code, "foliage", r2_prefix, to_pmtiles, upload, build_mbtiles)
    return {"cells": len(peak), "drawn": int(drawn.sum()), "pieces": pieces}
