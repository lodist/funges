import numpy as np

from scripts import generate_huerta_now


def test_an_area_counts_once_where_any_place_in_it_says_now():
    # Two places in the same 0.5° cell, one in the next cell north.
    places = np.array([[4010, -360], [4020, -370], [4060, -360]], "<i2")
    codes = {
        "garlic": np.frombuffer(b"nnl", np.uint8),
        "tomato": np.frombuffer(b"lln", np.uint8),
        "melon": np.frombuffer(b"xxx", np.uint8),
    }

    areas = generate_huerta_now.areas_now(places, codes)

    assert {crop: len(cells) for crop, cells in areas.items()} == {
        "garlic": 1,
        "tomato": 1,
        "melon": 0,
    }
    assert areas["garlic"].isdisjoint(areas["tomato"])
