from funges_backend.forecast_pipeline import RegionConfig, run_pipeline

CONFIG = RegionConfig(
    region="NE",
    lat_range=(49.0, 71.5),
    lon_range=(-25.0, 32.0),
)

if __name__ == "__main__":
    run_pipeline(CONFIG)
