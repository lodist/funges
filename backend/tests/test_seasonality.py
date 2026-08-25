import pandas as pd

from funges_backend.seasonality import (
    empirical_season_multiplier,
    season_months_ramp,
    season_multiplier_for_species,
)


def _dates(*iso):
    return pd.Series(pd.to_datetime(list(iso)))


def test_empirical_multiplier_hits_curve_value_at_month_midpoint():
    # Month midpoints are day-of-year 15,46,74,... ; Jan midpoint = Jan 15.
    curve = dict.fromkeys(range(1, 13), 0.8)
    curve[1] = 1.2
    out = empirical_season_multiplier(_dates("2026-01-15"), curve)
    assert abs(out[0] - 1.2) < 1e-9


def test_empirical_multiplier_interpolates_between_midpoints():
    curve = dict.fromkeys(range(1, 13), 0.0)
    curve[6] = 1.0  # Jun midpoint doy=166
    curve[7] = 0.0  # Jul midpoint doy=196
    # A date between Jun15 and Jul15 should fall strictly between the two values.
    out = empirical_season_multiplier(_dates("2026-07-01"), curve)  # doy=182
    assert 0.0 < out[0] < 1.0


def test_empirical_multiplier_wraps_dec_to_jan_continuously():
    curve = dict.fromkeys(range(1, 13), 0.5)
    curve[12] = 1.0
    curve[1] = 1.0
    # Dec 31 (doy 365) sits between Dec midpoint and Jan midpoint; both are 1.0,
    # so the wrapped interpolation stays at 1.0 with no seam.
    out = empirical_season_multiplier(_dates("2026-12-31"), curve)
    assert abs(out[0] - 1.0) < 1e-6


def test_season_months_ramp_is_one_in_season_and_floors_off_season():
    params = {"season_months": [6, 7, 8], "season_factor": 0.5}
    out = season_months_ramp(_dates("2026-07-15", "2026-01-15"), params)
    assert abs(out[0] - 1.0) < 1e-9          # July in season
    assert abs(out[1] - 0.5) < 1e-9          # deep off-season hits the floor


def test_multiplier_precedence_zone_over_region():
    df = pd.DataFrame({
        "Date": pd.to_datetime(["2026-06-15", "2026-06-15"]),
        "climate_zone": ["continental", "temperate"],
    })
    params = {"season_curve": dict.fromkeys(range(1, 13), 0.9)}
    zone_curves = {"continental": {"mushroom": dict.fromkeys(range(1, 13), 0.3)}}
    out = season_multiplier_for_species(df, "mushroom", params, zone_curves)
    assert abs(out[0] - 0.3) < 1e-9          # continental row uses zone curve
    assert abs(out[1] - 0.9) < 1e-9          # temperate row falls back to region curve


def test_multiplier_falls_back_to_season_months_when_no_curves():
    df = pd.DataFrame({
        "Date": pd.to_datetime(["2026-07-15"]),
        "climate_zone": ["continental"],
    })
    params = {"season_months": [7], "season_factor": 0.5}
    out = season_multiplier_for_species(df, "garlic", params, zone_curves={})
    assert abs(out[0] - 1.0) < 1e-9


def test_multiplier_defaults_to_one_when_nothing_defined():
    df = pd.DataFrame({
        "Date": pd.to_datetime(["2026-07-15"]),
        "climate_zone": ["continental"],
    })
    out = season_multiplier_for_species(df, "garlic", params={}, zone_curves={})
    assert abs(out[0] - 1.0) < 1e-9
