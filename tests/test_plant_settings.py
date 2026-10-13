"""A part of a plant's score that a manifest switches off no longer moves it."""


def test_a_part_switched_off_in_the_manifest_does_not_count():
    """temp_weight 0 (as rain_weight 0 already does for rain): the temperature no longer moves the score."""
    import pandas as pd
    import forecast_pipeline as fp
    from species_registry import get_species_params
    rows = pd.DataFrame({
        "Latitude": [45.0, 45.0], "Longitude": [-120.0, -120.0], "Temperature (C)": [15.0, 35.0],
        "Humidity (%)": [70.0, 70.0], "TotalPrecipitation_mm": [5.0, 5.0], "Wind Speed (m/s)": [1.0, 1.0],
        "Elevation (m)": [300.0, 300.0], "ph_level": [6.5, 6.5], "dist_m_water": [100.0, 100.0],
        "dist_m_sea": [1e5, 1e5], "climate_zone": ["temperate"] * 2, "Date": pd.to_datetime(["2026-08-20"] * 2)})
    params = {**get_species_params("USW")["nettle"], "season_months": list(range(1, 13)), "temp_weight": 1.75}
    on = fp.calculate_mushroom_score(rows.copy(), {"nettle": params}, {})["nettle_score"]
    off = fp.calculate_mushroom_score(rows.copy(), {"nettle": {**params, "temp_weight": 0}}, {})["nettle_score"]
    assert on.iloc[0] != on.iloc[1]
    assert off.iloc[0] == off.iloc[1]
