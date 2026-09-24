"""Range priors: GBIF tile decoding, the share maths, and the scoring lookup."""
import numpy as np
import pandas as pd

import build_range_priors as brp
import forecast_pipeline as fp
from range_prior import load_range_priors, range_prior_for_species


def _varint(n):
    out = bytearray()
    while True:
        out.append((n & 0x7F) | (0x80 if n > 0x7F else 0))
        n >>= 7
        if not n:
            return bytes(out)


def _field(num, payload):
    return _varint(num << 3 | 2) + _varint(len(payload)) + payload


def _zz(n):
    return (n << 1) ^ (n >> 63)


def test_decodes_multipoint_features_with_their_total():
    feature = (_field(2, _varint(0) + _varint(0))  # tags: total = values[0]
               + _field(4, b"".join(_varint(v) for v in (2 << 3 | 1, _zz(10), _zz(20), _zz(5), _zz(-3)))))
    value = _varint(5 << 3) + _varint(7)  # uint_value = 7
    layer = (_field(1, b"occurrence") + _field(2, feature) + _field(3, b"total")
             + _field(4, value) + _varint(5 << 3) + _varint(512))
    assert list(brp.decode_points(_field(3, layer))) == [(10, 20, 7, 512), (15, 17, 7, 512)]


def test_share_separates_absence_from_no_evidence():
    background = np.array([5000.0, 5000.0, 0.0, 5000.0])
    target = np.array([50.0, 0.0, 0.0, 5.0])  # core, well-observed absence, unsampled, sparse
    prior = brp.range_prior(target, background)
    core, absent, unsampled, sparse = prior
    assert core > 0.99
    assert absent < 0.1
    assert absent < sparse < core
    assert unsampled > absent  # no observations is not evidence of absence


def test_smoothing_keeps_record_counts():
    macro = {"lat": (40.0, 50.0), "lon": (0.0, 20.0)}
    grid = np.zeros(brp.grid_shape(macro))
    grid[50, 100] = 10.0
    smoothed = brp.smooth_counts(grid, brp.lat_centers(macro))
    # Kernel-weighted counts: the peak equals the records at the centre, not their average.
    assert abs(smoothed[50, 100] - 10.0) < 0.5


def test_published_grid_round_trips_into_scoring():
    macro = {"lat": (40.0, 41.0), "lon": (10.0, 11.0)}
    grid = np.ones(brp.grid_shape(macro))
    grid[:, :5] = 0.0  # western half: well observed, species absent
    priors = load_range_priors(brp.to_npz(macro, {"amaranth": grid}))
    rows = pd.DataFrame({"Latitude": [40.5, 40.5, 60.0, np.nan],
                         "Longitude": [10.2, 10.8, 10.5, 10.5]})
    got = range_prior_for_species(rows, {"range_prior": priors["amaranth"]})
    assert got.tolist() == [0.0, 1.0, 1.0, 1.0]  # outside the grid / no coordinate -> no evidence
    assert range_prior_for_species(rows, {}) == 1.0


def test_score_is_scaled_by_the_prior():
    from _phase2_fixture import species_params

    params = species_params()["sp_curve"]
    rows = pd.DataFrame({
        "Latitude": [40.5, 40.5], "Longitude": [10.2, 10.8],
        "Temperature (C)": [11.0, 11.0], "Humidity (%)": [80.0, 80.0],
        "TotalPrecipitation_mm": [5.0, 5.0], "Wind Speed (m/s)": [1.0, 1.0],
        "Elevation (m)": [1200.0, 1200.0], "ph_level": [6.5, 6.5],
        "dist_m_water": [100.0, 100.0], "dist_m_sea": [100.0, 100.0],
        "climate_zone": ["temperate", "temperate"], "Date": pd.to_datetime(["2026-06-13"] * 2),
    })
    grid = np.full((10, 10), 255, dtype=np.uint8)
    grid[:, :5] = 0
    with_prior = dict(params, range_prior={"lat0": 40.0, "lon0": 10.0, "step": 0.1, "grid": grid})
    scored = fp.calculate_mushroom_score(rows.copy(), {"sp": with_prior}, {})
    plain = fp.calculate_mushroom_score(rows.copy(), {"sp": params}, {})
    assert scored["sp_score"].iloc[0] == 0.0
    assert scored["sp_score"].iloc[1] == plain["sp_score"].iloc[1] > 0
