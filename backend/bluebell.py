"""Bluebell wood peak-bloom forecast (roadmap #272 step 5).

The native bluebell (Hyacinthoides non-scripta) carpets its woods once spring has
brought enough warmth: from 1 April, each day adds its mean above BASE, and the
peak is the day the sum reaches FORCING. A winter-chill step lost on every test,
so there is none. Where the sum is not reached by 30 June there is no peak.

FORCING targets the median iNaturalist record date; full flower ("at its best") is
about 12 °C·days (1.5 days) earlier. Fitted on NASA POWER temperatures, the source
of the normals: docs/species/2026-10-10-bluebell.md, from
backend/tools/calibrate_bluebell.py.

The cells are clipped to bluebell ground (backend/generated/bluebell_ground_EU.geojson,
from backend/tools/build_spectacle_ground.py): within its native range and on
ground with broadleaf trees.
"""
from __future__ import annotations

from datetime import date

import numpy as np

import bloom

START = 151  # 1 April as an index in a season from 1 November (31 March in a leap season)
BASE = 2.0  # °C, daily mean
FORCING = 169.0  # °C·days above BASE
# A cell is drawn only where a normal (1991-2020) year peaks by this day: that hides
# 1% of the range, all of it above 600 m.
LATEST_NORMAL_PEAK = (5, 31)  # month, day
REGIONS = frozenset({"ne", "se"})


def season(today):
    """First and last day of the season `today` falls in, or None outside 1 Mar - 30 Jun."""
    if not 3 <= today.month <= 6:
        return None
    return date(today.year - 1, 11, 1), date(today.year, 6, 30)


def peak_index(tmean, forcing=FORCING):
    """Index of the peak day in each row of `tmean` (points x days from 1 Nov), NaN if none."""
    heat = np.cumsum(np.maximum(tmean[:, START:] - BASE, 0.0), axis=1)
    done = heat >= forcing
    idx = done.argmax(axis=1).astype(float) + START
    idx[~done.any(axis=1)] = np.nan
    return idx


def build_bluebell(master_path, region_code, r2_prefix, to_pmtiles, upload,
                   *, build_mbtiles=bloom._tippecanoe, today=None, normals=None, ground=None):
    """Build and upload `<region>_bluebell.pmtiles`, on bluebell ground."""
    today = today or date.today()
    if ground is None and season(today) is not None:
        ground = bloom.load_ground("bluebell_ground", region_code)
    return bloom.build_peaks(master_path, region_code, r2_prefix, to_pmtiles, upload, label="Bluebell",
                             tiles="bluebell", season=season, peak_index=peak_index,
                             latest_normal_peak=LATEST_NORMAL_PEAK, ground=ground, build_mbtiles=build_mbtiles,
                             today=today, normals=normals)
