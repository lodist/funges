from funges_backend.forecast_pipeline import run_pipeline
from funges_backend.regions.config import REGION_CONFIGS

CONFIG = REGION_CONFIGS["NE"]

if __name__ == "__main__":
    run_pipeline(CONFIG)
