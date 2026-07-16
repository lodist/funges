from funges_backend.forecast_pipeline import RegionConfig, run_pipeline

CONFIG = RegionConfig(
    region="USE",
    lat_range=(24.0, 37.5),
    lon_range=(-106.5, -75.0),
)

if __name__ == "__main__":
    run_pipeline(CONFIG)
