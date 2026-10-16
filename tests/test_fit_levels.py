import numpy as np
import pandas as pd

import forecast_pipeline as fp
from build_fit_levels import to_index


def _maps():
    eta = np.linspace(-3, 3, 101)
    part = np.concatenate([np.zeros(20), np.linspace(0.0, 0.95, 81)])   # a dry month's zeros, then rising
    return [{"eta": eta.tolist(), "weather_part": part.tolist()} for _ in range(12)]


def test_to_index_takes_the_hand_set_part_back_through_the_map():
    dates = pd.Series(pd.to_datetime(["2026-01-03", "2026-05-20", "2026-09-15"]))
    eta = np.array([-1.0, 0.5, 2.0])
    part = fp._monthly_map(eta, dates, _maps())
    assert np.allclose(to_index(part, dates, _maps()), eta, atol=1e-6)
    assert np.isfinite(to_index(np.zeros(3), dates, _maps())).all()     # inside the dry plateau


def test_fit_level_offset_blends_months_and_is_zero_where_there_is_none():
    offset = np.zeros((12, 2, 2), np.float32)
    offset[0], offset[1] = 1.0, 3.0
    offset[:, 1, 1] = np.nan
    level = {"lat": np.array([50.0, 49.75]), "lon": np.array([10.0, 10.25]), "offset": offset}
    df = pd.DataFrame({"Latitude": [50.0, 50.0, 49.75, 40.0], "Longitude": [10.0, 10.0, 10.25, 10.0],
                       "Date": pd.to_datetime(["2026-01-15", "2026-01-30", "2026-01-15", "2026-01-15"])})
    shift = fp.fit_level_offset(level, df)
    assert shift[0] == 1.0                     # mid-January is January's
    assert 1.0 < shift[1] < 3.0                # late January leans to February
    assert shift[2] == 0.0 and shift[3] == 0.0  # none for that cell; off the grid


def test_attach_fit_levels_takes_the_model_the_species_scores_with(tmp_path):
    grid = {"lat": np.array([50.0, 49.75]), "lon": np.array([10.0, 10.25])}
    stored = np.full((12, 2, 2), fp.FIT_LEVEL_NONE, np.int16)
    stored[:, 0, 0] = 150
    np.savez_compressed(tmp_path / "fit_levels_EU.npz", **grid, **{"porcini.NE.gbm": stored, "nettle.NE.linear": stored})
    model = {"map": []}
    params = {"porcini": {"fruiting_gbm": model, "fruiting": model}, "nettle": {}, "parasol": {"fruiting": model}}
    fp.attach_fit_levels(params, "NE", folder=tmp_path)
    assert params["porcini"]["fit_level"]["offset"][3, 0, 0] == 1.5
    assert np.isnan(params["porcini"]["fit_level"]["offset"][3, 1, 1])
    assert "fit_level" not in params["nettle"] and "fit_level" not in params["parasol"]
