"""tools/fit_fruiting_parts.py switches a part off only when that lifts the find days over the placebo days."""
import numpy as np


def test_the_part_that_times_the_finds_backwards_goes_and_the_one_that_times_them_stays():
    from fit_fruiting_parts import choose
    rng = np.random.default_rng(0)
    n = 400
    finds = np.r_[np.ones(n, bool), np.zeros(n, bool)]           # then n placebo strata
    humidity, temp = rng.uniform(0.2, 0.9, (2, 2 * n, 5))
    humidity[:n, 0], temp[:n, 0] = 0.95, 0.05                    # humid, and too cold, on the find days
    parts = {"temp": temp, "humidity": humidity, "moisture": np.full((2 * n, 5), 0.5)}
    today = {"temp_weight": 1.75, "humidity_weight": 1.0, "rain_weight": 1.5}
    days = np.ones((2 * n, 5), bool)
    weights = choose(parts, today, np.ones((2 * n, 5)), days, finds, ~finds)
    assert weights["temp_weight"] == 0
    assert weights["humidity_weight"] == 1.0


def test_the_pooled_gain_weights_each_year_by_its_finds():
    from fit_fruiting_parts import pooled_gain
    weeks = np.array([1, 1, 2])
    year_a = ((np.full(3, 0.3), weeks), (np.full(3, 0.1), weeks))     # finds +0.3, placebo +0.1: +0.2
    year_b = ((np.full(1, -0.1), weeks[:1]), (np.zeros(3), weeks))    # one find, -0.1
    gain, ci = pooled_gain([year_a, year_b])
    assert np.isclose(gain, (3 * 0.2 + 1 * -0.1) / 4)
    assert np.allclose(ci, gain)
