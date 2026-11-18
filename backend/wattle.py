"""Wattle in bloom (Australia and New Zealand) and its northern twin, mimosa (Europe and the
US West): when golden and silver wattle (Acacia pycnantha, A. dealbata) flower en masse.

Like heather, the wattles keep hardly any thermal clock. Golden and silver wattle peak
around 20 August across southern Australia, and silver wattle, the mimosa, around 15
February from Portugal to the Italian lakes and in California. No weather model tested
beats that one date on held-out years or between regions: heather's shifted date (the
shift the fits pick is zero), degree-days to a requirement and a chill count. So the layer
shows where the wattles flower en masse, timed by the normal-year date. Fitted on
iNaturalist records and NASA POWER temperatures: funges-lab/species/2026-11-18-anz-wave2.md,
from backend/tools/calibrate_wattle.py.

Drawn as fall foliage is, on the land pieces the region's species layers are drawn on,
handed over by the MapLayer script: the bush and woods of LAND, where the wattles are
recorded en masse (backend/generated/wattle_mask_<ANZ|EU|US>.npz, from data_tools'
build_spectacle_ground.py: their share of plant records within 50 km at least a tenth of
their typical share, and at least 250 of their records within 50 km).
"""
from __future__ import annotations

from datetime import date

import numpy as np

import bloom
import r2

WATTLE_PEAK = (8, 20)  # month, day: golden and silver wattle, southern Australia
MIMOSA_PEAK = (2, 15)  # silver wattle: Europe 16 February, California 14 February
SOUTH = frozenset({"anz"})
NORTH = frozenset({"se", "ne", "usw"})
# Australia/New Zealand: native forest, trees outside it, shrub. Europe (CORINE): broadleaf,
# coniferous and mixed forest, sclerophyllous scrub, woodland-shrub. US (NLCD): forest, shrub.
LAND = {"ANZ": (611, 612, 621), "EU": (311, 312, 313, 323, 324), "US": (41, 42, 43, 52)}
SIMPLIFY = 0.01  # degrees, as fall foliage's pieces


def season_south(today):
    """1 June - 31 October of `today`'s year, or None outside it: wattle in Australia/New Zealand."""
    if not 6 <= today.month <= 10:
        return None
    return date(today.year, 6, 1), date(today.year, 10, 31)


def season_north(today):
    """1 December - 30 April of `today`'s winter, or None outside it: mimosa in the north."""
    if 5 <= today.month <= 11:
        return None
    year = today.year + (today.month == 12)
    return date(year - 1, 12, 1), date(year, 4, 30)


def in_mask(lat, lon, macro):
    """Whether each point lies in a cell where the wattles are recorded en masse."""
    m = np.load(r2.generated(bloom._BACKEND / "generated" / f"wattle_mask_{macro}.npz"))
    lat0, lon0, step, grid = float(m["lat0"]), float(m["lon0"]), float(m["step"]), m["mask"].astype(bool)
    i = np.floor((np.asarray(lat, float) - lat0) / step).astype(int)
    j = np.floor((np.asarray(lon, float) - lon0) / step).astype(int)
    inside = (i >= 0) & (i < grid.shape[0]) & (j >= 0) & (j < grid.shape[1])
    out = np.zeros(len(i), bool)
    out[inside] = grid[i[inside], j[inside]]
    return out


def build_wattle(master_path, region_code, r2_prefix, to_pmtiles, upload,
                 *, land=None, build_mbtiles=bloom._tippecanoe_mesh, today=None):
    """Build and upload `<region>_wattle.pmtiles` (Australia/New Zealand) or
    `<region>_mimosa.pmtiles` (the north) on the wattles' bush and woods in `land` (the
    MapLayer script's land-cover pieces, `raster_val` and geometry), each piece carrying the
    normal peak as `peak`. Returns a small summary, or None out of season or without land."""
    today = today or date.today()
    south = region_code in SOUTH
    tiles, span, (month, day) = (("wattle", season_south(today), WATTLE_PEAK) if south
                                 else ("mimosa", season_north(today), MIMOSA_PEAK))
    if span is None:
        print(f"{tiles.capitalize()}: out of season on {today}, skipped.")
        return None
    if land is None:
        print(f"{tiles.capitalize()}: no land cover handed over, skipped.")
        return None
    macro = bloom.NORMALS_MACRO[region_code]
    pieces = land.loc[land["raster_val"].isin(LAND[macro]), ["geometry"]]
    middle = pieces.geometry.representative_point()
    pieces = pieces[in_mask(middle.y.to_numpy(), middle.x.to_numpy(), macro)].copy()
    # Simplified multi-part pieces often cross themselves; buffer(0) mends them (fall foliage).
    pieces["geometry"] = pieces.geometry.simplify(SIMPLIFY, preserve_topology=True).buffer(0)
    pieces = pieces[~pieces.is_empty]
    pieces["peak"] = float((date(span[1].year, month, day) - bloom.EPOCH).days)
    print(f"{tiles.capitalize()} {region_code}: {len(pieces)} pieces of bush and woods drawn")
    return {"pieces": bloom.publish(pieces, region_code, tiles, r2_prefix, to_pmtiles, upload, build_mbtiles)}


build_wattle.needs_master = False  # timed by a date, not the weather (bloom.build_spectacles)
