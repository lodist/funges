#!/usr/bin/env python3
"""Build the ground the bluebell and desert superbloom layers are drawn on.

As the cherry blossom layer is clipped to towns (build_bloom_towns.py), each of these
is clipped to where it can be seen. Both rules come from their calibrations, whose
cached downloads this reuses (pass the same --cache folders). Every rule is read on
a 0.01° grid, from fields interpolated smoothly between their own cells, so the
edges follow the land (the 1,500 m line, a rain gradient, the edge of the range)
instead of the coarse grids' squares:

- bluebell_ground_EU.geojson: where the bluebell's share of plant records within
  50 km is at least 0.1 of its typical share (calibrate_bluebell.range_grids, 0.1°)
  and broadleaf trees (fagus + quercus + other_broadleaf) cover at least 3% (the EU
  host cover grid, 0.05°, its nearest value carried over the coast), without Norway's
  few outliers. It is cut to Natural Earth's land grown by LAND_MARGIN: the map draws
  it under the basemap's sea, whose coastline is the finer one.
  CORINE's woods were tried and dropped: they hold 12% of the sightings, since most
  British bluebell woods are under its 25 ha minimum.
- superbloom_ground_US.geojson: a 1991-2020 normal rain under 350 mm a year
  (bloom_normals_US.npz), ground under 1,500 m (HydroSHEDS, averaged to 0.01°), at
  least 25 research-grade desert-annual records within 50 km
  (calibrate_superbloom.inat_range), and mostly barren, scrub or grassland in NLCD
  2024 (31, 52, 71): no towns, farms, water or forest.

    python backend/tools/build_spectacle_ground.py --bluebell-cache DIR --superbloom-cache DIR
"""
import argparse
import sys
import tempfile
import urllib.request
from pathlib import Path

import geopandas as gpd
import numpy as np
import shapely
from rasterio.features import shapes
from rasterio.transform import from_origin

_TOOLS = Path(__file__).resolve().parent
sys.path[:0] = [str(_TOOLS), str(_TOOLS.parent)]
import bloom  # noqa: E402

OUT = _TOOLS.parent / "generated"
NE_LAND = ("https://raw.githubusercontent.com/nvkelso/natural-earth-vector/"
           "ca96624a56bd078437bca8184e78163e5039ad19/geojson/ne_10m_land.geojson")
BLUEBELL_SHARE, BLUEBELL_BROADLEAF = 0.1, 0.03
NLCD_OPEN = (31, 52, 71)
PIXEL = 0.01  # degrees, the resolution every rule is read at
LAND_MARGIN = 0.02  # degrees past Natural Earth's coast, which runs up to ~1.5 km off the real one
ROUND = 0.01  # degrees: grown by 1.2x this and shrunk back, pixel steps come out round
SPECK = 0.015  # degrees: then shrunk by this and grown back, specks narrower than twice it drop out
SIMPLIFY = 0.002
DECIMALS = 4


def fine_grid(south, north, west, east):
    """Pixel-centre latitudes and longitudes (rows from the south) of the 0.01° grid."""
    lat = south + (np.arange(round((north - south) / PIXEL)) + 0.5) * PIXEL
    lon = west + (np.arange(round((east - west) / PIXEL)) + 0.5) * PIXEL
    return np.meshgrid(lat, lon, indexing="ij")


def bilinear(grid, lat0, lon0, step, lat, lon):
    """`grid` (row 0 south, cells of `step` from the corner lat0, lon0) at the points,
    linear between cell centres."""
    from scipy.ndimage import map_coordinates

    return map_coordinates(grid, [(lat - lat0) / step - 0.5, (lon - lon0) / step - 0.5], order=1, mode="nearest")


def resampled(path, south, west, shape, resampling, dtype, nodata):
    """The raster at `path` resampled (averaged, or its mode) onto the 0.01° grid from
    `south`, `west` (row 0 south); `nodata` where it has none."""
    import rasterio
    from rasterio.warp import reproject

    top = np.full(shape, nodata, dtype)  # row 0 north, as rasters go
    with rasterio.open(path) as src:
        reproject(rasterio.band(src, 1), top, src_nodata=src.nodata, dst_nodata=nodata, dst_crs="EPSG:4326",
                  dst_transform=from_origin(west, south + shape[0] * PIXEL, PIXEL, PIXEL), resampling=resampling)
    return top[::-1]


def polygons(grid, west, south, step):
    """The True cells of `grid` (row 0 south) as one (multi)polygon."""
    north = south + grid.shape[0] * step
    parts = [shapely.geometry.shape(g) for g, v in shapes(
        grid[::-1].astype("uint8"), mask=grid[::-1], transform=from_origin(west, north, step, step)) if v]
    return shapely.union_all(parts)


def smooth(geom):
    geom = shapely.buffer(shapely.buffer(geom, ROUND * 1.2, quad_segs=4), -ROUND, quad_segs=4)
    return shapely.buffer(shapely.buffer(geom, -SPECK, quad_segs=4), SPECK, quad_segs=4)


def finish(geom, out):
    geom = shapely.simplify(geom, SIMPLIFY, preserve_topology=True)
    geom = shapely.set_precision(geom, 10.0 ** -DECIMALS)
    geom = shapely.transform(geom, lambda xy: np.round(xy, DECIMALS))
    parts = [g for g in shapely.get_parts(geom) if not g.is_empty]
    frame = gpd.GeoDataFrame(geometry=parts, crs="EPSG:4326")
    out.write_text(frame.to_json(drop_id=True), encoding="utf-8")
    print(f"wrote {out} ({len(frame)} areas, {out.stat().st_size // 1024} KB)", file=sys.stderr)


def land_near(geom):
    """Natural Earth's land around `geom`, grown by LAND_MARGIN."""
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "land.geojson"
        urllib.request.urlretrieve(NE_LAND, path)
        land = gpd.read_file(path)
    w, s, e, n = shapely.bounds(geom)
    return shapely.buffer(shapely.union_all(land.cx[w:e, s:n].geometry.values), LAND_MARGIN, quad_segs=4)


def bluebell(cache):
    import calibrate_bluebell as cb
    from scipy.ndimage import distance_transform_edt

    macro, _, rel = cb.range_grids(cache)
    cover, broadleaf = cb.host_cover(cache)
    lat0, lon0 = macro["lat"][0], macro["lon"][0]
    iy, ix = np.nonzero(rel >= BLUEBELL_SHARE)
    south, north = lat0 + iy.min() * 0.1 - 0.2, lat0 + (iy.max() + 1) * 0.1 + 0.2
    west, east = lon0 + ix.min() * 0.1 - 0.2, lon0 + (ix.max() + 1) * 0.1 + 0.2
    lat, lon = fine_grid(south, north, west, east)
    # Off the mapped ground (the sea) a cell takes its nearest mapped one's cover, so
    # the coast doesn't step; the land cut below decides where the shore is.
    near = distance_transform_edt(~cover["mapped"], return_distances=False, return_indices=True)
    in_range = bilinear(np.nan_to_num(rel), lat0, lon0, 0.1, lat, lon) >= BLUEBELL_SHARE
    trees = bilinear(broadleaf[near[0], near[1]], cover["lat0"], cover["lon0"], cover["step"], lat, lon)
    ground = in_range & (trees >= BLUEBELL_BROADLEAF)
    print(f"bluebell: {ground.mean():.1%} of {ground.size:,} pixels", file=sys.stderr)
    geom = smooth(polygons(ground, west, south, PIXEL))
    units = cb.map_units(cache).to_crs(4326)
    geom = shapely.difference(geom, units[units.GU_A3 == "NOR"].union_all())
    finish(shapely.intersection(geom, land_near(geom)), OUT / "bluebell_ground_EU.geojson")


def superbloom(cache):
    import calibrate_superbloom as cs
    from rasterio.warp import Resampling
    from scipy.spatial import cKDTree

    box = cs.WEST
    normals = dict(np.load(OUT / "bloom_normals_US.npz"))
    rain_tree = cKDTree(cs.unit_vectors(normals["lat"], normals["lon"]))
    yearly = (normals["prectotcorr"] * cs.MONTH_DAYS).sum(axis=1)

    def rain(lat, lon):  # normal mm a year, as bloom.daily_normals interpolates it
        dist, near = rain_tree.query(cs.unit_vectors(lat.ravel(), lon.ravel()), k=4)
        w = 1.0 / np.maximum(dist, 1e-9) ** 2
        return ((w * yearly[near]).sum(axis=1) / w.sum(axis=1)).reshape(lat.shape)

    # Records within 50 km on the 0.1° lattice, interpolated below; it also bounds the grid.
    cy = np.arange(round(box["swlat"] / bloom.CELL), round(box["nelat"] / bloom.CELL) + 1)
    cx = np.arange(round(box["swlng"] / bloom.CELL), round(box["nelng"] / bloom.CELL) + 1)
    clat, clon = np.meshgrid(cy * bloom.CELL, cx * bloom.CELL, indexing="ij")
    rlat, rlon, rn = cs.inat_range(cache)
    records = cs.records_within(cKDTree(cs.unit_vectors(rlat, rlon)), rn, clat.ravel(), clon.ravel())
    records = records.reshape(clat.shape).astype(float)
    candidate = (records >= cs.RANGE_RECORDS / 2) & (rain(clat, clon) < cs.MASK_RAIN * 1.3)
    rows, cols = np.nonzero(candidate)
    south, north = clat[rows.min(), 0] - 0.3, clat[rows.max(), 0] + 0.3
    west, east = clon[0, cols.min()] - 0.3, clon[0, cols.max()] + 0.3
    lat, lon = fine_grid(south, north, west, east)
    lattice0 = (cy[0] - 0.5) * bloom.CELL, (cx[0] - 0.5) * bloom.CELL
    near_records = bilinear(records, *lattice0, bloom.CELL, lat, lon) >= cs.RANGE_RECORDS
    elevation = resampled(cs.DEM, south, west, lat.shape, Resampling.average, np.float32, np.nan)
    cover = resampled(cs.NLCD, south, west, lat.shape, Resampling.mode, np.uint8, 0)
    ground = near_records & (rain(lat, lon) < cs.MASK_RAIN) & (elevation < cs.MASK_ELEV) & np.isin(cover, NLCD_OPEN)
    print(f"superbloom: {ground.mean():.1%} of {ground.size:,} pixels", file=sys.stderr)
    finish(smooth(polygons(ground, west, south, PIXEL)), OUT / "superbloom_ground_US.geojson")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--bluebell-cache", type=Path)
    ap.add_argument("--superbloom-cache", type=Path)
    args = ap.parse_args()
    if args.bluebell_cache:
        bluebell(args.bluebell_cache)
    if args.superbloom_cache:
        superbloom(args.superbloom_cache)
