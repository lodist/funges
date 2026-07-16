from funges_backend.forecast_pipeline import RegionConfig, run_pipeline

CONFIG = RegionConfig(
    boundaries_env="NE_BOUNDARIES_DATA",
    coordinates_env="NE_UNIQUE_COORDINATES",
    base_env="NE_BASE_DATA",
    species_params_env="NE_SPECIES_PARAMS",
    weather_data_env="NE_WEATHER_DATA",
    static_info_env="EU_STATIC_INFO",
    season_curves_env="NE_SEASON_CURVES",
    zone_curves_env="EU_ZONE_SEASON_CURVES",
    lat_range=(49.0, 71.5),
    lon_range=(-25.0, 32.0),
)

if __name__ == "__main__":
    run_pipeline(CONFIG)
