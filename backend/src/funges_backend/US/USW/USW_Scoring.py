from funges_backend.forecast_pipeline import RegionConfig, run_pipeline

CONFIG = RegionConfig(
    region="USW",
    lat_range=(33.0, 49.5),
    lon_range=(-125.5, -81.5),
)

if __name__ == "__main__":
    run_pipeline(CONFIG)
