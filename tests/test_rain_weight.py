"""A species' rain_weight: how much recent rain counts in its score."""
import pandas as pd

import forecast_pipeline as fp
from _phase2_fixture import species_params


def _dry_day():
    # No lag columns and no rain today: the rain term sits at its floor.
    return pd.DataFrame({
        "Latitude": [40.5], "Longitude": [10.2],
        "Temperature (C)": [11.0], "Humidity (%)": [80.0],
        "TotalPrecipitation_mm": [0.0], "Wind Speed (m/s)": [1.0],
        "Elevation (m)": [1200.0], "ph_level": [6.5],
        "dist_m_water": [100.0], "dist_m_sea": [100.0],
        "climate_zone": ["temperate"], "Date": pd.to_datetime(["2026-06-13"]),
    })


def _score(params):
    return fp.calculate_mushroom_score(_dry_day(), {"sp": params}, {})["sp_score"].iloc[0]


def test_rain_weight_defaults_to_the_fungi_weighting_and_zero_drops_rain():
    params = species_params()["sp_curve"]
    default = _score(params)
    assert default == _score(dict(params, rain_weight=1.5))  # omitted: every species as before
    assert _score(dict(params, rain_weight=0)) > _score(dict(params, rain_weight=0.3)) > default
