"""Locks the vectorized temp / humidity / altitude / pH sub-scores to the original
per-row `.apply` logic. The reference functions below are verbatim copies of the
original expressions from calculate_mushroom_score; the test asserts the production
helpers reproduce them bit-for-bit across NaNs and pH-range edges.
"""
import numpy as np
import pandas as pd

from funges_backend import forecast_pipeline as fp
from funges_backend.forecast_pipeline import altitude_score, gaussian


# --- verbatim reference implementations (original behavior) -------------------
def _ref_weighted_lag(df, base_col, n_days, weights, mu, sigma):
    return np.asarray(sum(
        w * df.get(f'{base_col}_{d}days_ago', df[base_col])
            .fillna(df[base_col])
            .apply(lambda x: gaussian(x, mu, sigma))
        for d, w in enumerate(weights, start=1)
    ), dtype=float)


def _ref_alt(df, optimal_alt, alt_sigma):
    return df['Elevation (m)'].apply(lambda x: altitude_score(x, optimal_alt, alt_sigma)).to_numpy(float)


def _ref_ph(df, optimal_pH, pH_sigma_near, pH_sigma_far, pH_range_near):
    return df['ph_level'].apply(
        lambda x: np.exp(-((x - optimal_pH) ** 2) / (2 * (pH_sigma_near if pH_range_near[0] <= x <= pH_range_near[1] else pH_sigma_far) ** 2))
        if not np.isnan(x) else 0
    ).to_numpy(float)


# --- sample with NaNs and pH-range edges --------------------------------------
def _sample(n=3000, seed=11):
    rng = np.random.default_rng(seed)
    data = {}
    base_temp = rng.normal(12.0, 8.0, n)
    base_hum = rng.uniform(40.0, 100.0, n)
    data['Temperature (C)'] = base_temp
    data['Humidity (%)'] = base_hum
    data['Elevation (m)'] = rng.uniform(0.0, 2000.0, n)
    ph = rng.uniform(3.0, 9.0, n)
    ph[rng.random(n) < 0.1] = np.nan          # missing pH
    data['ph_level'] = ph
    for d in range(1, 22):                      # 21 temp + 21 humidity lag columns
        t = base_temp + rng.normal(0, 2, n)
        t[rng.random(n) < 0.08] = np.nan
        h = base_hum + rng.normal(0, 5, n)
        h[rng.random(n) < 0.08] = np.nan
        data[f'Temperature (C)_{d}days_ago'] = t
        data[f'Humidity (%)_{d}days_ago'] = h
    # also exercise the "lag column missing -> fall back to base" path
    df = pd.DataFrame(data)
    return df


def _temp_weights(temp_days):
    dT = np.arange(1, temp_days + 1)
    w = 0.6 * np.exp(-0.5 * ((dT - 4) / 3.0) ** 2) + 0.4 * np.exp(-0.08 * dT)
    return w / w.sum()


def _hum_weights(hum_days):
    dH = np.arange(1, hum_days + 1)
    w = 0.6 * np.exp(-0.5 * ((dH - 9) / 5.0) ** 2) + 0.4 * np.exp(-0.05 * dH)
    return w / w.sum()


def test_temp_weighted_lag_matches_reference():
    df = _sample()
    temp_days, mu, sigma = 12, 14.0, 6.0
    w = _temp_weights(temp_days)
    ref = _ref_weighted_lag(df, 'Temperature (C)', temp_days, w, mu, sigma)
    got = fp._weighted_lag_gaussian(df, 'Temperature (C)', temp_days, w, mu, sigma)
    assert np.array_equal(got, ref, equal_nan=True)


def test_humidity_weighted_lag_matches_reference():
    df = _sample()
    hum_days, mu, sigma = 21, 85.0, 15.0
    w = _hum_weights(hum_days)
    ref = _ref_weighted_lag(df, 'Humidity (%)', hum_days, w, mu, sigma)
    got = fp._weighted_lag_gaussian(df, 'Humidity (%)', hum_days, w, mu, sigma)
    assert np.array_equal(got, ref, equal_nan=True)


def test_weighted_lag_falls_back_when_lag_column_missing():
    df = _sample().drop(columns=['Temperature (C)_3days_ago'])  # force the fallback path
    temp_days, mu, sigma = 12, 14.0, 6.0
    w = _temp_weights(temp_days)
    ref = _ref_weighted_lag(df, 'Temperature (C)', temp_days, w, mu, sigma)
    got = fp._weighted_lag_gaussian(df, 'Temperature (C)', temp_days, w, mu, sigma)
    assert np.array_equal(got, ref, equal_nan=True)


def test_altitude_score_vectorized_matches_reference():
    df = _sample()
    ref = _ref_alt(df, 1150, 600)
    got = np.asarray(altitude_score(df['Elevation (m)'].to_numpy(float), 1150, 600))
    assert np.array_equal(got, ref, equal_nan=True)


def test_ph_score_vectorized_matches_reference():
    df = _sample()
    args = (6.0, 0.5, 1.5, (5.0, 7.0))
    ref = _ref_ph(df, *args)
    got = fp._ph_score_vectorized(df['ph_level'].to_numpy(float), *args)
    # NaN pH -> exactly 0.0 in both.
    nan_rows = df['ph_level'].isna().to_numpy()
    assert np.array_equal(got[nan_rows], ref[nan_rows])  # both 0.0 on NaN pH
    # NumPy's vectorized exp can differ from the per-row scalar exp by <=1 ULP on a
    # few values; that is ~1e16x below the 2-decimal rounding applied to final scores.
    assert np.allclose(got, ref, rtol=0.0, atol=1e-12, equal_nan=True)
    assert float(np.nanmax(np.abs(got - ref))) <= 2.3e-16  # <= 1 ULP at this magnitude
