"""Heather in bloom: a peak-bloom forecast for Calluna vulgaris (roadmap #272 step 5).

Heather keeps hardly any thermal clock. Across Europe, from Portugal to Iceland and
from sea level to 2,000 m, it peaks around 19 August, and every degree-day model
tested loses to one fixed date. What the weather adds is the year: a season that runs
ahead of its normal blooms a little earlier. So the peak is the normal-year date,
NORMAL_PEAK, moved by K times the season's lead: how much earlier (or later) this
year's degree-days above BASE since 1 March reach their normal sum at NORMAL_PEAK.

Fitted on iNaturalist records and the German weather service's first-flowering series:
funges-lab/species/2026-10-11-heather.md, from backend/tools/calibrate_heather.py. Drawn on
moors and heaths (backend/generated/heather_moors_EU.parquet, built
offline): CORINE's moors and heathland, and in Britain
and Ireland its blanket bog, inside Calluna's range.
"""
from __future__ import annotations

from datetime import date

import numpy as np

import bloom

START = 59  # 1 March, as an index in a season from 1 January (29 February in a leap year)
BASE = 0.0  # °C, daily mean
NORMAL_PEAK = 230  # 19 August (18 August in a leap year), everywhere in a normal year
K = 0.25  # share of the season's lead the peak follows (fits: iNaturalist 0.26, DWD 0.34)
LATEST_NORMAL_PEAK = (12, 31)  # a normal year always peaks: no heath is hidden
REGIONS = frozenset({"ne", "se"})


def season(today):
    """1 January - 31 October of `today`'s year, or None outside 1 July - 30 September."""
    if not 7 <= today.month <= 9:
        return None
    return date(today.year, 1, 1), date(today.year, 10, 31)


def peak_index(tmean, normal, start=START, base=BASE, d0=NORMAL_PEAK, k=K):
    """Peak day index per row (days from 1 January): d0 moved by k times the day this
    year's degree-days reach the normal year's sum at d0, minus d0."""
    d0 = np.broadcast_to(np.asarray(d0, float), (len(tmean),))
    heat = np.cumsum(np.maximum(tmean[:, start:] - base, 0.0), axis=1)
    need = np.cumsum(np.maximum(normal[:, start:] - base, 0.0), axis=1)
    need = need[np.arange(len(need)), np.clip(np.rint(d0).astype(int) - start, 0, need.shape[1] - 1)]
    done = heat >= need[:, None]
    day = done.argmax(axis=1).astype(float) + start
    day[~done.any(axis=1)] = np.nan
    return d0 + k * (day - d0)


def build_heather(master_path, region_code, r2_prefix, to_pmtiles, upload,
                  *, build_mbtiles=bloom._tippecanoe, today=None, normals=None, ground=None):
    """Build and upload `<region>_heather.pmtiles`, on moors and heaths."""
    today = today or date.today()
    if ground is None and season(today) is not None:
        ground = bloom.load_ground("heather_moors", region_code)
    return bloom.build_peaks(master_path, region_code, r2_prefix, to_pmtiles, upload, label="Heather",
                             tiles="heather", season=season, peak_index=peak_index,
                             latest_normal_peak=LATEST_NORMAL_PEAK, ground=ground, build_mbtiles=build_mbtiles,
                             today=today, normals=normals)
