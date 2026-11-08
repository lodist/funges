"""What goes in now across each continent, for Huerta's live line on the front pages.

For every crop, the areas where it goes in now (sow or plant) at one place at least, from
tonight's garden map on R2 (backend/huerta.py map_files). An area is a cell of Terra's live-line
grid (generate_worth_foraging_now.py), so both lines count the same areas. Only these counts
are public; each place's own advice stays behind the Huerta Worker.
"""

import json
import os
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
import r2  # noqa: E402

OUTPUT_PATH = ROOT / "public" / "data" / "huerta_now.json"
GRID_SIZE_DEGREES = 0.5
CONTINENTS = {"europe": ("NE", "SE"), "northAmerica": ("USE", "USW")}
# The map's layers that are not a crop's letter (MAP_LAYERS and the pest weeks).
NOT_CROPS = {"frost", "soil", "water", "cold", "balance", "blight", "slugs", "downy"}


def areas_now(places, codes):
    """{crop: cells where it goes in now}. places: (n, 2) lat and lon x 100 as on the map;
    codes: {crop: (n,) the crop's letter at each place}."""
    cells = np.round(places / 100 / GRID_SIZE_DEGREES).astype(np.int64)
    keys = cells[:, 0] * 10_000 + cells[:, 1]
    return {crop: set(keys[letters == ord("n")].tolist()) for crop, letters in codes.items()}


def region_map(s3, bucket, region):
    """The map's day, places and each crop's letters, read as the Worker reads them (one
    range for the crops' layers)."""
    def get(name, **kwargs):
        return s3.get_object(Bucket=bucket, Key=f"huerta/map/{region}/{name}", **kwargs)["Body"].read()

    index = json.loads(get("index.json"))
    n = index["n"]
    crops = [(i, name) for i, name in enumerate(index["layers"])
             if name not in NOT_CROPS and not name.endswith(("_jan_aug", "_sep_dec"))]
    first, last = crops[0][0], crops[-1][0]
    layers = np.frombuffer(get("layers.bin", Range=f"bytes={first * n}-{(last + 1) * n - 1}"), np.uint8)
    layers = layers.reshape(-1, n)
    places = np.frombuffer(get("places.bin"), "<i2").reshape(n, 2)
    return index["day"], places, {name: layers[i - first] for i, name in crops}


def main():
    s3 = r2.client()
    bucket = os.environ["R2_BUCKET_NAME"]
    payload = {"day": None}
    for continent, regions in CONTINENTS.items():
        cells = {}
        for region in regions:
            day, places, codes = region_map(s3, bucket, region)
            payload["day"] = max(payload["day"] or day, day)
            for crop, keys in areas_now(places, codes).items():
                cells.setdefault(crop, set()).update(keys)
        counts = sorted(((crop, len(keys)) for crop, keys in cells.items() if keys), key=lambda c: -c[1])
        payload[continent] = dict(counts)
    OUTPUT_PATH.write_text(json.dumps(payload, separators=(",", ":")) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
