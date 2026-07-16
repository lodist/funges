from funges_backend.forecast_pipeline import RegionConfig, run_pipeline

CONFIG = RegionConfig(
    region="SE",
    lat_range=(34.0, 55.5),
    lon_range=(12.0, 42.5),
)

if __name__ == "__main__":
    run_pipeline(CONFIG)
