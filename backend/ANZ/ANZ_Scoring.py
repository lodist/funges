import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # backend/ for shared modules
from forecast_pipeline import RegionConfig, run_pipeline

# Australia (its temperate-climate land) and New Zealand, one region. No host-tree map.
CONFIG = RegionConfig(
    region="ANZ",
    boundaries_env="ANZ_BOUNDARIES_DATA",
    coordinates_env="ANZ_UNIQUE_COORDINATES",
    base_env="ANZ_BASE_DATA",
    weather_data_env="ANZ_WEATHER_DATA",
    static_info_env="ANZ_STATIC_INFO",
    season_curves_env="ANZ_SEASON_CURVES",
    zone_curves_env="ANZ_ZONE_SEASON_CURVES",
    range_priors_env="ANZ_RANGE_PRIORS",
    lat_range=(-47.5, -10.0),
    lon_range=(112.0, 179.0),
)

if __name__ == "__main__":
    run_pipeline(CONFIG)
