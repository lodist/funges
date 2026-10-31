"""Huerta's garden rules on made-up places (one year of climate each), and the area files."""
import base64
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
    row = dict(frost3=10.0, frostw=10.0, soil3=10.0, night7=12.0, last0_2016=0, first0_2016=0, lastm3_2016=0,
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
    # A frost later in the week holds back tender crops, not hardy ones.
    warm = pd.DataFrame([place(warm10_start=100, warm10_end=300, soil3=20, night7=14, frostw=-1.0)])
    week = huerta.advise(warm, CROPS, 160)
    assert week["tomato"].tolist() == ["wait_frost"] and week["peas"].tolist() == ["now"]
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
        "frostw": [5.0, 1.5, -2.0], "frostw_night": [None, "2026-10-24", "2026-10-25"],
    })
    advice = pd.DataFrame({"garlic": ["now", "too_warm", "now"], "tomato": ["too_late", "too_late", "not_here"]})
    files = huerta.area_files(places, advice, "2026-10-20")
    assert sorted(files) == ["39_-5.json", "40_-4.json"]
    madrid = json.loads(files["40_-4.json"])
    assert madrid["day"] == "2026-10-20" and madrid["crops"] == ["garlic", "tomato"]
    assert madrid["places"][0] == ["Ciudad Lineal", 40.44, -3.675, "", 13.4, 8.5, 4.0, 10.0, "nl", 81, 361, "", None]
    assert madrid["places"][1][9:] == [None, None, "g", "2026-10-24"]             # no frost in a typical year; ground frost Saturday
    assert madrid["places"][1][3] == "g" and madrid["places"][1][7] == 0.0       # ground frost; rain beat evaporation
    toledo = json.loads(files["39_-5.json"])["places"][0]
    assert toledo[3] == "f" and toledo[4] is None and toledo[8] == "nx"         # frost; no soil reading


def test_crop_needs_say_what_each_crop_wants():
    needs = json.loads(huerta.crop_needs(CROPS))
    assert needs["tomato"] == {"frost": "tender", "soil": [16, None], "night": 10, "days": 70}
    assert needs["garlic"] == {"frost": "hardy", "soil": [7, 15], "night": None, "days": 240}


def test_map_files_hold_one_layer_after_another():
    places = pd.DataFrame({
        "Latitude": [40.44, 39.86], "Longitude": [-3.675, -4.02],
        "frost3": [9.2, -0.5], "frostw": [1.0, 5.0], "soil3": [13.44, np.nan], "rain7": [4.0, 1.0], "et07": [14.4, 12.0],
    })
    advice = pd.DataFrame({"garlic": ["now", "too_warm"], "tomato": ["too_late", "not_here"]})
    files = huerta.map_files(places, advice, "2026-10-20")
    index = json.loads(files["index.json"])
    assert index == {"day": "2026-10-20", "n": 2,
                     "layers": ["frost", "soil", "water", "cold", "balance", "garlic", "tomato"]}
    assert np.frombuffer(files["places.bin"], "<i2").tolist() == [4044, -368, 3986, -402]
    layers = np.frombuffer(files["layers.bin"], np.uint8).reshape(7, 2)
    assert layers[0].tolist() == [3, 2]                                   # ground frost later in the week; frost now
    assert layers[1].tolist() == [53, 255]                                # 13 C + 40; no reading
    assert layers[2].tolist() == [10, 11]                                 # mm still to water
    assert layers[3].tolist() == [41, 40]                                 # the week's coldest hour, 1 and -0.5 C, + 40
    assert layers[4].tolist() == [90, 89]                                 # rain less evaporation, -10 and -11 mm, + 100
    assert bytes(layers[5]).decode() + bytes(layers[6]).decode() == "nhlx"


def test_map_files_carry_each_crops_months_after_the_week():
    places = pd.DataFrame({
        "Latitude": [40.44, 39.86, 50.0], "Longitude": [-3.675, -4.02, 8.0],
        "frost3": [9.2, -0.5, 5.0], "frostw": [1.0, 5.0, 5.0], "soil3": [13.44, np.nan, 9.0], "rain7": [4.0, 1.0, 0.0],
        "et07": [14.4, 12.0, 3.0],
    })
    advice = pd.DataFrame({"garlic": ["now", "too_warm", "now"], "tomato": ["too_late", "not_here", "too_late"]})
    win = {"crops": np.array(["tomato", "garlic"]), "lat": np.array([39.86, 40.44]), "lon": np.array([-4.02, -3.675]),
           # Toledo: tomato April to June, garlic September to December; Madrid: no tomato, garlic October and November
           "sow": np.array([[0b111000, 0b111100000000], [0, 0b11000000000]], np.uint16)}
    files = huerta.map_files(places, advice, "2026-10-20", win)
    index = json.loads(files["index.json"])
    assert index["layers"][5:] == ["garlic", "tomato", "garlic_jan_aug", "garlic_sep_dec",
                                   "tomato_jan_aug", "tomato_sep_dec"]          # the week's layers keep their places
    layers = np.frombuffer(files["layers.bin"], np.uint8).reshape(-1, 3)
    assert layers[7].tolist() == [0, 0, 0] and layers[8].tolist() == [0b0110, 0b1111, 255]   # none in the windows: 255
    assert layers[9].tolist() == [0, 0b111000, 0] and layers[10][:2].tolist() == [0, 0]


def test_conditions_find_the_first_frost_night_later_in_the_week():
    hours = pd.date_range("2026-10-20 19:00", periods=7 * 24, freq="h", tz="UTC")
    temp = np.full(len(hours), 8.0)
    temp[4 * 24 + 10] = -1.0                       # day 5 (the night of 24 Oct): a frost
    temp[3 * 24 + 10] = 1.5                        # day 4: only a ground frost
    forecast = pd.DataFrame({"time": hours, "lat": 40.0, "lon": -3.7, "t2m_c": temp, "soil_c": 12.0,
                             "precip_mm": 0.0, "swdown_wm2": 100.0})
    cond, _ = huerta.conditions(forecast)
    row = cond.iloc[0]
    assert row["frost3"] == 8.0 and row["frostw"] == -1.0
    assert row["frostw_night"] == "2026-10-24"      # the frost night, not the earlier ground frost


def windows(rows, crops=("tomato", "peas")):
    """A windows file in the builder's run-length form: rows is, per place, per crop, [(start day, letter)]."""
    letters = np.array(list("nsfwhbaplx"))
    counts, starts, codes, lat, lon = [], [], [], [], []
    for (la, lo), per in rows:
        lat.append(la), lon.append(lo)
        for segments in per:
            counts.append(len(segments))
            starts += [s for s, _ in segments]
            codes += [int(np.flatnonzero(letters == x)[0]) for _, x in segments]
    return {"crops": np.array(crops), "letters": letters, "lat": np.array(lat), "lon": np.array(lon),
            "offsets": np.concatenate([[0], np.cumsum(counts)]), "starts": np.array(starts, np.int16),
            "codes": np.array(codes, np.uint8)}


def test_windows_decide_and_the_week_holds_back():
    win = windows([
        ((40.0, -3.0), [[(0, "w"), (130, "n"), (200, "l"), (240, "n"), (260, "l")],   # tomato: May-July, early September
                        [(0, "s"), (60, "n"), (130, "h"), (230, "n"), (270, "l")]]),   # peas: spring, then autumn
        ((48.0, 11.0), [[(0, "x")], [(0, "s"), (80, "n"), (140, "h"), (300, "s")]]),   # no tomatoes; peas in spring
    ])
    base = dict(place(soil3=18.0, frost3=8.0, frostw=8.0, night7=12.0), Latitude=40.0, Longitude=-3.0)
    places = pd.DataFrame([base, {**base, "Latitude": 48.0, "Longitude": 11.0}])
    may = huerta.advise(places, CROPS, 145, win)                               # day 145 = index 144
    assert may["tomato"].tolist() == ["now", "not_here"]
    # The cycle, round the year: too late while the last window is nearer than the next, then not yet.
    assert may["peas"].tolist() == ["too_late", "too_late"]                     # spring's 15 days past, autumn's 86 ahead
    july = huerta.advise(places, CROPS, 210, win)
    assert july["tomato"].tolist()[0] == "too_late"                             # 10 days past, 31 ahead
    assert july["peas"].tolist() == ["too_warm", "too_late"]                    # 21 days to autumn's: its own reason
    assert huerta.advise(places, CROPS, 235, win)["tomato"].tolist()[0] == "wait_autumn"   # over, the next nearer
    assert huerta.advise(places, CROPS, 280, win)["tomato"].tolist()[0] == "too_late"
    assert huerta.advise(places, CROPS, 30, win)["tomato"].tolist()[0] == "wait_warm"     # the next window nearer than the last
    # Inside its window, this week's weather may still hold a crop back.
    cold = huerta.advise(places.assign(frost3=1.0), CROPS, 145, win)
    assert cold["tomato"].tolist()[0] == "wait_frost"
    autumn = huerta.advise(places.assign(soil3=2.0), CROPS, 240, win)
    assert autumn["peas"].tolist() == ["wait_soil", "too_late"]
    # A crop the windows don't hold keeps the rules.
    assert huerta.advise(places, CROPS, 145, win)["garlic"].tolist() == huerta.rules(places, CROPS, 145)["garlic"].tolist()


def _hours(start, n, t, lat=47.16, lon=8.55):
    return pd.DataFrame({"time": pd.date_range(start, periods=n, freq="h", tz="UTC"), "lat": lat, "lon": lon,
                         "t2m_c": t})


def test_daily_air_keeps_the_past_and_adds_today_and_the_forecast(tmp_path, monkeypatch):
    import hourly_weather
    monkeypatch.setattr(hourly_weather, "OUT_DIR", tmp_path)
    past = tmp_path / "SE" / "past"
    past.mkdir(parents=True)
    _hours("2026-10-28 01:00", 24, 8.0).to_parquet(past / "2026-10-28.parquet")
    _hours("2026-10-29 01:00", 24, 10.0).to_parquet(past / "2026-10-29.parquet")
    _hours("2026-10-30 01:00", 18, 12.0).to_parquet(past / "2026-10-30.parquet")   # up to tonight's run
    forecast = _hours("2026-10-30 19:00", 48, 14.0)                               # 30th's evening on; 1st cut short
    air = huerta.daily_air("SE", forecast)
    assert list(air.columns) == ["2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31"]
    assert air.loc[(47.16, 8.55)].tolist() == [8.0, 10.0, 12.5, 14.0]             # today: 18 past hours, 6 forecast
    with np.load(tmp_path / "SE" / "daily_air.npz") as z:                          # the store keeps the past days
        assert z["days"].tolist() == ["2026-10-28", "2026-10-29"]
    # The next night: the store's days, the day it lacks, a gap where a night had no weather.
    (past / "2026-10-28.parquet").unlink()
    _hours("2026-11-01 01:00", 24, 9.0).to_parquet(past / "2026-11-01.parquet")
    air = huerta.daily_air("SE", _hours("2026-11-02 01:00", 24, 6.0))
    assert list(air.columns)[0] == "2026-10-28" and np.isnan(air.loc[(47.16, 8.55), "2026-10-31"])
    assert air.loc[(47.16, 8.55), ["2026-11-01", "2026-11-02"]].tolist() == [9.0, 6.0]


def test_area_files_carry_each_places_daily_air():
    assert huerta.warm_bytes([-30, 0, 20.3, np.nan, 100]).tolist() == [0, 60, 101, 255, 254]
    places = pd.DataFrame({
        "Location_Id": ["Zug_47.160_8.550", "Baar_47.200_8.525"], "Latitude": [47.16, 47.2], "Longitude": [8.55, 8.525],
        "frost3": [5.0, 5.0], "soil3": [10.0, 10.0], "night7": [6.0, 6.0], "rain7": [4.0, 4.0], "et07": [6.0, 6.0],
        "last0_median": [116, 116], "first0_median": [319, 319], "frostw": [5.0, 5.0], "frostw_night": [None, None],
    })
    advice = pd.DataFrame({"garlic": ["now", "now"]})
    air = pd.DataFrame([[8.0, np.nan, 12.5]], columns=["2026-10-28", "2026-10-29", "2026-10-30"],
                       index=pd.MultiIndex.from_tuples([(47.16, 8.55)], names=["key_lat", "key_lon"]))
    rows = json.loads(huerta.area_files(places, advice, "2026-10-31", air)["47_8.json"])["places"]
    first, b64 = rows[0][13]
    assert first == "2026-10-28" and list(base64.b64decode(b64)) == [76, 255, 85]
    assert rows[1][13] is None                                                    # no weather known there
