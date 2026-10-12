import numpy as np

import build_season_curves as bsc


def test_generate_cells_tiles_bbox_inclusive_of_remainder():
    cells = bsc.generate_cells((0.0, 5.0), (0.0, 4.0), 2.0)
    # lat edges 0,2,4 -> 3 bands (0-2,2-4,4-5); lon edges 0,2,4 -> 2 cols (0-2,2-4)
    assert len(cells) == 3 * 2
    # last cell clamps to the bbox max, not 6/6
    assert cells[-1] == (4.0, 5.0, 2.0, 4.0)


def test_majority_zone_picks_most_common_label_in_cell():
    lats = np.array([1.0, 1.5, 1.2])
    lons = np.array([1.0, 1.1, 1.2])
    zones = np.array(["continental", "continental", "alpine"])
    cell = (0.0, 2.0, 0.0, 2.0)
    assert bsc.majority_zone_in_cell(cell, lats, lons, zones) == "continental"


def test_majority_zone_returns_none_for_empty_cell():
    lats = np.array([10.0])
    lons = np.array([10.0])
    zones = np.array(["continental"])
    cell = (0.0, 2.0, 0.0, 2.0)
    assert bsc.majority_zone_in_cell(cell, lats, lons, zones) is None


def test_sampling_boxes_are_the_bounds_of_each_regions_coordinates(monkeypatch):
    # Genoa, Seville and Athens score in South Europe (south of 47 N), Oslo in the north;
    # Denver in West US (west of 100 W), Boston and Miami in the east.
    coords = {
        "EU_STATIC_INFO": ([44.4, 37.4, 38.0, 59.9], [8.9, -6.0, 23.7, 10.8]),
        "US_STATIC_INFO": ([39.7, 42.4, 25.8], [-105.0, -71.1, -80.2]),
    }
    monkeypatch.setattr(bsc, "load_static_coords", lambda env: (
        np.array(coords[env][0]), np.array(coords[env][1]), np.array(["z"] * len(coords[env][0]))))
    boxes = bsc.sampling_boxes()
    assert boxes["SE"] == {"lat": (37.4, 44.4), "lon": (-6.0, 23.7)}  # Spain and Liguria in
    assert boxes["NE"] == {"lat": (59.9, 59.9), "lon": (10.8, 10.8)}
    assert boxes["USW"] == {"lat": (39.7, 39.7), "lon": (-105.0, -105.0)}
    assert boxes["USE"] == {"lat": (25.8, 42.4), "lon": (-80.2, -71.1)}
    assert boxes["EU"] == {"lat": (37.4, 59.9), "lon": (-6.0, 23.7)}
    assert boxes["US"] == {"lat": (25.8, 42.4), "lon": (-105.0, -71.1)}


def test_build_zone_curves_sums_cells_and_gates_on_min_total():
    months = {m: 0 for m in range(1, 13)}
    # continental: 2 cells, Boletus heavy in Aug(8); fungi flat -> ratio peaks Aug.
    sp_a = dict(months); sp_a[8] = 150
    sp_b = dict(months); sp_b[8] = 150
    fungi = {m: 100 for m in range(1, 13)}
    # temperate: a single sparse cell below min_total -> dropped.
    sp_sparse = dict(months); sp_sparse[8] = 5
    cell_results = [
        ("continental", {"mushroom": sp_a}, dict(fungi)),
        ("continental", {"mushroom": sp_b}, dict(fungi)),
        ("temperate",   {"mushroom": sp_sparse}, dict(fungi)),
    ]
    out = bsc.build_zone_curves(cell_results, low=0.8, high=1.2, min_total=200)
    assert "continental" in out                 # 300 sightings >= 200
    assert "mushroom" in out["continental"]
    assert "temperate" not in out               # 5 sightings < 200 -> gated out
    multiplier = out["continental"]["mushroom"]["multiplier"]
    assert multiplier[8] > multiplier[1]        # peak month scores higher
    assert abs(multiplier[8] - 1.2) < 1e-9      # ratio max -> high ceiling
    # The uncompressed ratio rides alongside, and unlike the multiplier it reaches 0 in a
    # dead month -- that is what lets the gate distinguish "dead" from "quiet".
    ratio = out["continental"]["mushroom"]["ratio"]
    assert abs(ratio[8] - 1.0) < 1e-9
    assert ratio[1] == 0.0
