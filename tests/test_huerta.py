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


def test_conditions_move_the_forecast_to_the_villages_height():
    # Chur: ICON-EU's cell stands 615 m above the town, 4.0 C warmer by day there, 2.8 C at night.
    place = pd.DataFrame({"Latitude": [46.86], "Longitude": [9.525], "forecast_lift": [4.0], "forecast_lift_min": [2.8]})
    lift = huerta.forecast_lift(place)
    hours = pd.date_range("2026-10-20 19:00", periods=7 * 24, freq="h", tz="UTC")
    temp = np.full(len(hours), 8.0)
    temp[10] = -1.0                                # a frost at the model's height: none in town
    temp[4 * 24 + 10] = -4.0                       # day 5: a frost in town too
    forecast = pd.DataFrame({"time": hours, "lat": 46.86, "lon": 9.525, "t2m_c": temp, "soil_c": np.nan,
                             "precip_mm": 0.0, "swdown_wm2": 100.0})
    row = huerta.conditions(forecast, lift)[0].iloc[0]
    assert round(row["frost3"], 6) == 1.8 and round(row["soil3"], 2) == round(8.0 - 9 / 72 + 4.0, 2)   # no soil: air
    assert round(row["frostw"], 1) == -1.2 and row["frostw_night"] == "2026-10-24"
    assert huerta.forecast_lift(place.drop(columns=["forecast_lift", "forecast_lift_min"])) is None
    air = pd.DataFrame([[8.0, 9.0]], columns=["2026-10-30", "2026-10-31"],
                       index=pd.MultiIndex.from_tuples([(46.86, 9.525)], names=["key_lat", "key_lon"]))
    assert huerta.at_village(air, lift, "mean").iloc[0].tolist() == [12.0, 13.0]
    assert huerta.at_village(None, lift, "min") is None


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


def _blight_hours(start, n, lon=0.0):
    """Warm, dry hours from `start`: 14 C, dew point 8 C (about 67 %)."""
    return pd.DataFrame({"time": pd.date_range(start, periods=n, freq="h", tz="UTC"), "lat": 50.0, "lon": lon,
                         "t2m_c": 14.0, "td2m_c": 8.0})


def _wet(hours, first, n):
    """`n` saturated hours from `first` (UTC)."""
    t0 = pd.Timestamp(first, tz="UTC")
    at = hours["time"].between(t0, t0 + pd.Timedelta(hours=n - 1))
    hours.loc[at, "td2m_c"] = hours.loc[at, "t2m_c"]


def test_humidity_from_air_and_dew_point():
    assert float(huerta.humidity(15.0, 15.0)) == 100.0
    assert abs(float(huerta.humidity(20.0, 10.0)) - 52.6) < 0.5


def test_blight_bits_mark_the_second_of_two_warm_wet_days():
    hours = _blight_hours("2026-11-02 00:00", 9 * 24)                     # 2-10 Nov; solar days = UTC at 0 E
    for day in ("2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-07", "2026-11-10"):
        _wet(hours, f"{day} 01:00", 6)
    _wet(hours, "2026-11-09 01:00", 5)                                     # one hour short
    hours.loc[hours["time"].dt.strftime("%Y-%m-%d") == "2026-11-03", "t2m_c"] = 9.0   # 3 Nov too cold
    # The advice day is 4 Nov, so bit 0 is 3 Nov: only 5 Nov follows a day like itself (4 Nov).
    assert huerta.blight_bits(hours, "2026-11-04").loc[(50.0, 0.0)] == 0b100


def test_blight_bits_count_solar_days_at_the_place():
    # At 30 E the day starts at 22:00 UTC: 6 wet hours from 22:00 are one day there, two in UTC.
    hours = _blight_hours("2026-11-02 00:00", 9 * 24, lon=30.0)
    _wet(hours, "2026-11-03 22:00", 6)
    _wet(hours, "2026-11-04 22:00", 6)
    assert huerta.blight_bits(hours, "2026-11-04").loc[(50.0, 30.0)] == 0b100


def test_blight_bits_skip_a_day_the_forecast_cuts_short():
    hours = _blight_hours("2026-11-02 00:00", 3 * 24 + 11)                # 5 Nov has 11 hours
    _wet(hours, "2026-11-04 01:00", 6)
    _wet(hours, "2026-11-05 01:00", 6)
    assert huerta.blight_bits(hours, "2026-11-04").loc[(50.0, 0.0)] == 0


def test_blight_hours_take_the_runs_day_and_two_before_then_the_forecast(tmp_path, monkeypatch):
    import hourly_weather
    monkeypatch.setattr(hourly_weather, "OUT_DIR", tmp_path)
    past = tmp_path / "SE" / "past"
    past.mkdir(parents=True)
    for day, n in (("2026-10-28", 24), ("2026-10-29", 24), ("2026-10-30", 24), ("2026-10-31", 18)):
        _hours(f"{day} 01:00", n, 8.0).assign(td2m_c=5.0).to_parquet(past / f"{day}.parquet")
    forecast = _hours("2026-10-31 19:00", 48, 14.0).assign(td2m_c=12.0)
    hours = huerta.blight_hours("SE", forecast)
    assert hours["time"].min() == pd.Timestamp("2026-10-29 01:00", tz="UTC")   # not the 28th
    assert hours["time"].is_unique and len(hours) == 24 + 24 + 18 + 48
    assert list(hours.columns) == ["time", "lat", "lon", "t2m_c", "td2m_c"]


def test_area_files_carry_blight_bits_after_the_daily_air():
    places = pd.DataFrame({
        "Location_Id": ["Zug_47.160_8.550", "Baar_47.200_8.525"], "Latitude": [47.16, 47.2], "Longitude": [8.55, 8.525],
        "frost3": [5.0, 5.0], "soil3": [10.0, 10.0], "night7": [6.0, 6.0], "rain7": [4.0, 4.0], "et07": [6.0, 6.0],
        "last0_median": [116, 116], "first0_median": [319, 319], "frostw": [5.0, 5.0], "frostw_night": [None, None],
    })
    advice = pd.DataFrame({"potato": ["now", "now"]})
    bits = pd.Series([0b110], index=pd.MultiIndex.from_tuples([(47.16, 8.55)], names=["key_lat", "key_lon"]))
    rows = json.loads(huerta.area_files(places, advice, "2026-10-31", None, bits)["47_8.json"])["places"]
    assert rows[0][13:] == [None, 6] and rows[1][13:] == [None, 0]          # no daily air known; none at Baar


def test_daily_air_keeps_each_days_coldest_hour_for_the_frost_check(tmp_path, monkeypatch):
    import hourly_weather
    monkeypatch.setattr(hourly_weather, "OUT_DIR", tmp_path)
    past = tmp_path / "SE" / "past"
    past.mkdir(parents=True)
    for day in ("2026-10-20", "2026-10-28", "2026-10-29"):
        hours = _hours(f"{day} 01:00", 24, 8.0)
        hours.loc[5, "t2m_c"] = -3.0                                              # a frost at dawn
        hours.to_parquet(past / f"{day}.parquet")
    _hours("2026-10-30 01:00", 18, 12.0).to_parquet(past / "2026-10-30.parquet")
    forecast = _hours("2026-10-30 19:00", 48, 14.0)
    forecast.loc[10, "t2m_c"] = -1.5                                              # 31 Oct, 05:00
    lows = huerta.daily_air("SE", forecast, how="min", back=huerta.LOW_DAYS)
    assert list(lows.columns)[0] == "2026-10-28"                                  # not the 20th: a week back
    assert lows.loc[(47.16, 8.55), ["2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31"]].tolist() == \
        [-3.0, -3.0, 12.0, -1.5]
    assert (tmp_path / "SE" / "daily_min.npz").exists() and not (tmp_path / "SE" / "daily_air.npz").exists()


def test_area_files_carry_lows_after_blight_and_keep_the_fields_places():
    places = pd.DataFrame({
        "Location_Id": ["Zug_47.160_8.550", "Baar_47.200_8.525"], "Latitude": [47.16, 47.2], "Longitude": [8.55, 8.525],
        "frost3": [5.0, 5.0], "soil3": [10.0, 10.0], "night7": [6.0, 6.0], "rain7": [4.0, 4.0], "et07": [6.0, 6.0],
        "last0_median": [116, 116], "first0_median": [319, 319], "frostw": [5.0, 5.0], "frostw_night": [None, None],
    })
    advice = pd.DataFrame({"lettuce": ["now", "now"]})
    at = pd.MultiIndex.from_tuples([(47.16, 8.55)], names=["key_lat", "key_lon"])
    lows = pd.DataFrame([[-6.0, 1.5]], columns=["2026-10-30", "2026-10-31"], index=at)
    rows = json.loads(huerta.area_files(places, advice, "2026-10-31", None, None, lows)["47_8.json"])["places"]
    first, b64 = rows[0][15]
    assert rows[0][13:15] == [None, None] and first == "2026-10-30" and list(base64.b64decode(b64)) == [48, 63]
    assert rows[1][13:] == [None, None, None]                                     # nothing known at Baar
    air = pd.DataFrame([[8.0]], columns=["2026-10-31"], index=at)
    rows = json.loads(huerta.area_files(places, advice, "2026-10-31", air, None, lows)["47_8.json"])["places"]
    assert rows[0][13][0] == "2026-10-31" and rows[0][14] is None and rows[0][15][0] == "2026-10-30"


def test_daily_air_keeps_each_days_strongest_gust_and_rain(tmp_path, monkeypatch):
    import hourly_weather
    monkeypatch.setattr(hourly_weather, "OUT_DIR", tmp_path)
    past = tmp_path / "SE" / "past"
    past.mkdir(parents=True)
    _hours("2026-10-28 01:00", 24, 8.0).to_parquet(past / "2026-10-28.parquet")   # from before gusts were fetched
    windy = _hours("2026-10-29 01:00", 24, 8.0).assign(gust_kmh=30.0, precip_mm=0.5)
    windy.loc[14, "gust_kmh"] = 85.0
    windy.to_parquet(past / "2026-10-29.parquet")
    _hours("2026-10-30 01:00", 18, 12.0).assign(gust_kmh=20.0, precip_mm=2.0).to_parquet(past / "2026-10-30.parquet")
    forecast = _hours("2026-10-30 19:00", 48, 14.0).assign(gust_kmh=40.0, precip_mm=0.0)
    gusts = huerta.daily_air("SE", forecast, how="max", back=huerta.LOW_DAYS, column="gust_kmh")
    rains = huerta.daily_air("SE", forecast, how="sum", back=huerta.LOW_DAYS, column="precip_mm")
    assert list(gusts.columns) == ["2026-10-29", "2026-10-30", "2026-10-31"]
    assert gusts.loc[(47.16, 8.55)].tolist() == [85.0, 40.0, 40.0] and rains.loc[(47.16, 8.55)].tolist() == [12.0, 36.0, 0.0]
    with np.load(tmp_path / "SE" / "daily_max_gust_kmh.npz") as z:                 # whole km/h, not the air's code
        assert z["b"].tolist() == [[85]]


def test_area_files_carry_gusts_and_rains_last():
    places = pd.DataFrame({
        "Location_Id": ["Zug_47.160_8.550", "Baar_47.200_8.525"], "Latitude": [47.16, 47.2], "Longitude": [8.55, 8.525],
        "frost3": [5.0, 5.0], "soil3": [10.0, 10.0], "night7": [6.0, 6.0], "rain7": [4.0, 4.0], "et07": [6.0, 6.0],
        "last0_median": [116, 116], "first0_median": [319, 319], "frostw": [5.0, 5.0], "frostw_night": [None, None],
    })
    at = pd.MultiIndex.from_tuples([(47.16, 8.55)], names=["key_lat", "key_lon"])
    gusts = pd.DataFrame([[85.0, 140.4]], columns=["2026-10-30", "2026-10-31"], index=at)
    rains = pd.DataFrame([[36.0, np.nan]], columns=["2026-10-30", "2026-10-31"], index=at)
    files = huerta.area_files(places, pd.DataFrame({"kale": ["now", "now"]}), "2026-10-31",
                              storms={"gusts": gusts, "rains": rains})
    rows = json.loads(files["47_8.json"])["places"]
    assert rows[0][13:16] == [None, None, None] and rows[0][16][0] == "2026-10-30"
    assert list(base64.b64decode(rows[0][16][1])) == [85, 140] and list(base64.b64decode(rows[0][17][1])) == [36, 255]
    assert rows[1][16:] == [None, None]                                            # nothing known at Baar


def test_daily_air_starts_a_store_when_no_past_file_has_the_column(tmp_path, monkeypatch):
    # The first night after gusts were fetched: every past file predates them (2 Nov 2026 crashed on this).
    import hourly_weather
    monkeypatch.setattr(hourly_weather, "OUT_DIR", tmp_path)
    past = tmp_path / "SE" / "past"
    past.mkdir(parents=True)
    _hours("2026-10-29 01:00", 24, 8.0).to_parquet(past / "2026-10-29.parquet")
    forecast = _hours("2026-10-30 19:00", 48, 14.0).assign(gust_kmh=70.0)
    gusts = huerta.daily_air("SE", forecast, how="max", back=huerta.LOW_DAYS, column="gust_kmh")
    assert gusts.loc[(47.16, 8.55)].tolist() == [70.0]                             # the 31st, from the forecast


def test_map_files_carry_the_weeks_blight_days_after_the_weather():
    places = pd.DataFrame({
        "Latitude": [40.44, 39.86, 38.0], "Longitude": [-3.675, -4.02, -1.13],
        "frost3": [9.2, -0.5, 12.0], "frostw": [1.0, 5.0, 12.0], "soil3": [13.44, np.nan, 18.0],
        "rain7": [4.0, 1.0, 20.0], "et07": [14.4, 12.0, 9.0],
    })
    advice = pd.DataFrame({"tomato": ["too_late", "not_here", "too_late"]})
    # Bit 0 is yesterday: Murcia has three blight days from today, Madrid one yesterday only, Toledo none known.
    bits = pd.Series([0b1, 0b1110], index=pd.MultiIndex.from_tuples([(40.44, -3.675), (38.0, -1.13)],
                                                                   names=["key_lat", "key_lon"]))
    files = huerta.map_files(places, advice, "2026-11-02", blight=bits)
    assert json.loads(files["index.json"])["layers"] == ["frost", "soil", "water", "cold", "balance", "blight", "tomato"]
    layers = np.frombuffer(files["layers.bin"], np.uint8).reshape(7, 3)
    assert layers[5].tolist() == [0, 255, 3]
    assert "blight" not in json.loads(huerta.map_files(places, advice, "2026-11-02")["index.json"])["layers"]
