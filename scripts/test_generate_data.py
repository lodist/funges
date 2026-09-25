"""Self-check for the spread and hotspot logic in generate_data.py.

Run: python scripts/test_generate_data.py
"""

import pandas as pd

from generate_data import window_spread

TODAY = pd.Timestamp("2026-09-24")


class FakePlaces:
    def places_in(self, cells, zone_cells=None, limit=2):
        return [{"name": "Testville", "de": "Teststadt"}]


def _cells(rain_on: dict[tuple[int, int], dict[int, float]], days: int = 14) -> pd.DataFrame:
    """10x10 zone; ``rain_on[cell][days_ago] = mm``, dry everywhere else."""
    index, rain = [], []
    for ago in range(days):
        for lat in range(10):
            for lon in range(10):
                index.append((TODAY - pd.Timedelta(days=ago), lat, lon))
                rain.append(rain_on.get((lat, lon), {}).get(ago, 0.0))
    idx = pd.MultiIndex.from_tuples(index, names=["Date", "blat", "blon"])
    return pd.DataFrame({"precip_mm": rain, "temp_avg": 20.0}, index=idx)


# A storm 8-9 days ago over the two eastern columns, dry since: a local
# hotspot with the rain-then-dry flush pattern, while the median stays 0.
storm = {(lat, lon): {8: 30.0, 9: 30.0} for lat in range(10) for lon in (8, 9)}
spread = window_spread(_cells(storm), TODAY)["14"]
assert spread["rain_p50"] == 0.0, spread
(spot,) = spread["hotspots"]
assert spot["rain_mm"] == 60.0 and spot["rain_high"] == 60.0, spot
assert spot["peak_date"] == "2026-09-15", spot  # 9 days ago, the first max
assert spot["flush"] is True, spot
assert spot["dir"] == "e" and "places" not in spot, spot  # no names: compass

# The storm is outside the 7-day window, and hotspots stop at 30 days.
assert window_spread(_cells(storm), TODAY)["7"]["hotspots"] == []

# With a place index the hotspot is named instead of given a direction.
named = window_spread(_cells(storm), TODAY, FakePlaces())["14"]["hotspots"][0]
assert named["places"] == [{"name": "Testville", "de": "Teststadt"}] and "dir" not in named

# A lone wet cell is a downpour, not an area.
lone = {(5, 5): {2: 80.0}}
assert window_spread(_cells(lone), TODAY)["14"]["hotspots"] == []

# Uniform rain has no hotspot.
uniform = {(lat, lon): {3: 20.0} for lat in range(10) for lon in range(10)}
assert window_spread(_cells(uniform), TODAY)["14"]["hotspots"] == []

print("ok")
