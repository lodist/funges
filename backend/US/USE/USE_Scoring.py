import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))  # backend/ for shared modules
from forecast_pipeline import RegionConfig, run_pipeline

CONFIG = RegionConfig(
    region="USE",
    boundaries_env="USE_BOUNDARIES_DATA",
    coordinates_env="USE_UNIQUE_COORDINATES",
    base_env="USE_BASE_DATA",
    weather_data_env="USE_WEATHER_DATA",
    static_info_env="US_STATIC_INFO",
    season_curves_env="USE_SEASON_CURVES",
    zone_curves_env="US_ZONE_SEASON_CURVES",
    lat_range=(24.0, 49.5),
    lon_range=(-106.5, -67.0),
)

if __name__ == "__main__":
    run_pipeline(CONFIG)
