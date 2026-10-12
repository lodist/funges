"""The plant settings search moves one setting at a time and keeps the ones tied to it in step."""
import fit_plant_settings as fps


def test_temperature_drags_its_soil_optimum_and_limits_along():
    today = {"optimal_temp": 18, "optimal_soil_temp": 17, "min_temp": 0, "max_temp": 30, "optimal_pH": 6.2,
             "pH_range_near": [4.7, 7.7]}
    moved = fps.with_value(today, "optimal_temp", 22)
    assert (moved["optimal_temp"], moved["optimal_soil_temp"], moved["min_temp"], moved["max_temp"]) == (22, 21, 4, 34)
    assert today["optimal_temp"] == 18                       # today's settings untouched


def test_ph_moves_its_range_with_it():
    moved = fps.with_value({"optimal_pH": 6.2, "pH_range_near": [4.7, 7.7]}, "optimal_pH", 5.0)
    assert moved["optimal_pH"] == 5.0
    assert moved["pH_range_near"] == [3.5, 6.5]


def test_the_search_always_offers_todays_value():
    assert 13 in fps.candidates("optimal_temp", 13)
    assert 37 in fps.candidates("min_cumulative_rain", 37)
