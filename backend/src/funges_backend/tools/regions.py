"""Shared RegionConfig registry for the one-off migration/proof scripts (bake,
coarsen, subset proof) that need to iterate over all 4 regions.
"""
from funges_backend.forecast_pipeline import RegionConfig

REGIONS = {
    "NE": RegionConfig(
        boundaries_env="NE_BOUNDARIES_DATA", coordinates_env="NE_UNIQUE_COORDINATES",
        base_env="NE_BASE_DATA", species_params_env="NE_SPECIES_PARAMS",
        weather_data_env="NE_WEATHER_DATA", static_info_env="EU_STATIC_INFO",
        season_curves_env="NE_SEASON_CURVES", zone_curves_env="EU_ZONE_SEASON_CURVES",
        lat_range=(49.0, 71.5), lon_range=(-25.0, 32.0)),
    "SE": RegionConfig(
        boundaries_env="SE_BOUNDARIES_DATA", coordinates_env="SE_UNIQUE_COORDINATES",
        base_env="SE_BASE_DATA", species_params_env="SE_SPECIES_PARAMS",
        weather_data_env="SE_WEATHER_DATA", static_info_env="EU_STATIC_INFO",
        season_curves_env="SE_SEASON_CURVES", zone_curves_env="EU_ZONE_SEASON_CURVES",
        lat_range=(34.0, 55.5), lon_range=(12.0, 42.5)),
    "USE": RegionConfig(
        boundaries_env="USE_BOUNDARIES_DATA", coordinates_env="USE_UNIQUE_COORDINATES",
        base_env="USE_BASE_DATA", species_params_env="USE_SPECIES_PARAMS",
        weather_data_env="USE_WEATHER_DATA", static_info_env="US_STATIC_INFO",
        season_curves_env="USE_SEASON_CURVES", zone_curves_env="US_ZONE_SEASON_CURVES",
        lat_range=(24.0, 37.5), lon_range=(-106.5, -75.0)),
    "USW": RegionConfig(
        boundaries_env="USW_BOUNDARIES_DATA", coordinates_env="USW_UNIQUE_COORDINATES",
        base_env="USW_BASE_DATA", species_params_env="USW_SPECIES_PARAMS",
        weather_data_env="USW_WEATHER_DATA", static_info_env="US_STATIC_INFO",
        season_curves_env="USW_SEASON_CURVES", zone_curves_env="US_ZONE_SEASON_CURVES",
        lat_range=(33.0, 49.5), lon_range=(-125.5, -81.5)),
}
