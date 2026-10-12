#!/usr/bin/env python3
"""Static habitat features for every app location: what the place is like, for a learned
habitat factor (wood-decay fungi grow on park and street trees, lowland broadleaf, riverbanks
- none of the score's parts says so).

Per location: the host-cover tree shares (range_prior host cover, 0.05°), the distance to
the nearest town (bloom_towns, Natural Earth urban areas), altitude and distances to water
and sea (the region's base and static-info files, as the scoring reads them), and the
yearly ERA5 normals (era5_normals).

    python backend/tools/build_habitat_features.py --out ../era5_training
"""
import lightgbm  # noqa: F401  before pandas/pyarrow: see tests/conftest.py
import argparse
import importlib.util
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT / "backend"), str(ROOT / "backend" / "tools"), str(ROOT / "scripts")]
import era5_normals  # noqa: E402
import forecast_pipeline as fp  # noqa: E402
from range_prior import COVER_SCALE, load_host_cover  # noqa: E402

SCRIPTS = {"NE": "EU/North_Europe/NE_Scoring.py", "SE": "EU/South_Europe/SE_Scoring.py",
           "USE": "US/USE/USE_Scoring.py", "USW": "US/USW/USW_Scoring.py"}
CRS = {"EU": 3035, "US": 5070}      # equal-area metres for town distances


def region_config(region):
    spec = importlib.util.spec_from_file_location(f"{region}_scoring", ROOT / "backend" / SCRIPTS[region])
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.CONFIG


def host_shares(cover, lats, lons) -> dict:
    """Tree shares, and whether the tree map reaches the place at all. Where it does not
    (94% of Turkey, North Africa, the Canaries) the shares are unknown, not zero: read as
    zero they told the model "no oak, no beech" in Turkey's Black Sea forests."""
    i = np.floor((lats - cover["lat0"]) / cover["step"]).astype(int)
    j = np.floor((lons - cover["lon0"]) / cover["step"]).astype(int)
    ok = (i >= 0) & (i < cover["mapped"].shape[0]) & (j >= 0) & (j < cover["mapped"].shape[1])
    i, j = np.clip(i, 0, cover["mapped"].shape[0] - 1), np.clip(j, 0, cover["mapped"].shape[1] - 1)
    mapped = ok & cover["mapped"][i, j]
    out = {"tree_map": mapped}
    for name, grid in cover["classes"].items():
        out[f"tree_{name}"] = np.where(mapped, grid[i, j] / COVER_SCALE, np.nan)
    return out


def town_km(lats, lons, continent) -> np.ndarray:
    import geopandas as gpd
    towns = gpd.read_file(ROOT / "backend" / "generated" / f"bloom_towns_{continent}.geojson").to_crs(CRS[continent])
    points = gpd.GeoDataFrame(geometry=gpd.points_from_xy(lons, lats), crs=4326).to_crs(CRS[continent])
    near = gpd.sjoin_nearest(points, towns[["geometry"]], distance_col="m").groupby(level=0)["m"].min()
    return near.reindex(range(len(points))).to_numpy() / 1000.0


def features(region) -> pd.DataFrame:
    from io import StringIO
    from scipy.spatial import cKDTree
    config = region_config(region)
    continent = era5_normals.CONTINENT[region]
    places = pd.read_csv(StringIO(fp.r2_fetch(fp.get_required_env(config.base_env)).decode("utf-8")))
    places = places[[c for c in ("Location_Id", "Latitude", "Longitude", "Elevation (m)") if c in places]]
    places = places.drop_duplicates("Location_Id").reset_index(drop=True)
    lats, lons = places["Latitude"].to_numpy(float), places["Longitude"].to_numpy(float)
    static = pd.read_csv(StringIO(fp.r2_fetch(fp.get_required_env(config.static_info_env)).decode("utf-8")))
    nearest = cKDTree(static[["Latitude", "Longitude"]].to_numpy(float)).query(np.column_stack([lats, lons]))[1]
    if "Elevation (m)" not in places:          # the US bases carry it in the static info as Altitude
        places["Elevation (m)"] = static["Altitude"].to_numpy(float)[nearest]
    cover = load_host_cover(fp.r2_fetch(fp.get_required_env(config.host_cover_env)))
    grid = era5_normals.load(region)
    months = [era5_normals.lookup(grid, lats, lons, np.full(len(places), m)) for m in range(1, 13)]
    return places.assign(region=region,
                         dist_m_water=static["dist_m_water"].to_numpy(float)[nearest],
                         dist_m_sea=static["dist_m_sea"].to_numpy(float)[nearest],
                         town_km=town_km(lats, lons, continent),
                         annual_tmean=np.mean([m["norm_tmean"] for m in months], axis=0),
                         annual_rain=np.mean([m["norm_rain"] for m in months], axis=0),
                         **host_shares(cover, lats, lons))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    fp.load_dotenv(ROOT / ".env")
    fp.load_dotenv(ROOT / ".env.secret")
    for region in SCRIPTS:
        table = features(region)
        table.to_parquet(Path(args.out) / f"habitat_features_{region}.parquet", index=False)
        print(f"{region}: {len(table):,} locations", flush=True)


if __name__ == "__main__":
    main()
