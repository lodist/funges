"""Huerta's garden rules on made-up places (one year of climate each), and the area files."""
import json

import numpy as np
import pandas as pd

import huerta

CROPS = pd.DataFrame([
    # crop, frost, soil_min, soil_max, night, days, hardy_to, season
    ("tomato", "tender", 16, np.nan, 10, 70, np.nan, np.nan),
    ("garlic", "hardy", 7, 15, np.nan, 240, -20, np.nan),
    ("peas", "hardy", 4, 24, np.nan, 65, np.nan, np.nan),
    ("tulip", "hardy", 2, 15, np.nan, 150, -35, "autumn"),
    ("asparagus", "hardy", 10, 29, np.nan, 30, -35, "spring"),
], columns=["crop", "frost", "soil_min", "soil_max", "night", "days", "hardy_to", "season"])


def place(**k):
    row = dict(frost3=10.0, soil3=10.0, night7=12.0, last0_2016=0, first0_2016=0, lastm3_2016=0,
               firstm3_2016=0, warm10_start=120, warm10_end=280, winter_low=-2.0)
    row.update(k)
    return row


def test_rules():
    places = pd.DataFrame([
        place(last0_2016=120, soil3=18),                                       # spring, frost still to come
        place(first0_2016=300, frost3=0, soil3=18),                            # autumn: frost tonight, season over
        place(warm10_start=130, warm10_end=320, soil3=20, night7=14),          # frost-free, warm nights end soon
        place(soil3=8, firstm3_2016=300, winter_low=-15),                      # cold autumn: garlic yes, peas no
        place(soil3=20),                                                       # too warm for garlic yet
        place(soil3=4),                                                        # soil already too cold for garlic
    ])
    spring = huerta.advise(places.iloc[:1], CROPS, 100)
    autumn = huerta.advise(places.iloc[1:], CROPS, 290)
    assert spring["tomato"].tolist() == ["wait_frost"]
    assert autumn["tomato"].tolist()[:2] == ["too_late", "too_late"]           # no October tomatoes, even frost-free
    assert autumn["garlic"].tolist()[2:] == ["now", "too_warm", "too_late"]
    assert autumn["peas"].tolist()[2] == "too_late"
    # Bulbs go in only in autumn, asparagus crowns only in spring, whatever the soil says.
    assert spring["tulip"].tolist() == ["wait_autumn"] and spring["asparagus"].tolist() == ["now"]
    assert autumn["tulip"].tolist()[2:] == ["now", "too_warm", "now"]
    assert set(autumn["asparagus"]) == {"wait_spring"}


def test_area_files_group_places_by_square_with_one_letter_per_crop():
    places = pd.DataFrame({
        "Location_Id": ["Ciudad Lineal_40.440_-3.675", "Getafe_40.300_-3.750", "Toledo_39.860_-4.020"],
        "Latitude": [40.44, 40.30, 39.86], "Longitude": [-3.675, -3.75, -4.02],
        "frost3": [9.2, 1.5, -0.5], "soil3": [13.44, 12.0, np.nan], "night7": [8.5, 7.0, 6.0],
        "rain7": [4.0, 20.0, 1.0], "et07": [14.4, 10.0, 12.0],
        "last0_median": [81, 0, 95], "first0_median": [361, 0, 330],
    })
    advice = pd.DataFrame({"garlic": ["now", "too_warm", "now"], "tomato": ["too_late", "too_late", "not_here"]})
    files = huerta.area_files(places, advice, "2026-10-20")
    assert sorted(files) == ["39_-5.json", "40_-4.json"]
    madrid = json.loads(files["40_-4.json"])
    assert madrid["day"] == "2026-10-20" and madrid["crops"] == ["garlic", "tomato"]
    assert madrid["places"][0] == ["Ciudad Lineal", 40.44, -3.675, "", 13.4, 8.5, 4.0, 10.0, "nl", 81, 361]
    assert madrid["places"][1][9:] == [None, None]                                 # no frost in a typical year
    assert madrid["places"][1][3] == "g" and madrid["places"][1][7] == 0.0       # ground frost; rain beat evaporation
    toledo = json.loads(files["39_-5.json"])["places"][0]
    assert toledo[3] == "f" and toledo[4] is None and toledo[8] == "nx"         # frost; no soil reading


def test_crop_needs_say_what_each_crop_wants():
    needs = json.loads(huerta.crop_needs(CROPS))
    assert needs["tomato"] == {"soil": [16, None], "night": 10}
    assert needs["garlic"] == {"soil": [7, 15], "night": None}
