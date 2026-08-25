"""Checks for the season-timing QA metrics. If these break, every onset number is wrong."""
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from qa_season_analysis import (  # noqa: E402
    auc_from_ranks,
    best_lag,
    climatological_doy_rate,
    crossing_date,
    month_labels,
)


def test_auc_is_one_when_positives_rank_above_negatives():
    values = np.array([1.0, 2.0, 3.0, 4.0])
    assert auc_from_ranks(values, np.array([False, False, True, True])) == 1.0
    assert auc_from_ranks(values, np.array([True, True, False, False])) == 0.0
    # positives {2,3} beat one negative each and lose to one each -> exactly 0.5
    assert auc_from_ranks(values, np.array([False, True, True, False])) == 0.5
    assert auc_from_ranks(values, np.array([True, False, True, False])) == 0.25
    assert auc_from_ranks(values, np.array([True, True, True, True])) is None


def test_crossing_date_ignores_an_isolated_spike():
    index = pd.date_range("2026-05-01", periods=60, freq="D")
    values = np.zeros(60)
    values[5] = 100.0          # one-day spike, must not count as an onset
    values[30:] = 100.0        # sustained rise
    found = crossing_date(pd.Series(values, index=index), 0.15)
    assert found == index[30]


def test_crossing_date_handles_flat_and_empty_series():
    index = pd.date_range("2026-05-01", periods=10, freq="D")
    assert crossing_date(pd.Series(np.zeros(10), index=index), 0.15) is None
    assert crossing_date(pd.Series(dtype=float), 0.15) is None


def test_best_lag_recovers_a_known_shift():
    index = pd.date_range("2026-04-15", periods=120, freq="D")
    signal = pd.Series(np.sin(np.arange(120) / 12.0), index=index)
    # predicted must be shifted forward by +10 to line up with observed, i.e. it leads.
    observed = signal
    predicted = signal.shift(-10)
    assert best_lag(observed, predicted)["best_lag_days"] == 10


def test_month_labels_split_peak_from_dead_months():
    rates = np.array([0.0, 0.0, 0.0, 0.0, 0.02, 0.2, 1.0, 0.9, 0.6, 0.3, 0.05, 0.0])
    in_season, dead = month_labels(rates)
    assert in_season == {7, 8, 9}
    assert {1, 2, 3, 4, 12} <= dead
    assert not (in_season & dead)


def test_climatology_interpolation_peaks_at_the_peak_month():
    rates = np.zeros(12)
    rates[6] = 1.0  # July
    index = pd.date_range("2026-01-01", "2026-12-31", freq="D")
    daily = climatological_doy_rate(rates, index)
    assert index[int(np.argmax(daily))].month == 7
    assert daily.min() == pytest.approx(0.0, abs=1e-9)
