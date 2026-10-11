"""The fruiting GBM: LightGBM trained on the conditional likelihood of each stratum."""
import numpy as np

import fit_fruiting_gbm as gbm


def _strata(n, response, seed=0):
    """n strata of 5 days; the find day is drawn with odds exp(response(x)), and put in slot 0."""
    rng = np.random.default_rng(seed)
    x = rng.uniform(-2, 2, size=(n, 5, 1))
    logits = response(x[..., 0])
    p = np.exp(logits - logits.max(1, keepdims=True))
    p /= p.sum(1, keepdims=True)
    chosen = np.array([rng.choice(5, p=row) for row in p])
    order = np.array([[c] + [j for j in range(5) if j != c] for c in chosen])
    return x[np.arange(n)[:, None], order], np.ones((n, 5), bool)


def test_the_objective_is_the_gradient_of_the_stratum_softmax():
    sizes = np.array([5, 3, 4])
    preds = np.random.default_rng(1).normal(size=sizes.sum())
    label = np.zeros(sizes.sum())
    label[np.r_[0, np.cumsum(sizes)[:-1]]] = 1.0                    # the find day leads each stratum

    def loss(f):
        starts = np.r_[0, np.cumsum(sizes)[:-1]]
        return -sum(f[s] - np.log(np.exp(f[s:s + k]).sum()) for s, k in zip(starts, sizes))

    grad, hess = gbm.clogit_objective(sizes)(preds, label)
    numeric = np.array([(loss(preds + e) - loss(preds - e)) / 2e-6 for e in np.eye(len(preds)) * 1e-6])
    assert np.allclose(grad, numeric, atol=1e-5)
    assert np.all(hess > 0)


def test_an_optimum_a_linear_index_cannot_express_is_learned():
    def response(x):
        return -3.0 * (x - 0.5) ** 2                                   # best at 0.5, worse either side
    x, mask = _strata(3000, response)
    model = gbm.fit(x, mask, rounds=150)
    test_x, test_mask = _strata(1000, response, seed=2)
    rank = gbm.find_day_rank(gbm.predict(model, test_x), test_mask).mean()
    assert rank > 0.68                                                # a linear index on x sits near 0.5


def test_missing_days_are_left_out_of_their_stratum():
    x, mask = _strata(2000, lambda v: 1.5 * v, seed=3)
    mask[:, 3:] = False
    x[:, 3:] = 99.0                                                    # values on missing days must not matter
    model = gbm.fit(x, mask, rounds=100)
    test_x, test_mask = _strata(800, lambda v: 1.5 * v, seed=4)
    assert gbm.find_day_rank(gbm.predict(model, test_x), test_mask).mean() > 0.65


def test_early_stopping_on_held_out_strata_stops_where_there_is_nothing_to_learn():
    x, mask = _strata(2000, lambda v: 0.0 * v, seed=5)               # find day independent of x
    valid_x, valid_mask = _strata(600, lambda v: 0.0 * v, seed=6)
    model = gbm.fit(x, mask, rounds=400, valid=(valid_x, valid_mask))
    assert model.best_iteration < 100
    x, mask = _strata(2000, lambda v: 1.5 * v, seed=7)               # and keeps going where there is
    valid_x, valid_mask = _strata(600, lambda v: 1.5 * v, seed=8)
    assert gbm.fit(x, mask, rounds=400, valid=(valid_x, valid_mask)).best_iteration > 50
