#!/usr/bin/env python3
"""Rebuild the EU static info's soil pH from SoilGrids and publish it.

`ph_level` used to come from the JRC "Map of Soil pH in Europe" (Reuter et al. 2010;
5 km, pH in CaCl2). North of the Alps it cannot tell chalk from peat: Salisbury Plain
read 3.9 and the Burren 3.9, and at the 66,936 North Europe points it has a Spearman
correlation of 0.08 with SoilGrids. Against GBIF sightings it placed blueberry and
lingonberry on the same soil as nettle and sloe. SoilGrids 2.0 (pH in water, 15-30 cm,
1 km), which the US static info already uses, separates them.

Every fetched coordinate lends its pH to all base points mapped to it, so a coordinate
takes the median pH of those points rather than the one pixel under it. Rows no region
maps to keep their own pixel.
"""
import argparse
import io
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import rasterio
from pyproj import Transformer

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import build_range_priors as brp  # noqa: E402

_ROOT = Path(__file__).resolve().parents[2]
SOILGRIDS_URL = "https://files.isric.org/soilgrids/latest/data_aggregated/1000m/phh2o/phh2o_15-30cm_mean_1000.tif"


def sample_ph(path, lat, lon):
    """SoilGrids pH at each point (stored x10 on disk); NaN off land."""
    with rasterio.open(path) as src:
        xs, ys = Transformer.from_crs("EPSG:4326", src.crs, always_xy=True).transform(lon, lat)
        v = np.array([s[0] for s in src.sample(zip(xs, ys))], float)
        return np.where((v > 0) & (v != src.nodata), v / 10, np.nan)


def coord_ph(static, base, sample):
    """ph_level per static row: median over the base points mapped to it, else its own pixel."""
    base_ph = pd.Series(sample(base["Latitude"].to_numpy(float), base["Longitude"].to_numpy(float)))
    median = base_ph.groupby([base["coord_lat"].round(3).to_numpy(), base["coord_lon"].round(3).to_numpy()]).median()
    key = pd.MultiIndex.from_arrays([static["Latitude"].round(3), static["Longitude"].round(3)])
    own = sample(static["Latitude"].to_numpy(float), static["Longitude"].to_numpy(float))
    return pd.Series(median.reindex(key).to_numpy()).fillna(pd.Series(own)).round(2).to_numpy()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--soilgrids", required=True, help=f"local copy of {SOILGRIDS_URL} (80 MB)")
    ap.add_argument("--dest", help="local path or R2 URL; default: EU_STATIC_INFO")
    args = ap.parse_args()
    curves = brp._curves()
    curves.load_dotenv(_ROOT / ".env")
    curves.load_dotenv(_ROOT / ".env.secret")

    def read(env):
        url = curves.get_required_env(env)
        return pd.read_csv(io.BytesIO(curves.r2_fetch(url)) if curves.is_remote_path(url) else url)

    static = read("EU_STATIC_INFO")
    base = pd.concat([read("NE_BASE_DATA"), read("SE_BASE_DATA")], ignore_index=True)
    static["ph_level"] = coord_ph(static, base, lambda lat, lon: sample_ph(args.soilgrids, lat, lon))
    print(f"{len(static)} rows, pH missing {static['ph_level'].isna().mean():.1%}")
    brp.save(static.to_csv(index=False).encode("utf-8"), args.dest or curves.get_required_env("EU_STATIC_INFO"))


if __name__ == "__main__":
    main()
