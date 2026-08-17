import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from tempfile import TemporaryDirectory

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.generate_data import DAYS, aggregate_region  # noqa: E402


class GenerateDataTest(unittest.TestCase):
    def test_aggregate_region_matches_full_frame_means_across_batches(self) -> None:
        today = datetime.now(timezone.utc).date()
        current = pd.Timestamp(today)
        old = pd.Timestamp(today - timedelta(days=DAYS + 1))
        frame = pd.DataFrame(
            {
                "Date": [current] * 5 + [old],
                "Latitude": [0.0] * 6,
                "Longitude": [0.0, 0.5, 1.5, 3.0, 10.0, 0.0],
                "Temperature (C)": [10.0, 20.0, 40.0, 30.0, 99.0, 50.0],
                "mushroom_score": [2.0, 4.0, 8.0, 6.0, 9.0, 10.0],
                # These columns are deliberately present but must not be loaded.
                "mushroom_confidence": [1.0] * 6,
                "Description": ["unused"] * 6,
            }
        )
        regions = {
            "west": (0.0, 0.0, 2.0, 2.0, "West", "#000000"),
            "east": (3.0, 0.0, 2.0, 2.0, "East", "#ffffff"),
        }

        with TemporaryDirectory() as temp_dir:
            parquet_path = Path(temp_dir) / "sample.parquet"
            frame.to_parquet(parquet_path, row_group_size=2)
            rows, zones = aggregate_region(parquet_path, regions, batch_size=2)

        self.assertEqual(zones, ["east", "west"])
        self.assertEqual(
            rows,
            [
                {
                    "date": current.strftime("%Y-%m-%d"),
                    "zone": "east",
                    "temp_avg": 30.0,
                    "scores": {"mushroom": 6.0},
                },
                {
                    "date": current.strftime("%Y-%m-%d"),
                    "zone": "west",
                    "temp_avg": 23.3,
                    "scores": {"mushroom": 4.67},
                },
            ],
        )


if __name__ == "__main__":
    unittest.main()
