"""Local season curves: each place's season from the records around it, not its region's."""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend" / "tools"))
import build_local_season as ls  # noqa: E402

LATS = 40.0 + (np.arange(60) + 0.5) * 0.1  # a 6° square of 0.1° cells


def _grids():
    """Even looking everywhere; the species is found in October in the south, July in the north."""
    fungi = np.full((12, 60, 60), 100.0, np.float32)
    species = np.zeros_like(fungi)
    species[9, :30] = 5.0
    species[6, 30:] = 5.0
    return species, fungi


def test_each_half_gets_its_own_peak_month():
    species, fungi = _grids()
    ratio = ls.season_ratio(species, fungi, LATS, ("wide", 50.0, 10.0, None), None, {"fungi": {}, "own": {}})
    assert np.argmax(ratio[:, 5, 30]) == 9 and ratio[6, 5, 30] < 0.2      # the south: October
    assert np.argmax(ratio[:, 55, 30]) == 6 and ratio[9, 55, 30] < 0.2    # the north: July


def test_one_curve_for_the_whole_square_cannot_tell_them_apart():
    species, fungi = _grids()
    pooled = ls.to_ratio(ls.month_shares(species.sum(axis=(1, 2)), fungi.sum(axis=(1, 2))))
    assert pooled[6] == pooled[9] == 1.0


def test_a_place_without_records_borrows_from_its_climate_analogues():
    # Two climates in alternating stripes; records only in the outer stripes. The middle stripes
    # are far from any record of their own climate but share it with the outer ones.
    fungi = np.full((12, 20, 40), 100.0, np.float32)
    species = np.zeros_like(fungi)
    warm, cold = (15.5, 30.5, 3.5), (5.5, 10.5, 12.5)
    coords = np.empty((3, 20, 40))
    for c, climate in ((slice(0, 10), warm), (slice(10, 20), cold), (slice(20, 30), warm), (slice(30, 40), cold)):
        coords[:, :, c] = np.array(climate)[:, None, None]
    species[9, :, 0:10] = 5.0     # the warm climate's October
    species[6, :, 30:40] = 5.0    # the cold climate's July
    ratio = ls.season_ratio(species, fungi, LATS[:20], ("climate only", None, 10.0, 1.0), coords,
                            {"fungi": {}, "own": {}})
    assert np.argmax(ratio[:, 10, 25]) == 9     # a warm stripe with no records: October
    assert np.argmax(ratio[:, 10, 15]) == 6     # a cold one: July


def test_the_joint_kernel_keeps_slopes_and_valleys_apart():
    # 10 km stripes: valleys (22 °C summers) fruit in October, slopes (12 °C) in July.
    fungi = np.full((12, 20, 40), 100.0, np.float32)
    species = np.zeros_like(fungi)
    coords = np.empty((3, 20, 40))
    for start in range(0, 40, 2):
        valley = start % 4 == 0
        coords[:, :, start:start + 2] = np.array([(27.0 if valley else 17.0), 25.0, 5.0])[:, None, None]
        species[9 if valley else 6, :, start:start + 2] = 5.0
    caches = lambda: {"fungi": {}, "own": {}}  # noqa: E731
    joint = ls.season_ratio(species, fungi, LATS[:20], ("joint", 50.0, 10.0, 1.0), coords, caches())
    distance = ls.season_ratio(species, fungi, LATS[:20], ("wide", 50.0, 10.0, None), coords, caches())
    assert np.argmax(joint[:, 10, 20]) == 9 and joint[6, 10, 20] < 0.2     # a valley: October
    assert np.argmax(joint[:, 10, 22]) == 6 and joint[9, 10, 22] < 0.2     # a slope: July
    assert min(distance[6, 10, 20], distance[9, 10, 20]) > 0.8              # distance alone mixes them


def test_the_climate_layer_moves_without_steps():
    ramp = np.broadcast_to(np.arange(ls.CLIMATE_BINS[0], dtype=float)[:, None, None], ls.CLIMATE_BINS)
    f_bins = np.stack([ramp.ravel()] * 12)
    coords = np.array([[[10.5, 10.6, 10.9, 11.5]], [[5.5] * 4], [[5.5] * 4]])
    out = ls.climate_lookup(f_bins, coords, np.nan)[0, 0]
    assert np.allclose(out, [10.0, 10.1, 10.4, 11.0])


def test_a_seam_is_a_step_between_neighbours_of_one_climate():
    factor = np.zeros((12, 1, 3))
    factor[:, 0, 1:] = 0.5                       # a jump between the first and second cell
    coords = np.zeros((3, 1, 3))
    valid = np.ones((1, 3), bool)
    assert ls.steps(factor, valid, coords).max() == 0.5           # same climate: a seam
    coords[0, 0, 1:] = 4.0                                         # the second cell is 4 °C cooler
    assert ls.steps(factor, valid, coords).max() == 0.0            # a slope: the ground explains it
    assert ls.steps(factor, valid).max() == 0.5                    # all neighbours count it


def test_few_records_lean_on_the_prior_many_on_their_own():
    local, prior = np.array([0.0, 1.0]), np.array([1.0, 0.0])
    assert np.allclose(ls.shrink(local, 0.0, prior, 30.0), prior)
    assert np.allclose(ls.shrink(local, 3000.0, prior, 30.0), local, atol=0.01)
    assert np.allclose(ls.shrink(np.array([np.nan, np.nan]), 5.0, prior, 30.0), prior)


def test_the_season_factor_matches_the_app_s():
    # Peak: no tilt, gate open; a tenth of the peak: gate just fully open; 2%: closed.
    assert np.allclose(ls.season_factor([1.0, 0.1, 0.02]), [1.0, 0.64, 0.0])
