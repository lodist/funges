#!/usr/bin/env python3
"""Build the ground the bluebell and desert superbloom layers are drawn on.

As the cherry blossom layer is clipped to towns (build_bloom_towns.py), each of these
is clipped to where it can be seen. Both rules come from their calibrations, whose
cached downloads this reuses (pass the same --cache folders):

- bluebell_ground_EU.geojson: the 0.05° cells of the EU host cover grid where the
  bluebell's share of plant records within 50 km is at least 0.1 of its typical share
  (calibrate_bluebell.range_grids) and broadleaf trees (fagus + quercus +
  other_broadleaf) cover at least 3%, without Norway's few outliers, cut to land.
  CORINE's woods were tried and dropped: they hold 12% of the sightings, since most
  British bluebell woods are under its 25 ha minimum.
- superbloom_ground_US.geojson: the 0.1° cells with a 1991-2020 normal rain under
  350 mm a year (bloom_normals_US.npz), ground under 1,500 m (HydroSHEDS) and at least
  25 research-grade desert-annual records within 50 km (calibrate_superbloom.inat_range),
  keeping their 0.01° pixels that are mostly barren, scrub or grassland in NLCD 2024
  (31, 52, 71): no towns, farms, water or forest.

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
PIXEL = 0.01  # degrees, the superbloom ground's resolution
ROUND = 0.01  # degrees: grown by 1.2x this and shrunk back, the pixel corners come out round
SIMPLIFY = 0.002
DECIMALS = 4


def polygons(grid, west, south, step):
    """The True cells of `grid` (row 0 south) as one (multi)polygon."""
    north = south + grid.shape[0] * step
    parts = [shapely.geometry.shape(g) for g, v in shapes(
        grid[::-1].astype("uint8"), mask=grid[::-1], transform=from_origin(west, north, step, step)) if v]
    return shapely.union_all(parts)


def finish(geom, out):
    geom = shapely.buffer(shapely.buffer(geom, ROUND * 1.2, quad_segs=4), -ROUND, quad_segs=4)
    geom = shapely.simplify(geom, SIMPLIFY, preserve_topology=True)
    geom = shapely.set_precision(geom, 10.0 ** -DECIMALS)
    geom = shapely.transform(geom, lambda xy: np.round(xy, DECIMALS))
    parts = [g for g in shapely.get_parts(geom) if not g.is_empty]
    frame = gpd.GeoDataFrame(geometry=parts, crs="EPSG:4326")
    out.write_text(frame.to_json(drop_id=True), encoding="utf-8")
    print(f"wrote {out} ({len(frame)} areas, {out.stat().st_size // 1024} KB)", file=sys.stderr)


def bluebell(cache):
    import calibrate_bluebell as cb

    macro, _, rel = cb.range_grids(cache)
    cover, broadleaf = cb.host_cover(cache)
    assert cover["step"] * 2 == 0.1 and (cover["lat0"], cover["lon0"]) == (macro["lat"][0], macro["lon"][0])
    in_range = np.repeat(np.repeat(rel >= BLUEBELL_SHARE, 2, axis=0), 2, axis=1)
    ground = in_range & (broadleaf >= BLUEBELL_BROADLEAF) & cover["mapped"]
    print(f"bluebell: {int(ground.sum())} cells of 0.05°", file=sys.stderr)
    geom = polygons(ground, cover["lon0"], cover["lat0"], cover["step"])
    units = cb.map_units(cache).to_crs(4326)
    geom = shapely.difference(geom, units[units.GU_A3 == "NOR"].union_all())
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "land.geojson"
        urllib.request.urlretrieve(NE_LAND, path)
        land = gpd.read_file(path)
    w, s, e, n = shapely.bounds(geom)
    geom = shapely.intersection(geom, shapely.union_all(land.cx[w:e, s:n].geometry.values))
    finish(geom, OUT / "bluebell_ground_EU.geojson")


def superbloom(cache):
    import calibrate_superbloom as cs
    import rasterio
    from rasterio.warp import Resampling, reproject
    from scipy.spatial import cKDTree

    box = cs.WEST
    cy, cx = np.meshgrid(np.arange(round(box["swlat"] / bloom.CELL), round(box["nelat"] / bloom.CELL) + 1),
                         np.arange(round(box["swlng"] / bloom.CELL), round(box["nelng"] / bloom.CELL) + 1),
                         indexing="ij")
    lat, lon = cy * bloom.CELL, cx * bloom.CELL
    normals = dict(np.load(OUT / "bloom_normals_US.npz"))
    dist, near = cKDTree(cs.unit_vectors(normals["lat"], normals["lon"])).query(
        cs.unit_vectors(lat.ravel(), lon.ravel()), k=4)
    w = 1.0 / np.maximum(dist, 1e-9) ** 2
    w /= w.sum(axis=1, keepdims=True)
    rain = ((w[..., None] * normals["prectotcorr"][near]).sum(axis=1) * cs.MONTH_DAYS).sum(axis=1)
    keep = (rain < cs.MASK_RAIN) & (cs.dem_at(lat.ravel(), lon.ravel()) < cs.MASK_ELEV)
    rlat, rlon, rn = cs.inat_range(cache)
    tree = cKDTree(cs.unit_vectors(rlat, rlon))
    keep[keep] = cs.records_within(tree, rn, lat.ravel()[keep], lon.ravel()[keep]) >= cs.RANGE_RECORDS
    keep = keep.reshape(lat.shape)
    print(f"superbloom: {int(keep.sum())} cells of 0.1°", file=sys.stderr)
    # The kept cells' 0.01° pixels: a cell spans 10 x 10 of them, edges on its own.
    rows, cols = np.nonzero(keep)
    r0, r1, c0, c1 = rows.min(), rows.max() + 1, cols.min(), cols.max() + 1
    south, west = (cy[r0, 0] - 0.5) * bloom.CELL, (cx[0, c0] - 0.5) * bloom.CELL
    k = round(bloom.CELL / PIXEL)
    cells = np.repeat(np.repeat(keep[r0:r1, c0:c1], k, axis=0), k, axis=1)
    top = np.zeros(cells.shape, np.uint8)  # row 0 north, as rasters go
    with rasterio.open(cs.NLCD) as src:
        reproject(rasterio.band(src, 1), top, dst_transform=from_origin(west, south + cells.shape[0] * PIXEL,
                  PIXEL, PIXEL), dst_crs="EPSG:4326", resampling=Resampling.mode, dst_nodata=0)
    ground = cells & np.isin(top[::-1], NLCD_OPEN)
    print(f"superbloom: {ground.mean() / cells.mean():.0%} of the cells' pixels are open ground", file=sys.stderr)
    finish(polygons(ground, west, south, PIXEL), OUT / "superbloom_ground_US.geojson")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--bluebell-cache", type=Path)
    ap.add_argument("--superbloom-cache", type=Path)
    args = ap.parse_args()
    if args.bluebell_cache:
        bluebell(args.bluebell_cache)
    if args.superbloom_cache:
        superbloom(args.superbloom_cache)
