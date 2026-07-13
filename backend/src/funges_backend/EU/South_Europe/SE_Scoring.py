from funges_backend.forecast_pipeline import RegionConfig, run_pipeline

CONFIG = RegionConfig(
    boundaries_env="SE_BOUNDARIES_DATA",
    coordinates_env="SE_UNIQUE_COORDINATES",
    base_env="SE_BASE_DATA",
    species_params_env="SE_SPECIES_PARAMS",
    weather_data_env="SE_WEATHER_DATA",
    static_info_env="EU_STATIC_INFO",
    season_curves_env="SE_SEASON_CURVES",
    zone_curves_env="EU_ZONE_SEASON_CURVES",
    lat_range=(34.0, 55.5),
    lon_range=(12.0, 42.5),
)

if __name__ == "__main__":
    run_pipeline(CONFIG)
