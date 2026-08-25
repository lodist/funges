"""Locks the production vectorized rain sub-score to the original per-row logic.

`weather_score_reference.weather_score_apply` is a VERBATIM copy of the original
`_weather_row` + `df.apply` (the behavior we must preserve). This test asserts the
production `forecast_pipeline._weather_score_vectorized` reproduces it bit-for-bit
across parameter regimes, so any future drift in the vectorized path is caught.
"""
import numpy as np
import pytest

from funges_backend import forecast_pipeline as fp
from tests import weather_score_reference as poc

REGIMES = [
    {"min_cumulative_rain": 5.0},
    {"min_cumulative_rain": 20.0},
    {"min_cumulative_rain": 60.0},
    {"min_cumulative_rain": 20.0, "weather_preference": {"rain_first": True}},
    {"min_cumulative_rain": 0.0},
]


def _prod_scores(df, params):
    p = poc._derive_params(params)
    return fp._weather_score_vectorized(
        df, poc.PRECIP_COLS,
        min_p=p["min_p"], cum_thr=p["cum_thr"], rain_first=p["rain_first"],
        baseline_days=p["baseline_days"], max_wet_eff=p["max_wet_eff"],
        min_dry_eff=p["min_dry_eff"], cum_gamma=p["cum_gamma"],
        dl_start_pct=p["dl_start_pct"], dl_floor=p["dl_floor"], dl_gamma=p["dl_gamma"],
        drought_k=p["drought_k"], drought_mid=p["drought_mid"],
        drought_floor=p["drought_floor"], no_wet_penalty=p["no_wet_penalty"],
        weather_eps=p["weather_eps"],
    )


@pytest.mark.parametrize("params", REGIMES)
def test_vectorized_matches_original_apply(params):
    df = poc.make_sample(4000, seed=7)
    ref = poc.weather_score_apply(df, params)          # verbatim original behavior
    got = np.asarray(_prod_scores(df, params))
    assert got.shape == ref.shape
    assert np.array_equal(got, ref), (
        f"max|diff|={np.nanmax(np.abs(got - ref)):.3e} for params={params}"
    )
