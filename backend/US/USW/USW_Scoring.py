import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))  # backend/ for shared modules
from forecast_pipeline import RegionConfig, run_pipeline

CONFIG = RegionConfig(
    boundaries_env="USW_BOUNDARIES_DATA",
    coordinates_env="USW_UNIQUE_COORDINATES",
    base_env="USW_BASE_DATA",
    species_params_env="USW_SPECIES_PARAMS",
    weather_data_env="USW_WEATHER_DATA",
    static_info_env="US_STATIC_INFO",
    season_curves_env="USW_SEASON_CURVES",
    zone_curves_env="US_ZONE_SEASON_CURVES",
    lat_range=(33.0, 49.5),
    lon_range=(-125.5, -81.5),
)

if __name__ == "__main__":
    run_pipeline(CONFIG)
