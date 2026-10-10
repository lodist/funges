"""The fruiting fit: a conditional logit over each find's own day and its controls."""
import numpy as np
import pandas as pd

import fit_fruiting as ff


def _strata(n, beta, offset_weight=0.0, seed=0):
    """n strata of 5 days; the find day is drawn with odds exp(beta*x + offset_weight*z)."""
    rng = np.random.default_rng(seed)
    x = rng.normal(size=(n, 5, 1))
    z = rng.normal(size=(n, 5))
    logits = beta * x[..., 0] + offset_weight * z
    p = np.exp(logits - logits.max(1, keepdims=True))
    p /= p.sum(1, keepdims=True)
    chosen = np.array([rng.choice(5, p=row) for row in p])
    # Put the find day in slot 0, as the fit expects.
    order = np.array([[c] + [j for j in range(5) if j != c] for c in chosen])
    take = np.arange(n)[:, None]
    return x[take, order], z[take, order], np.ones((n, 5), bool)


def test_a_known_effect_is_recovered():
    x, _, mask = _strata(4000, beta=1.5)
    beta = ff.fit(x, mask, alpha=0.0)
    assert abs(beta[0] - 1.5) < 0.12


def test_the_outing_offset_is_held_fixed_not_absorbed():
    # Finds also follow z (when people go out); with z as an offset, x keeps its own effect.
    x, z, mask = _strata(4000, beta=1.0, offset_weight=2.0, seed=1)
    beta = ff.fit(x, mask, offset=2.0 * z, alpha=0.0)
    assert abs(beta[0] - 1.0) < 0.12


def test_a_small_sample_stays_near_the_shared_answer():
    x, _, mask = _strata(40, beta=3.0, seed=2)
    beta = ff.fit(x, mask, center=np.array([0.5]), alpha=200.0)
    assert abs(beta[0] - 0.5) < 0.3


def test_missing_days_are_left_out_of_a_stratum():
    x, _, mask = _strata(3000, beta=1.0, seed=3)
    mask[:, 3:] = False                        # only the find day and two controls remain
    x[:, 3:] = 99.0                            # values of missing days must not matter
    beta = ff.fit(x, mask, alpha=0.0)
    assert abs(beta[0] - 1.0) < 0.15


def test_rank_of_the_find_day_among_its_controls():
    index = np.array([[2.0, 1.0, 3.0, 0.0, 2.0],    # beats 2 of 4, ties 1 -> 0.625
                      [1.0, 0.0, 0.0, 0.0, 0.0]])   # beats all -> 1.0
    mask = np.ones((2, 5), bool)
    assert ff.find_day_rank(index, mask).tolist() == [0.625, 1.0]


def test_a_fit_ships_only_where_it_wins_more_years_than_chance():
    def years(wins, losses):
        return [(2016 + i, 0.05, 0.10) for i in range(wins)] + [(2030 + i, 0.10, 0.05) for i in range(losses)]

    assert ff.ships(years(9, 2))            # 9 of 11: p 0.03
    assert not ff.ships(years(6, 5))        # a coin could do that
    assert not ff.ships(years(5, 0))        # too few years to tell


def test_humidity_correction_matches_the_level_and_spread():
    stored = np.random.default_rng(4).uniform(30, 100, 5000)
    a, b = ff.humidity_correction(stored, 12.0 + 0.85 * stored)
    assert abs(a - 12.0) < 1e-6 and abs(b - 0.85) < 1e-6


def test_each_month_gets_its_own_scale():
    dates = pd.to_datetime([f"2020-{m:02d}-10" for m in range(1, 13) for _ in range(50)])
    month = dates.month.to_numpy()
    eta = np.where(month == 1, -1.0, np.where(month == 7, 1.0, 0.0)) + np.tile(np.linspace(0, 1, 50), 12)
    part = np.where(month == 1, 0.2, np.where(month == 7, 0.7, 0.5))
    months = ff.month_maps(dates, eta, part)
    assert len(months) == 12 and all(m["days"] == 50 for m in months)
    assert months[0]["eta"][0] == -1.0 and months[6]["eta"][0] == 1.0
    assert set(months[0]["weather_part"]) == {0.2} and set(months[6]["weather_part"]) == {0.7}
