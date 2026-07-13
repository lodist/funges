import numpy as np
from scipy.spatial import cKDTree

from funges_backend.maplayer_forecast import interp_props, score_days


def test_interp_props_keeps_peak_and_omits_zeros():
    # mushroom 6.0 today -> 4.0 d6; morel 0 today -> 5.0 d6; chant low but moves
    today = {"mushroom": 6.0, "morel": 0.0, "chant": 3.0}
    d6 = {"mushroom": 4.0, "morel": 5.0, "chant": 3.2}
    props = interp_props(today, d6, threshold=4.5)
    assert props == {
        "mushroom_score": 6.0,
        "mushroom_score_d6": 4.0,
        "morel_score_d6": 5.0,   # morel d0 is 0 -> omitted; rises to 5 -> emitted
        "chant_score": 3.0,
        "chant_score_d6": 3.2,
    }


def test_interp_props_omits_d6_when_flat():
    # flat species: only d0 emitted; missing _d6 means "flat" client-side
    assert interp_props({"mushroom": 6.0}, {"mushroom": 6.0}) == {"mushroom_score": 6.0}


def test_interp_props_emits_zero_d6_for_real_decline():
    # genuine drop to 0 must be stored (0 != d0) so the client shows the decline
    assert interp_props({"mushroom": 6.0}, {"mushroom": 0.0}) == {
        "mushroom_score": 6.0,
        "mushroom_score_d6": 0.0,
    }


def test_interp_props_drops_triangle_below_threshold():
    # nothing reaches 4.5 on either endpoint -> drop
    assert interp_props({"mushroom": 3.0, "chant": 4.4}, {"mushroom": 4.0, "chant": 4.4}, threshold=4.5) == {}


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
    test_interp_props_keeps_peak_and_omits_zeros()
    test_interp_props_omits_d6_when_flat()
    test_interp_props_emits_zero_d6_for_real_decline()
    test_interp_props_drops_triangle_below_threshold()
    test_score_days_interpolates_per_day()
    test_score_days_skips_invalid_habitat()
    print("OK")
