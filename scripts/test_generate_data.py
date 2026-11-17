"""Self-check for the spread and hotspot logic in generate_data.py.

Run: python scripts/test_generate_data.py
"""

import pandas as pd

from generate_data import (
    REGION_LABELS,
    REGION_URLS,
    VISUAL_REGIONS,
    assign_visual_regions,
    window_spread,
)

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

# Every region read has its label and its zones.
assert REGION_URLS.keys() == REGION_LABELS.keys() == VISUAL_REGIONS.keys()


def _zone_of(regions: dict, lon: float, lat: float):
    return assign_visual_regions(
        pd.DataFrame({"Longitude": [lon], "Latitude": [lat]}), regions
    ).iloc[0]


# A tilted oval holds the point 4 degrees along its long axis; level, it would not.
flat = {"z": (0.0, 0.0, 5.0, 1.0, "Z", "#000")}
tilted = {"z": (0.0, 0.0, 5.0, 1.0, "Z", "#000", 45)}
assert pd.isna(_zone_of(flat, 2.8, 2.8))
assert _zone_of(tilted, 2.8, 2.8) == "z"

# AU/NZ towns near where two ovals overlap land in their own zone.
for lon, lat, zone in [
    (174.78, -41.29, "north_island"),  # Wellington
    (173.28, -41.27, "south_island"),  # Nelson
    (140.78, -37.83, "south_australia"),  # Mount Gambier
    (149.75, -37.56, "victoria"),  # Mallacoota
    (153.40, -28.00, "south_east_queensland"),  # Gold Coast
    (153.60, -28.65, "new_south_wales"),  # Byron Bay
    (145.77, -16.92, "north_queensland"),  # Cairns
    (143.87, -39.93, "tasmania"),  # King Island
]:
    assert _zone_of(VISUAL_REGIONS["ANZ"], lon, lat) == zone, (lon, lat, zone)

print("ok")
