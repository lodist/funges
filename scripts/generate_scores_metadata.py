"""Write public/data/scores_metadata.json: when the forecast map was last refreshed.

The time is the upload time (Last-Modified) of the regions' public forecast tiles. The
oldest of the four is used, so the label never claims a fresher map than the stalest
region shows.
"""

import json
from datetime import timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

import requests

FORECAST_TILES = [
    "https://data.fung.es/EU/NE/ne_forecast.pmtiles",
    "https://data.fung.es/EU/SE/se_forecast.pmtiles",
    "https://data.fung.es/USA/USE/use_forecast.pmtiles",
    "https://data.fung.es/USA/USW/usw_forecast.pmtiles",
]
JSON_PATH = Path("public/data/scores_metadata.json")


def uploaded_at(url: str):
    response = requests.head(url, timeout=30)
    response.raise_for_status()
    return parsedate_to_datetime(response.headers["Last-Modified"])


def main() -> None:
    oldest = min(uploaded_at(url) for url in FORECAST_TILES)
    metadata = {"updated_at": oldest.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
    JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
    with JSON_PATH.open("w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)


if __name__ == "__main__":
    main()
