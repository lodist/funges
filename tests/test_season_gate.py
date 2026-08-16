"""The season gate is the only part of the model allowed to say "not this month"."""
import numpy as np
import pandas as pd
import pytest

import forecast_pipeline as fp
import seasonality as sn

# Chanterelle-shaped signal: dead in winter, peak in July.
RATIO = {1: 0.04, 2: 0.0, 3: 0.0, 4: 0.0, 5: 0.05, 6: 0.38,
         7: 1.0, 8: 0.78, 9: 0.45, 10: 0.22, 11: 0.17, 12: 0.13}
MULTIPLIER = {m: round(0.2 + 0.8 * v, 3) for m, v in RATIO.items()}
TWO_PART = {"multiplier": MULTIPLIER, "ratio": RATIO}


def _frame(dates, zone="temperate"):
    return pd.DataFrame({"Date": pd.to_datetime(dates), "climate_zone": [zone] * len(dates)})


def test_old_flat_curve_schema_still_loads():
    multiplier, ratio = sn.split_curve(MULTIPLIER)
    assert multiplier[7] == pytest.approx(1.0)
    assert ratio is None  # a legacy curve cannot drive a gate
    multiplier, ratio = sn.split_curve(TWO_PART)
    assert multiplier[7] == pytest.approx(1.0)
    assert ratio[7] == pytest.approx(1.0)


def test_gate_closes_in_dead_months_and_opens_at_peak():
    frame = _frame(["2026-03-15", "2026-07-15"])
    gate = sn.season_gate_for_species(frame, "chant", {"season_curve": TWO_PART}, {})
    assert gate[0] == pytest.approx(0.0)   # March: ratio 0.0
    assert gate[1] == pytest.approx(1.0)   # July: peak


def test_gate_ramps_rather_than_switching():
    """A month between GATE_OFF and GATE_FULL is partly open, so shoulders stay smooth."""
    ratio = dict.fromkeys(range(1, 13), 0.0)
    ratio[6] = (sn.GATE_OFF + sn.GATE_FULL) / 2
    ratio[7] = 1.0
    frame = _frame(["2026-06-15"])
    gate = sn.season_gate_for_species(frame, "x", {"season_curve": {"multiplier": ratio, "ratio": ratio}}, {})
    assert 0.2 < gate[0] < 0.8


def test_zone_curve_overrides_region_curve_for_the_gate():
    dead_in_july = {m: (1.0 if m == 1 else 0.0) for m in range(1, 13)}
    zone_curves = {"alpine": {"chant": {"multiplier": dead_in_july, "ratio": dead_in_july}}}
    params = {"season_curve": TWO_PART}
    frame = pd.DataFrame({
        "Date": pd.to_datetime(["2026-07-15", "2026-07-15"]),
        "climate_zone": ["temperate", "alpine"],
    })
    gate = sn.season_gate_for_species(frame, "chant", params, zone_curves)
    assert gate[0] == pytest.approx(1.0)   # region curve: July is peak
    assert gate[1] == pytest.approx(0.0)   # alpine zone curve: July is dead


def test_gate_falls_back_to_season_months_without_a_ratio():
    params = {"season_months": [7, 8], "season_curve": MULTIPLIER}  # legacy curve, no ratio
    frame = _frame(["2026-01-15", "2026-07-15"])
    gate = sn.season_gate_for_species(frame, "chant", params, {})
    assert gate[0] == pytest.approx(sn.SEASON_MONTHS_GATE_FLOOR)
    assert gate[1] == pytest.approx(1.0)


def test_species_with_no_season_information_is_never_gated():
    frame = _frame(["2026-01-15", "2026-07-15"])
    gate = sn.season_gate_for_species(frame, "unknown", {}, {})
    assert np.allclose(gate, 1.0)


def test_multiplier_still_falls_back_when_a_species_has_no_curve():
    params = {"season_months": [7, 8], "season_factor": 0.5}
    frame = _frame(["2026-01-15", "2026-07-15"])
    multiplier = sn.season_multiplier_for_species(frame, "chant", params, {})
    assert multiplier[0] == pytest.approx(0.5)
    assert multiplier[1] == pytest.approx(1.0)


def test_dead_month_score_stays_below_the_recommendation_threshold():
    """The invariant the publish layer relies on, so it needs no season logic of its own.

    Perfect weather in a dead month must not clear MIN_SCORE (4.0 in
    scripts/generate_worth_foraging_now.py).
    """
    rows = 2
    data = {
        "Date": pd.to_datetime(["2026-03-15", "2026-07-15"]),
        "climate_zone": ["temperate"] * rows,
        "Latitude": [60.0] * rows, "Longitude": [24.0] * rows,
        "Elevation (m)": [100.0] * rows, "ph_level": [6.0] * rows,
        "dist_m_water": [500.0] * rows, "dist_m_sea": [50_000.0] * rows,
        "TotalPrecipitation_mm": [4.0] * rows, "Temperature (C)": [16.0] * rows,
        "Humidity (%)": [85.0] * rows, "Wind Speed (m/s)": [2.0] * rows,
    }
    for day in range(1, 43):
        data[f"TotalPrecipitation_mm_{day}days_ago"] = [4.0] * rows
        data[f"Temperature (C)_{day}days_ago"] = [16.0] * rows
        data[f"Humidity (%)_{day}days_ago"] = [85.0] * rows
        data[f"Wind Speed (m/s)_{day}days_ago"] = [2.0] * rows
    params = {"chant": {
        "optimal_temp": 16, "temp_sigma": 5, "optimal_humidity": 85, "humidity_sigma": 12,
        "optimal_alt": 100, "alt_sigma": 400, "optimal_pH": 6.0,
        "pH_sigma_near": 0.6, "pH_sigma_far": 1.2, "pH_range_near": (5.5, 6.5),
        "min_cumulative_rain": 35, "climate_zones": ["temperate"],
        "season_months": [7, 8], "season_curve": TWO_PART,
    }}
    scored = fp.calculate_mushroom_score(pd.DataFrame(data), params, {})
    dead, peak = scored["chant_score"].to_numpy()
    assert peak > 4.0, f"good weather in peak season should score well, got {peak:.2f}"
    assert dead < 4.0, f"dead month must stay under the recommendation threshold, got {dead:.2f}"
