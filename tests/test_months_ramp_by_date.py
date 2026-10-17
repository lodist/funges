"""_months_ramp works per distinct date; it must equal the per-row original exactly."""
import numpy as np
import pandas as pd

import seasonality


def _original(dates, allowed_months, factor, ramp_days=31):
    """seasonality._months_ramp before it went per date (verbatim)."""
    allowed_months = set(allowed_months)
    in_season = dates.dt.month.isin(allowed_months)
    day_of_year = dates.dt.dayofyear
    valid_days = np.concatenate([
        pd.date_range(f'2021-{m:02d}-01', f'2021-{m:02d}-{pd.Period(f"2021-{m:02d}").days_in_month}')
          .dayofyear.to_numpy()
        for m in sorted(allowed_months)
    ])
    dist = np.minimum(
        np.abs(day_of_year.values[:, None] - valid_days[None, :]),
        365 - np.abs(day_of_year.values[:, None] - valid_days[None, :])
    ).min(axis=1)
    return np.where(in_season, 1, np.clip(1 - (1 - factor) * dist / ramp_days, factor, 1))


def test_per_date_ramp_equals_the_per_row_original():
    rng = np.random.default_rng(0)
    days = pd.to_datetime("2026-01-01") + pd.to_timedelta(rng.integers(0, 730, 5000), unit="D")
    dates = pd.Series(np.r_[days.to_numpy(), np.array(["NaT"], dtype="datetime64[ns]")], index=np.arange(5001) * 3)
    for months, factor in (([9, 10, 11], 0.5), ([4, 5], 0.0), ([12, 1, 2], 0.2)):
        new, old = seasonality._months_ramp(dates, months, factor), _original(dates, months, factor)
        assert new.dtype == old.dtype
        np.testing.assert_array_equal(new, old)
