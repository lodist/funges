"""Self-check for the spread logic in generate_data.py.

Run: python scripts/test_generate_data.py
"""

import pandas as pd

from generate_data import window_spread, wettest_direction


def _cells(rain_by_cell: dict[tuple[int, int], float], days: int = 14) -> pd.DataFrame:
    today = pd.Timestamp("2026-09-24")
    index, rain = [], []
    for day in range(days):
        for (blat, blon), total in rain_by_cell.items():
            index.append((today - pd.Timedelta(days=day), blat, blon))
            rain.append(total / days)
    idx = pd.MultiIndex.from_tuples(index, names=["Date", "blat", "blon"])
    return pd.DataFrame({"precip_mm": rain, "temp_avg": 20.0}, index=idx)


# 10x10 zone, dry except its two eastern columns: a local storm, not zone-wide rain.
grid = {(lat, lon): (60.0 if lon >= 8 else 0.0) for lat in range(10) for lon in range(10)}
spread = window_spread(_cells(grid), pd.Timestamp("2026-09-24"))["14"]
assert spread["rain_p50"] == 0.0, spread
assert spread["rain_p90"] >= 50, spread  # the storm survives aggregation
assert spread["rain_dir"] == "e", spread

# Uniform rain has no "wettest area" to point at.
uniform = {(lat, lon): 20.0 for lat in range(10) for lon in range(10)}
assert wettest_direction(_cells(uniform).groupby(level=["blat", "blon"])["precip_mm"].sum()) is None

print("ok")
