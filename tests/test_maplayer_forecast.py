import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from maplayer_forecast import forecast_props


def test_forecast_props_emits_only_visible_changes():
    # per_day[0] = today; indices 1.. = forecast days
    per_day = [
        {"mushroom": 6.0, "morel": 0.0, "chant": 5.0},  # d0 today
        {"mushroom": 6.0, "morel": 0.0, "chant": 5.4},  # d1: chant +0.4 (sub-threshold) -> omit
        {"mushroom": 7.0, "morel": 0.6, "chant": 5.0},  # d2: mushroom +1.0, morel 0->0.6 -> emit both
        {"mushroom": 6.0, "morel": 0.0, "chant": 0.0},  # d3: chant 5->0 drop -> emit
    ]
    props = forecast_props(per_day, threshold=0.5)
    assert props == {
        "mushroom_score_d2": 7.0,
        "morel_score_d2": 0.6,
        "chant_score_d3": 0.0,
    }


def test_forecast_props_empty_when_flat():
    per_day = [{"mushroom": 6.0}, {"mushroom": 6.0}, {"mushroom": 6.04}]
    assert forecast_props(per_day, threshold=0.5) == {}


import numpy as np
from scipy.spatial import cKDTree
from maplayer_forecast import score_days


def test_score_days_interpolates_per_day():
    # 3 points in a metric plane; one triangle whose centroid sits on point 0.
    xy_m = np.array([[0.0, 0.0], [1.0, 0.0], [0.0, 1.0]])
    tree = cKDTree(xy_m)
    tri_centroids_m = {0: np.array([0.0, 0.0])}
    valid_tris = {0}
    tri_id_to_raster = {0: 311}                      # broadleaf forest
    species_validsets = {"mushroom": {311, 312, 313}}  # valid here
    # day0 all 6.0, day1 all 9.0
    by_day = [{"mushroom": np.array([6.0, 6.0, 6.0])},
              {"mushroom": np.array([9.0, 9.0, 9.0])}]
    out = score_days(tree, xy_m, tri_centroids_m, valid_tris, tri_id_to_raster,
                     species_validsets, by_day)
    assert set(out) == {0}
    assert round(out[0][0]["mushroom"], 1) == 6.0
    assert round(out[0][1]["mushroom"], 1) == 9.0


def test_score_days_skips_invalid_habitat():
    xy_m = np.array([[0.0, 0.0], [1.0, 0.0], [0.0, 1.0]])
    tree = cKDTree(xy_m)
    out = score_days(tree, xy_m, {0: np.array([0.0, 0.0])}, {0}, {0: 999},
                     {"mushroom": {311}}, [{"mushroom": np.array([6.0, 6.0, 6.0])}])
    assert out[0][0] == {}   # raster 999 not in mushroom's valid set


if __name__ == "__main__":
    test_forecast_props_emits_only_visible_changes()
    test_forecast_props_empty_when_flat()
    test_score_days_interpolates_per_day()
    test_score_days_skips_invalid_habitat()
    print("OK")
