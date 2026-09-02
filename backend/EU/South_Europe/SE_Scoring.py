import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))  # backend/ for shared modules
from forecast_pipeline import RegionConfig, run_pipeline

CONFIG = RegionConfig(
    region="SE",
    boundaries_env="SE_BOUNDARIES_DATA",
    coordinates_env="SE_UNIQUE_COORDINATES",
    base_env="SE_BASE_DATA",
    weather_data_env="SE_WEATHER_DATA",
    static_info_env="EU_STATIC_INFO",
    season_curves_env="SE_SEASON_CURVES",
    zone_curves_env="EU_ZONE_SEASON_CURVES",
    lat_range=(34.0, 55.5),
    lon_range=(12.0, 42.5),
)

if __name__ == "__main__":
    run_pipeline(CONFIG)
