#!/usr/bin/env python3
"""Build the ground the bluebell and desert superbloom layers are drawn on.

As the cherry blossom layer is clipped to towns (build_bloom_towns.py), each of these
is clipped to where it can be seen. Both rules come from their calibrations, whose
cached downloads this reuses (pass the same --cache folders). Every rule is read on
a 0.01° grid, from fields interpolated smoothly between their own cells, so the
edges follow the land (the 1,500 m line, a rain gradient, the edge of the range)
instead of the coarse grids' squares:

- bluebell_woods_EU.parquet: the broadleaf and mixed woods (CORINE 311, 313) of the
  NE and SE wilderness polygons, the forests the species layers are drawn on, whose
  middle lies where the bluebell's share of plant records within 50 km is at least
  0.1 of its typical share (calibrate_bluebell.range_grids, 0.1°), without Norway's
  few outliers. Whole woods, so none is cut at the range's edge.
- heather_moors_EU.parquet: the moors and heaths (CORINE 322) of the NE and SE wilderness
  polygons, plus CORINE 2018's blanket bog (412) in Britain and Ireland from the EEA, where
  most of their heather moors are mapped, simplified to the wilderness polygons' grain;
  kept whole where their middle lies where Calluna's share of plant records within 50 km
  is at least 0.1 of its typical share, and north of 58° N below 300 m (higher, it is
  fjell heath).
- larch_mask_EU.npz: the host-cover cells (0.05°) where larch is at least a tenth of the
  trees; fall foliage draws a coniferous (CORINE 312) wood there as larch.
- superbloom_ground_US.geojson: a 1991-2020 normal rain under 350 mm a year
  (bloom_normals_US.npz), ground under 1,500 m (HydroSHEDS, averaged to 0.01°), at
  least 25 research-grade desert-annual records within 50 km
  (calibrate_superbloom.inat_range), and mostly barren, scrub or grassland in NLCD
  2024 (31, 52, 71): no towns, farms, water or forest.

    python backend/tools/build_spectacle_ground.py --bluebell-cache DIR --heather-cache DIR
        --wilderness NE.geojson SE.geojson --superbloom-cache DIR
"""
import argparse
import sys
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import shapely
from rasterio.features import shapes
from rasterio.transform import from_origin

_TOOLS = Path(__file__).resolve().parent
sys.path[:0] = [str(_TOOLS), str(_TOOLS.parent)]
import bloom  # noqa: E402

OUT = _TOOLS.parent / "generated"
BLUEBELL_SHARE = 0.1  # the bluebell's share of plant records within 50 km, of its typical share
BLUEBELL_WOODS = (311, 313)  # CORINE broadleaf and mixed forest in the regions' wilderness polygons
LARCH_SHARE = 0.1  # larch's share of the host cover's trees where a coniferous wood counts as larch
HEATHER_SHARE = 0.1  # Calluna's share of plant records within 50 km, of its typical share
HEATHER_MOORS = (322,)  # CORINE moors and heathland in the wilderness polygons
FJELL = (58.0, 300.0)  # north of this latitude, a heath whose middle is higher (m) is fjell heath, not ling
# Blanket bog (CORINE 412) is not in the wilderness polygons, but most of Britain's and Ireland's
# heather moors are mapped as it (the North York Moors, the Peak District): fetched from the EEA.
CLC_QUERY = "https://image.discomap.eea.europa.eu/arcgis/rest/services/Corine/CLC2018_WM/MapServer/0/query"
BOG_BOX = (-11.0, 49.8, 2.0, 61.0)  # Britain and Ireland
BOG_SIMPLIFY = 0.008  # degrees: as coarse as the wilderness polygons (~0.5 vertices per km of outline)
CLC_PAGE = 250  # polygons per request
NLCD_OPEN = (31, 52, 71)
PIXEL = 0.01  # degrees, the resolution every rule is read at
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


def bluebell(cache, wilderness):
    import calibrate_bluebell as cb

    macro, _, rel = cb.range_grids(cache)
    lat0, lon0 = macro["lat"][0], macro["lon"][0]
    iy, ix = np.nonzero(rel >= BLUEBELL_SHARE)
    south, north = lat0 + iy.min() * 0.1 - 0.2, lat0 + (iy.max() + 1) * 0.1 + 0.2
    west, east = lon0 + ix.min() * 0.1 - 0.2, lon0 + (ix.max() + 1) * 0.1 + 0.2
    lat, lon = fine_grid(south, north, west, east)
    in_range = polygons(bilinear(np.nan_to_num(rel), lat0, lon0, 0.1, lat, lon) >= BLUEBELL_SHARE,
                        west, south, PIXEL)
    units = cb.map_units(cache).to_crs(4326)
    in_range = shapely.difference(in_range, units[units.GU_A3 == "NOR"].union_all())
    woods = pd.concat([gpd.read_file(path, bbox=(west, south, east, north)) for path in wilderness])
    woods = woods[woods.raster_val.isin(BLUEBELL_WOODS)].reset_index(drop=True)
    # Whole woods, kept where their middle is in the range, so none is cut in two.
    shapely.prepare(in_range)
    woods = woods[shapely.contains(in_range, woods.representative_point().values)]
    out = OUT / "bluebell_woods_EU.parquet"
    gpd.GeoDataFrame(geometry=woods.geometry.values, crs="EPSG:4326").to_parquet(out, compression="zstd")
    print(f"wrote {out} ({len(woods)} woods, {out.stat().st_size // 1024} KB)", file=sys.stderr)


def clc_polygons(code, box, cache):
    """CORINE Land Cover 2018 polygons of `code` meeting `box` (west, south, east, north), from
    the EEA's map service, generalised there to half BOG_SIMPLIFY (full detail runs to 27 MB
    a page and the server gives up), fetched in pages of CLC_PAGE and cached."""
    import json
    import time
    import urllib.parse
    import urllib.request

    features, offset = [], 0
    while True:
        path = Path(cache) / "clc" / f"clc2018_{code}_g{BOG_SIMPLIFY / 2:g}_{offset}.geojson"
        if not path.exists():
            url = CLC_QUERY + "?" + urllib.parse.urlencode(dict(
                where=f"Code_18='{code}'", geometry=",".join(map(str, box)), geometryType="esriGeometryEnvelope",
                inSR=4326, spatialRel="esriSpatialRelIntersects", outFields="Code_18", outSR=4326,
                orderByFields="OBJECTID", resultOffset=offset, resultRecordCount=CLC_PAGE,
                maxAllowableOffset=BOG_SIMPLIFY / 2, f="geojson"))
            for attempt in range(5):
                try:
                    with urllib.request.urlopen(url, timeout=300) as r:
                        body = r.read()
                    json.loads(body)["features"]  # a partial or error page fails here, before it is cached
                    break
                except Exception as exc:
                    print(f"  retry CLC {code} page {offset}: {exc}", file=sys.stderr)
                    time.sleep(10 * (attempt + 1))
            else:
                raise RuntimeError(f"CLC {code} page {offset} failed")
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(body)
        page = json.loads(path.read_text(encoding="utf-8"))["features"]
        features += page
        if len(page) < CLC_PAGE:
            return gpd.GeoDataFrame.from_features(features, crs="EPSG:4326")
        offset += CLC_PAGE


def heather(cache, wilderness):
    import calibrate_heather as ch

    macro, _, rel = ch.range_grids(cache)
    lat0, lon0 = macro["lat"][0], macro["lon"][0]
    iy, ix = np.nonzero(rel >= HEATHER_SHARE)
    south, north = lat0 + iy.min() * 0.1 - 0.2, lat0 + (iy.max() + 1) * 0.1 + 0.2
    west, east = lon0 + ix.min() * 0.1 - 0.2, lon0 + (ix.max() + 1) * 0.1 + 0.2
    moors = pd.concat([gpd.read_file(path, bbox=(west, south, east, north)) for path in wilderness])
    moors = moors[moors.raster_val.isin(HEATHER_MOORS)].geometry
    bogs = clc_polygons("412", BOG_BOX, cache).geometry.simplify(BOG_SIMPLIFY, preserve_topology=True)
    ground = gpd.GeoDataFrame(geometry=np.concatenate([moors.values, bogs.values]), crs="EPSG:4326")
    ground = ground[~ground.is_empty].reset_index(drop=True)
    # Whole heaths, kept where their middle is in the range and, in the far north, low.
    middle = ground.representative_point()
    keep = bilinear(np.nan_to_num(rel), lat0, lon0, 0.1, middle.y.values, middle.x.values) >= HEATHER_SHARE
    north_of = middle.y.values > FJELL[0]
    keep[north_of] &= ~(ch.dem_elevations(middle.y.values[north_of], middle.x.values[north_of]) > FJELL[1])
    ground = ground[keep]
    out = OUT / "heather_moors_EU.parquet"
    ground.to_parquet(out, compression="zstd")
    print(f"wrote {out} ({len(ground)} heaths, {len(bogs)} bogs fetched, {out.stat().st_size // 1024} KB)",
          file=sys.stderr)


def larch(cache):
    """The host-cover cells (0.05°) where larch is at least LARCH_SHARE of the trees, for fall
    foliage's European larch woods."""
    import calibrate_bluebell as cb

    cover, _ = cb.host_cover(cache)
    larix = cover["classes"]["larix"].astype(float)
    trees = sum(v.astype(float) for v in cover["classes"].values())
    with np.errstate(invalid="ignore", divide="ignore"):
        mask = np.where(trees > 0, larix / trees, 0.0) >= LARCH_SHARE
    out = OUT / "larch_mask_EU.npz"
    np.savez_compressed(out, lat0=cover["lat0"], lon0=cover["lon0"], step=cover["step"], mask=mask)
    print(f"wrote {out} ({int(mask.sum())} cells, {out.stat().st_size // 1024} KB)", file=sys.stderr)


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
    ap.add_argument("--heather-cache", type=Path)
    ap.add_argument("--larch-cache", type=Path, help="a cache with EU_host_cover.npz (calibrate_bluebell.host_cover)")
    ap.add_argument("--wilderness", nargs="+", help="NE and SE wilderness GeoJSON (*_WILDERNESS_DATA_SOURCE)")
    ap.add_argument("--superbloom-cache", type=Path)
    args = ap.parse_args()
    if args.bluebell_cache:
        bluebell(args.bluebell_cache, args.wilderness)
    if args.larch_cache:
        larch(args.larch_cache)
    if args.heather_cache:
        heather(args.heather_cache, args.wilderness)
    if args.superbloom_cache:
        superbloom(args.superbloom_cache)
