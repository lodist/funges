"""A species' model fades from one region's into its neighbour's across the band between them,
so the map no longer jumps where the regions' place lists meet."""
from types import SimpleNamespace

import numpy as np
import pandas as pd
import pytest

import forecast_pipeline as fp
from species_registry import get_species_params


def test_weight_runs_across_the_band():
    lon = np.array([-106.0, -100.0, -94.0])
    assert fp.own_settings_weight("USE", np.zeros(3), lon) == pytest.approx([0, 0.5, 1])
    assert fp.own_settings_weight("USW", np.zeros(3), lon) == pytest.approx([1, 0.5, 0])
    # Kentucky is on US West's list of places but takes US East's model, as Indiana does
    assert fp.own_settings_weight("USW", np.array([37.6]), np.array([-85.0]))[0] == 0
    assert fp.own_settings_weight("USE", np.array([39.3]), np.array([-86.0]))[0] == 1
    assert fp.own_settings_weight("USW", np.array([45.0]), np.array([-120.0]))[0] == 1


def _rows():
    return pd.DataFrame({
        "Latitude": [37.6, 45.0, 37.6], "Longitude": [-85.0, -120.0, -100.0],
        "Temperature (C)": [15.0] * 3, "Humidity (%)": [80.0] * 3,
        "TotalPrecipitation_mm": [5.0] * 3, "Wind Speed (m/s)": [1.0] * 3,
        "Elevation (m)": [200.0] * 3, "ph_level": [6.5] * 3,
        "dist_m_water": [100.0] * 3, "dist_m_sea": [1e5] * 3,
        "climate_zone": ["temperate"] * 3, "Date": pd.to_datetime(["2026-08-20"] * 3),
    })


def test_kentucky_scores_with_us_east_and_the_west_keeps_its_own():
    west, east = get_species_params("USW"), get_species_params("USE")
    assert west["wild-mint"] != east["wild-mint"]
    mine = {"wild-mint": west["wild-mint"]}
    scored = fp.calculate_mushroom_score(_rows(), mine, {})
    blended = fp.blend_neighbour_settings(scored.copy(), mine, SimpleNamespace(region="USW"),
                                          neighbour=({"wild-mint": east["wild-mint"]}, {}))
    as_east = fp.calculate_mushroom_score(_rows(), {"wild-mint": east["wild-mint"]}, {})["wild-mint_score"]
    got = blended["wild-mint_score"]
    assert got.iloc[0] == pytest.approx(as_east.iloc[0])                                         # Kentucky
    assert got.iloc[1] == pytest.approx(scored["wild-mint_score"].iloc[1])                       # Oregon
    assert got.iloc[2] == pytest.approx((scored["wild-mint_score"].iloc[2] + as_east.iloc[2]) / 2)  # on the split


def test_species_only_one_region_scores_keep_their_own():
    west = get_species_params("USW")
    mine = {"wild-mint": west["wild-mint"]}
    scored = fp.calculate_mushroom_score(_rows(), mine, {})
    blended = fp.blend_neighbour_settings(scored.copy(), mine, SimpleNamespace(region="USW"), neighbour=({}, {}))
    assert blended["wild-mint_score"].tolist() == pytest.approx(scored["wild-mint_score"].tolist())


def test_a_place_across_the_split_takes_the_neighbours_habitat_factor():
    """Each region's habitat factor also lists its neighbour's places, so a place scored with the
    neighbour's model takes the neighbour's factor, as the places on the other side of the line do."""
    west, east = get_species_params("USW"), get_species_params("USE")
    rows = _rows().assign(Location_Id=["ky", "or", "split"])
    ids = pd.Index(["ky", "or", "split"])
    mine = {"wild-mint": {**west["wild-mint"], "habitat": {"index": ids, "factor": np.array([0.9, 0.9, 0.9])}}}
    theirs = {"wild-mint": {**east["wild-mint"], "habitat": {"index": ids, "factor": np.array([0.5, 0.5, 0.5])}}}
    scored = fp.calculate_mushroom_score(rows.copy(), mine, {})
    blended = fp.blend_neighbour_settings(scored.copy(), mine, SimpleNamespace(region="USW"), neighbour=(theirs, {}))
    as_east = fp.calculate_mushroom_score(rows.copy(), {"wild-mint": east["wild-mint"]}, {})["wild-mint_score"]
    assert blended["wild-mint_score"].iloc[0] == pytest.approx(0.5 * as_east.iloc[0])


def test_europe_fades_along_where_its_lists_meet():
    """North and South Europe's lists meet along borders, not a parallel: half each where they
    meet, the place's own model from BAND_KM inside its list, continuous across."""
    north = np.array([[52.0, lon] for lon in np.arange(6.0, 9.0, 0.1)])       # own list, east of 6 E
    south = np.array([[52.0, lon] for lon in np.arange(3.0, 5.95, 0.1)])      # neighbour's, west of it
    lat = np.full(3, 52.0)
    lon = np.array([5.95, 6.0 + fp.BAND_KM / (111.2 * np.cos(np.radians(52.0))), 4.0])
    w = fp.own_settings_weight("NE", lat, lon, (north, south))
    assert w[0] == pytest.approx(0.5, abs=0.02)      # where the lists meet
    assert w[1] == pytest.approx(1.0, abs=0.02)      # BAND_KM inside its own list
    assert w[2] == 0                                 # deep in the neighbour's
    mirrored = fp.own_settings_weight("SE", lat[:1], lon[:1], (south, north))
    assert w[0] + mirrored[0] == pytest.approx(1.0)  # the two runs agree at the meeting point
