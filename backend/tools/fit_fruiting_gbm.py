#!/usr/bin/env python3
"""The fruiting response as a gradient-boosted ranker (#291, after the linear fit).

Same design as fit_fruiting.py: each find's own day against the same place 14 and 21 days
either side. LightGBM is trained on the exact conditional likelihood of each stratum (a
softmax over its days), so, like the linear fit, it only learns what separates a find day
from its own place's other days; unlike it, the trees can find optima and interactions.
"""
from __future__ import annotations

import lightgbm as lgb  # before pandas/pyarrow: see tests/conftest.py
import numpy as np

from fit_fruiting import find_day_rank  # noqa: F401  (re-exported: the same rank test)

PARAMS = {"learning_rate": 0.05, "num_leaves": 15, "min_data_in_leaf": 200, "feature_fraction": 0.9,
          "bagging_fraction": 0.8, "bagging_freq": 1, "lambda_l2": 1.0, "max_bin": 63, "verbose": -1,
          "seed": 291}


def clogit_objective(sizes):
    """LightGBM objective for strata of `sizes` consecutive rows, find day first: the gradient
    p - y and the diagonal hessian p(1 - p) of the stratum softmax's negative log-likelihood."""
    starts = np.r_[0, np.cumsum(sizes)[:-1]]
    group = np.repeat(np.arange(len(sizes)), sizes)

    def objective(preds, data):
        label = data.get_label() if hasattr(data, "get_label") else data
        e = np.exp(preds - np.maximum.reduceat(preds, starts)[group])
        p = e / np.add.reduceat(e, starts)[group]
        return p - label, np.maximum(p * (1 - p), 1e-6)
    return objective


def fit(x: np.ndarray, mask: np.ndarray, rounds: int = 400, categorical=(), params=None):
    """x [case, 5 days, k] and mask [case, 5], find day in slot 0 -> a LightGBM booster."""
    case, slot = np.nonzero(mask)
    sizes = np.bincount(case)[np.unique(case)]
    data = lgb.Dataset(x[case, slot], (slot == 0).astype(float),
                       categorical_feature=list(categorical) or "auto", free_raw_data=False)
    return lgb.train({**PARAMS, **(params or {}), "objective": clogit_objective(sizes)}, data,
                     num_boost_round=rounds)


def predict(model, x: np.ndarray, rounds: int | None = None) -> np.ndarray:
    """The index for every day of every stratum, [case, 5]; masked days are ignored downstream."""
    n, days, k = x.shape
    return model.predict(x.reshape(n * days, k), num_iteration=rounds, raw_score=True).reshape(n, days)
