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


def test_the_temperature_part_is_the_pipelines():
    import pandas as pd
    import forecast_pipeline as fp
    from fit_fruiting_parts import temp_part
    rng = np.random.default_rng(1)
    lags = rng.uniform(-5, 30, (50, 12))
    df = pd.DataFrame({"Temperature (C)": lags[:, 0], **{f"Temperature (C)_{d}days_ago": lags[:, d - 1] for d in range(1, 13)}})
    d = np.arange(1, 13)
    w = 0.6 * np.exp(-0.5 * ((d - 4) / 3.0) ** 2) + 0.4 * np.exp(-0.08 * d)
    pipeline = np.clip(fp._weighted_lag_gaussian(df, "Temperature (C)", 12, w / w.sum(), 14.0, 4.5), 0, 1)
    assert np.allclose(temp_part(lags, 14.0, 4.5), pipeline)


def test_the_optimum_moves_toward_the_find_days_warmth():
    from fit_fruiting_parts import choose_shift, temp_part, weather
    rng = np.random.default_rng(2)
    n = 300
    finds = np.r_[np.ones(n, bool), np.zeros(n, bool)]
    lags = rng.uniform(5, 15, (2 * n, 5, 12))
    lags[:n, 0] += 4                                              # the find days follow warmer days
    other = {"humidity": np.full((2 * n, 5), 0.5), "moisture": np.full((2 * n, 5), 0.5)}
    today = {"temp_weight": 1.75, "humidity_weight": 1.0, "rain_weight": 1.5}

    def index_of(shift):
        return weather({**other, "temp": temp_part(lags, 8.0 + (shift or 0.0), 3.0)}, today, np.ones((2 * n, 5)))

    assert choose_shift(index_of, np.ones((2 * n, 5), bool), finds, ~finds) > 0


def test_the_place_test_compares_each_find_with_that_days_walks_elsewhere():
    from fit_fruiting_parts import places
    n = 60
    mine = np.r_[np.ones(n, bool), np.zeros(4 * n, bool)]
    dates = np.r_[np.arange(n), np.repeat(np.arange(n), 4)]           # four walks on each find's day
    sites = np.r_[np.zeros(n), np.arange(1, 4 * n + 1)].astype(int)
    today = np.r_[np.ones(n), np.zeros(4 * n)]                         # the finds' places score highest
    result = places(today, -today, mine, ~mine, dates, sites, np.zeros(5 * n, int))
    assert result["place finds"] == n
    assert result["places today"] == 1.0 and result["places after"] == 0.0


def test_the_pooled_gain_weights_each_year_by_its_finds():
    from fit_fruiting_parts import pooled_gain
    weeks = np.array([1, 1, 2])
    year_a = ((np.full(3, 0.3), weeks), (np.full(3, 0.1), weeks))     # finds +0.3, placebo +0.1: +0.2
    year_b = ((np.full(1, -0.1), weeks[:1]), (np.zeros(3), weeks))    # one find, -0.1
    gain, ci = pooled_gain([year_a, year_b])
    assert np.isclose(gain, (3 * 0.2 + 1 * -0.1) / 4)
    assert np.allclose(ci, gain)
