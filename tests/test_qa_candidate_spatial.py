from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from scripts.qa_candidate_spatial import (
    apply_parameter_overrides,
    candidate_components,
    deep_merge,
    merge_candidate_features,
    spatial_block_folds,
)
from scripts.qa_weather_skill import decompose


def test_deep_merge_does_not_mutate_base() -> None:
    base = {"weather_preference": {"rain_first": False}, "optimal_alt": 800}
    merged = deep_merge(base, {"weather_preference": {"rain_first": True}})
    assert merged["weather_preference"]["rain_first"] is True
    assert base["weather_preference"]["rain_first"] is False
    assert merged["optimal_alt"] == 800


def test_parameter_overrides_apply_global_then_region() -> None:
    params = {"chant": {"optimal_alt": 800, "alt_sigma": 1000}}
    candidate = {
        "parameter_overrides": {
            "species": {"chant": {"alt_sigma": 900}},
            "regions": {"NE": {"species": {"chant": {"optimal_alt": 200}}}},
        }
    }
    assert apply_parameter_overrides(params, candidate, "NE")["chant"] == {
        "optimal_alt": 200,
        "alt_sigma": 900,
    }
    assert apply_parameter_overrides(params, candidate, "SE")["chant"] == {
        "optimal_alt": 800,
        "alt_sigma": 900,
    }


def test_spatial_blocks_are_stable_and_keep_cells_together() -> None:
    lat = pd.Series([60.1, 60.9, 62.1])
    lon = pd.Series([24.1, 24.9, 24.1])
    folds = spatial_block_folds(lat, lon, folds=5, block_degrees=2.0)
    assert folds[0] == folds[1]
    assert np.array_equal(folds, spatial_block_folds(lat, lon, folds=5, block_degrees=2.0))


def test_feature_merge_requires_unique_location_keys() -> None:
    frame = pd.DataFrame({"Location_Id": ["a", "a", "b"], "Date": [1, 2, 1]})
    features = pd.DataFrame({"Location_Id": ["a", "b"], "host": [0.8, 0.2]})
    merged = merge_candidate_features(frame, features)
    assert merged.host.tolist() == [0.8, 0.8, 0.2]

    duplicate = pd.concat([features, features.iloc[[0]]], ignore_index=True)
    with pytest.raises(ValueError, match="duplicate keys"):
        merge_candidate_features(frame, duplicate)


def test_candidate_component_requires_explicit_missing_value() -> None:
    frame = pd.DataFrame({"chant_host": [0.8, np.nan]})
    candidate = {
        "components": {
            "Host": {
                "species_columns": {"chant": "chant_host"},
                "weight": 0.75,
            }
        }
    }
    with pytest.raises(ValueError, match="missing values"):
        candidate_components(frame, candidate, "chant")
    candidate["components"]["Host"]["missing_value"] = 0.4
    values, weight = candidate_components(frame, candidate, "chant")["Host"]
    assert values.tolist() == [0.8, 0.4]
    assert weight == 0.75


def test_candidate_component_is_included_in_recomputed_full_score() -> None:
    frame = pd.DataFrame(
        {
            "Location_Id": ["a", "b"],
            "Date": pd.to_datetime(["2026-07-01", "2026-07-01"]),
            "Latitude": [60.0, 61.0],
            "Longitude": [24.0, 25.0],
            "Temperature (C)": [14.0, 14.0],
            "Humidity (%)": [85.0, 85.0],
            "TotalPrecipitation_mm": [3.0, 3.0],
            "Wind Speed (m/s)": [2.0, 2.0],
            "Elevation (m)": [300.0, 300.0],
            "ph_level": [6.0, 6.0],
            "dist_m_water": [1000.0, 1000.0],
            "dist_m_sea": [1000.0, 1000.0],
            "climate_zone": ["temperate", "temperate"],
        }
    )
    params = {
        "chant": {
            "optimal_temp": 14.0,
            "temp_sigma": 6.0,
            "optimal_alt": 300.0,
            "alt_sigma": 500.0,
            "optimal_humidity": 85.0,
            "humidity_sigma": 15.0,
            "optimal_pH": 6.0,
            "pH_sigma_near": 0.5,
            "pH_sigma_far": 1.5,
            "pH_range_near": (5.0, 7.0),
            "min_cumulative_rain": 20.0,
            "weather_preference": {"rain_first": False},
            "water_relevance": False,
            "sea_relevance": False,
            "wind_sensitive": False,
            "season_months": [7],
        }
    }
    baseline = decompose(frame, "chant", params, {})
    candidate = decompose(
        frame,
        "chant",
        params,
        {},
        candidate_components={"Host": (np.array([0.1, 1.0]), 1.0)},
    )
    assert candidate.loc[0, "full_score"] < baseline.loc[0, "full_score"]
    assert candidate.loc[1, "full_score"] > baseline.loc[1, "full_score"]
    assert candidate.loc[0, "static_part"] < candidate.loc[1, "static_part"]
