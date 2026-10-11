"""The fruiting GBM in production must see exactly what it was trained on."""
import numpy as np
import pandas as pd

import build_training_table as tt
import forecast_pipeline as fp
from test_fruiting import _production_frame, _series


def test_production_daily_lags_match_the_training_table():
    series = _series()
    dates = pd.DatetimeIndex(series["Date"].iloc[[50, 75, 119]])
    trained = tt.daily_lags(series, dates)
    production = fp.fruiting_gbm_lags(_production_frame(series, dates))
    assert list(production.columns) == list(trained.columns)
    pd.testing.assert_frame_equal(production.reset_index(drop=True), trained.reset_index(drop=True),
                                  check_dtype=False, atol=1e-9)


def test_lags_reaching_before_the_history_are_missing():
    series = _series()
    dates = pd.DatetimeIndex(series["Date"].iloc[[10]])            # 10 days in: rain_d42 has no day
    lags = tt.daily_lags(series, dates)
    assert np.isnan(lags["rain_d42"].iloc[0]) and np.isfinite(lags["rain_d10"].iloc[0])
