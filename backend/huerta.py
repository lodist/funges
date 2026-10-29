"""Huerta, the garden space: this week's advice at every place, from the night's hourly
forecast, each place's frost climate and the crop table, published for the app.

Per place: the coldest hour of the next 3 days (frost3) and of the rest of the week, days
4-7 (frostw, with the night it comes: frostw_night), the mean soil temperature at 6 cm
over the next 3 days (soil3; NBM has none, so in the US the air's three-day mean stands
in), the week's mean night (night7), its rain (rain7) and reference evaporation (et07,
Hargreaves' radiation formula). Per crop, the first rule that applies:
- a crop that goes in only in autumn (bulbs, winter rye) -> wait_autumn before July; one that
  goes in only in spring (asparagus crowns) -> wait_spring from July;
- tender: no warm-night season here -> not_here; an autumn frost before harvest in more
  than 1 year in 10, or harvest past the end of the warm-night season -> too_late; a frost
  (<= 2 C) in the next 3 days, a frost (<= 0 C) later in the week, or one still to come in
  more than 1 year in 10 -> wait_frost; over two weeks before the warm nights normally begin, or this week's nights
  below its need -> wait_warm; soil below its need -> wait_soil (too_late from July on: the
  soil only cools);
- hardier crops: soil below or above its range -> wait_soil (too_late from July on) /
  too_warm; half-hardy ones also wait out a hard frost (-3 C) in the forecast, or one still
  to come in more than half the years; unless its winters are mild enough for the crop to
  overwinter, a hard frost before harvest in more than half the years -> too_late;
- otherwise: now.

Where the region's sowing windows are on this machine (huerta/windows/<REGION>.npz, built by
data_tools/build_huerta_windows.py from each place's 2016-2025 climate and each crop's biology), they
decide instead, and the rules above are the fallback. A day in a crop's window: this week's weather
may still hold it back (tender crops: a frost (<= 2 C) in the next 3 days or (<= 0 C) later in the
week -> wait_frost, nights below its need -> wait_warm; others: a hard frost (-3 C) in the next 3 days
for half-hardy ones -> wait_frost; soil below or above its range -> wait_soil / too_warm), else now.
Outside its windows the window's own reason: soil usually too cold (wait_soil), frost still likely
(wait_frost), its warm nights to come (wait_warm), too warm (too_warm), days long enough to make it
bolt (wait_days), its season comes (wait_autumn / wait_spring), while a window still opens later this
year; too_late when none does; not_here where it has none.

Inputs, built locally and shipped to R2 like every built file (backend/generated, pinned in
on_r2.json and fetched by r2.generated): huerta_crops.csv, the crop table; frost_odds_<REGION>.parquet,
each place's frost dates, yearly lows and warm-night season; huerta_windows_<REGION>.npz, the sowing
windows.

Output, private on R2 like the rest: one file per 1° square, huerta/advice/<REGION>/
<lat>_<lon>.json, {day, crops, places: [[name, lat, lon, frost, soil, nights, rain, water,
codes, last_frost, first_frost, later_frost, later_night]]}: frost '' / 'g' (ground frost) /
'f' in the next 3 days, codes one letter per crop (CODES), last/first frost the place's
typical day of year of its last spring and first autumn frost (null: none in a typical
year), later_frost the same '' / 'g' / 'f' for days 4-7 and later_night the date of its
first such night (null: none). For the garden map, huerta/map/<REGION>/:
index.json {day, n, layers}, places.bin (int16 lat x100, lon x100 per place) and layers.bin,
one byte per place per layer, layer after layer (MAP_LAYERS, then one per crop: its letter;
cold is the week's coldest hour, C + 40, and balance its rain less its evaporation, mm + 100),
so the Worker can hand out one layer with a range read. And huerta/crops.json, what each crop needs
(frost class, soil range, warm nights, days to harvest), for the app to say why. The Huerta Worker hands one place at a
time to the app.
"""
from __future__ import annotations

import json
import os
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import pandas as pd

GENERATED = Path(__file__).resolve().parent / "generated"
CROPS = GENERATED / "huerta_crops.csv"
SAFE = 0.1      # tender crops: a frost before harvest in at most 1 year in 10
RISKY = 0.5     # hardier crops: a hard frost before harvest in at most half the years
EARLY = 14      # days before the warm nights normally begin that a tender crop may go out
AUTUMN = 182    # day of year (1 July): soil too cold means too late from here; autumn crops open
CODES = {"now": "n", "wait_frost": "f", "wait_soil": "s", "wait_warm": "w", "too_warm": "h",
         "too_late": "l", "not_here": "x", "wait_autumn": "a", "wait_spring": "p", "wait_days": "d"}
# The windows' letters (build_huerta_windows.py), a status each.
WINDOW = {"n": "now", "s": "wait_soil", "f": "wait_frost", "w": "wait_warm", "h": "too_warm", "b": "wait_days",
          "a": "wait_autumn", "p": "wait_spring", "l": "too_late", "x": "not_here"}
UPLOAD_WORKERS = 16
# The garden map's own layers: frost (0 none; in the next 3 days 1 ground frost, 2 frost; 3 either
# later in the week), soil
# at 6 cm (degrees C + 40) and the week's water deficit (mm); 255 where unknown.
MAP_LAYERS = ("frost", "soil", "water", "cold", "balance")


def conditions(forecast):
    """Per place (lat, lon): frost3, soil3, night7, rain7, et07; and the forecast's first hour."""
    start = forecast["time"].min()
    f = forecast.assign(day=((forecast["time"] - start) // pd.Timedelta(hours=24)).astype("int8"))
    keys = ["lat", "lon"]
    soon = f[f["day"] < 3].groupby(keys, sort=False).agg(
        frost3=("t2m_c", "min"), soil3=("soil_c", "mean"), air3=("t2m_c", "mean"))
    days = f.groupby([*keys, "day"], sort=False).agg(
        tmin=("t2m_c", "min"), tmean=("t2m_c", "mean"), rain=("precip_mm", "sum"), sun=("swdown_wm2", "sum"))
    # Hargreaves (1985): ET0 = 0.0135 (T + 17.8) Rs, Rs in mm a day (MJ m-2 x 0.408); sun sums W m-2 over hours
    days["et0"] = 0.0135 * (days["tmean"] + 17.8) * days["sun"] * 3600e-6 * 0.408
    week = days.groupby(level=keys, sort=False).agg(night7=("tmin", "mean"), rain7=("rain", "sum"),
                                                    et07=("et0", "sum"))
    # The rest of the week, days 4-7: its coldest night, and the first night as cold as that.
    late = days.loc[days.index.get_level_values("day") >= 3, "tmin"]
    week["frostw"] = late.groupby(level=keys, sort=False).min()
    for limit, col in ((0, "first_f"), (2, "first_g")):
        week[col] = late[late <= limit].reset_index(level="day")["day"].groupby(level=keys, sort=False).min()
    out = soon.join(week).reset_index()
    out["soil3"] = out["soil3"].fillna(out.pop("air3"))
    night = np.where(out["frostw"] <= 0, out.pop("first_f"), out.pop("first_g"))
    out["frostw_night"] = [None if np.isnan(d) else f"{start + pd.Timedelta(days=int(d)):%Y-%m-%d}" for d in night]
    return out, start


def frost_risk(place, name, doy, days):
    """Per place, over the years: the share with a frost (threshold `name`, 0 or m3) still to
    come after day `doy` in spring, and the share with an autumn one by day `doy + days`."""
    years = [c.split("_")[1] for c in place.columns if c.startswith(f"last{name}_") and c.split("_")[1].isdigit()]
    last = place[[f"last{name}_{y}" for y in years]].to_numpy()
    first = place[[f"first{name}_{y}" for y in years]].to_numpy()
    return (last >= doy).mean(axis=1), ((first > 0) & (first <= doy + days)).mean(axis=1)


def load_windows(region):
    """The region's sowing windows (fetched from R2 when missing or outdated), or None where none were shipped."""
    import r2
    path = r2.generated(GENERATED / f"huerta_windows_{region}.npz")
    if not path.exists():
        return None
    with np.load(path) as z:
        return {k: z[k] for k in z.files}


def in_windows(windows, place, crop, doy):
    """For one crop at each place (matched on its coordinates): today's window letter ('' where the
    windows have no such place or crop), and whether a window opens later this calendar year, and
    whether it has one at all. Windows are run-length letters per place and crop, place after place."""
    n = len(place)
    letter, later, ever = np.full(n, "", object), np.zeros(n, bool), np.zeros(n, bool)
    crops = list(windows["crops"])
    if crop not in crops:
        return letter, later, ever

    def key(lat, lon):
        return np.round(np.asarray(lat, float) * 1e4).astype(np.int64) * 10**8 + np.round(np.asarray(lon, float) * 1e4).astype(np.int64)

    where = pd.Series(np.arange(len(windows["lat"])), index=key(windows["lat"], windows["lon"]))
    where = where[~where.index.duplicated()]
    row = where.reindex(key(place["Latitude"], place["Longitude"])).to_numpy()
    have = ~np.isnan(row)
    k = row[have].astype(np.int64) * len(crops) + crops.index(crop)
    a, b = windows["offsets"][k], windows["offsets"][k + 1]
    lengths = b - a
    first = np.concatenate([[0], np.cumsum(lengths)[:-1]])          # each place's first segment, gathered
    seg = np.repeat(np.arange(len(k)), lengths)
    idx = np.repeat(a - first, lengths) + np.arange(lengths.sum())
    starts, codes = windows["starts"][idx], windows["codes"][idx]
    letters = windows["letters"]
    today = doy - 1
    upto = np.bincount(seg, starts <= today, minlength=len(k)).astype(int)
    now = codes[first + upto - 1]
    is_n = letters[codes] == "n"
    letter[have] = letters[now]
    later[have] = np.bincount(seg, (starts > today) & is_n, minlength=len(k)) > 0
    ever[have] = np.bincount(seg, is_n, minlength=len(k)) > 0
    return letter, later, ever


def advise(place, crops, doy, windows=None):
    """One status per crop and place: from the sowing windows and this week's weather where the windows
    hold the place and crop, else by the rules (module docstring)."""
    out = rules(place, crops, doy)
    if windows is None:
        return out
    soil, frost3, frostw, night7 = (place[c].to_numpy() for c in ("soil3", "frost3", "frostw", "night7"))
    for c in crops.itertuples(index=False):
        letter, later, ever = in_windows(windows, place, c.crop, doy)
        status = np.full(len(place), "", object)

        def mark(when, code):
            status[np.asarray(when) & (status == "")] = code

        inside = letter == "n"
        if c.frost == "tender":
            mark(inside & (frost3 <= 2), "wait_frost")
            mark(inside & (frostw <= 0), "wait_frost")
            if not np.isnan(c.night):
                mark(inside & (night7 < c.night), "wait_warm")
        elif c.frost == "half_hardy":
            mark(inside & (frost3 <= -3), "wait_frost")
        mark(inside & (soil < c.soil_min), "wait_soil")
        mark(inside & (soil > c.soil_max), "too_warm")                   # no maximum (NaN): never
        mark(inside, "now")
        mark((letter != "") & ~ever, "not_here")
        waiting = np.isin(letter, ["s", "f", "w", "h", "b", "a", "p"])
        mark(waiting & ~later, "too_late")                               # nothing opens again this year
        mark((letter == "l") & later, "wait_autumn")                     # this round is over, the autumn's comes
        for code, name in WINDOW.items():
            mark(letter == code, name)
        known = letter != ""
        out.loc[known, c.crop] = status[known]
    return out


def rules(place, crops, doy):
    """One status per crop and place, by the rules in the module docstring."""
    soil, frost3, frostw, night7 = (place[c].to_numpy() for c in ("soil3", "frost3", "frostw", "night7"))
    cold_soil = "too_late" if doy >= AUTUMN else "wait_soil"
    out = {}
    for c in crops.itertuples(index=False):
        status = np.full(len(place), "", object)

        def mark(when, code):
            status[np.asarray(when) & (status == "")] = code

        if c.season == "autumn":                                        # no season (blank): either
            mark(doy < AUTUMN, "wait_autumn")
        elif c.season == "spring":
            mark(doy >= AUTUMN, "wait_spring")
        if c.frost == "tender":
            spring, autumn = frost_risk(place, "0", doy, c.days)
            nights = not np.isnan(c.night)
            if nights:
                start, end = (place[f"warm{c.night:.0f}_{e}"].to_numpy() for e in ("start", "end"))
                mark(end == 0, "not_here")
                mark((end < 365) & (doy + c.days > end) & (doy >= start - EARLY), "too_late")
            mark(autumn > SAFE, "too_late")
            mark(frost3 <= 2, "wait_frost")
            mark(frostw <= 0, "wait_frost")                             # a frost later in the week
            mark(spring > SAFE, "wait_frost")
            if nights:
                mark(doy < start - EARLY, "wait_warm")
                mark(night7 < c.night, "wait_warm")
            mark(soil < c.soil_min, cold_soil)
        else:
            mark(soil < c.soil_min, cold_soil)
            mark(soil > c.soil_max, "too_warm")                         # no maximum (NaN): never
            spring, autumn = frost_risk(place, "m3", doy, c.days)
            if c.frost == "half_hardy":
                mark(frost3 <= -3, "wait_frost")
                mark(spring > RISKY, "wait_frost")
            overwinters = place["winter_low"].to_numpy() >= c.hardy_to  # no hardy_to (NaN): never
            mark(~overwinters & (autumn > RISKY), "too_late")
        status[status == ""] = "now"
        out[c.crop] = status
    return pd.DataFrame(out, index=place.index)


def _number(value, digits=1):
    return None if pd.isna(value) else round(float(value), digits)


def _day(value):
    """A median frost day of year; 0 means no frost in a typical year."""
    return None if pd.isna(value) or value <= 0 else int(value)


def crop_needs(crops):
    """huerta/crops.json: {crop: {frost, soil: [min, max], night, days}}, None where a crop has no such need."""
    return json.dumps({c.crop: {"frost": c.frost, "soil": [_number(c.soil_min, 0), _number(c.soil_max, 0)], "night": _number(c.night, 0),
                                "days": _number(c.days, 0)}
                       for c in crops.itertuples(index=False)}, separators=(",", ":")).encode()


def _byte(values, offset=0):
    """Whole numbers + offset as bytes 0..254, 255 where unknown."""
    v = np.round(np.asarray(values, float)) + offset
    return np.where(np.isnan(v), 255, np.clip(v, 0, 254)).astype(np.uint8)


def map_files(place, advice, day):
    """{name under huerta/map/<REGION>/: bytes} for the garden map, layers in MAP_LAYERS + crop order."""
    n = len(place)
    frost = np.select([place["frost3"] <= 0, place["frost3"] <= 2, place["frostw"] <= 2], [2, 1, 3], 0).astype(np.uint8)
    water = (place["et07"] - place["rain7"]).clip(lower=0)
    cold = np.fmin(place["frost3"], place["frostw"])                   # the week's coldest hour
    balance = place["rain7"] - place["et07"]                            # rain to spare, or to water
    columns = [frost, _byte(place["soil3"], 40), _byte(water), _byte(cold, 40), _byte(balance, 100)]
    codes = advice.replace(CODES)
    columns += [np.frombuffer("".join(codes[c]).encode("ascii"), np.uint8) for c in advice.columns]
    places = np.column_stack([np.round(place["Latitude"] * 100), np.round(place["Longitude"] * 100)]).astype("<i2")
    index = {"day": day, "n": n, "layers": [*MAP_LAYERS, *advice.columns]}
    return {"index.json": json.dumps(index, separators=(",", ":")).encode(), "places.bin": places.tobytes(),
            "layers.bin": np.concatenate(columns).tobytes()}


def area_files(place, advice, day):
    """{R2 key suffix '<lat>_<lon>.json': file bytes}: every place of a 1° square, compact."""
    frost = np.select([place["frost3"] <= 0, place["frost3"] <= 2], ["f", "g"], "")
    later = np.select([place["frostw"] <= 0, place["frostw"] <= 2], ["f", "g"], "")
    water = (place["et07"] - place["rain7"]).clip(lower=0)
    codes = advice.replace(CODES).agg("".join, axis=1)
    rows = pd.DataFrame({
        "square": np.floor(place["Latitude"]).astype(int).astype(str) + "_"
        + np.floor(place["Longitude"]).astype(int).astype(str),
        "row": [[name, float(la), float(lo), fr, _number(s), _number(n), _number(r), _number(w, 0), c,
                 _day(last), _day(first), lf, ln if lf else None]
                for name, la, lo, fr, s, n, r, w, c, last, first, lf, ln in zip(
                    place["Location_Id"].str.rsplit("_", n=2).str[0], place["Latitude"], place["Longitude"],
                    frost, place["soil3"], place["night7"], place["rain7"], water, codes,
                    place["last0_median"], place["first0_median"], later, place["frostw_night"])],
    })
    crops = list(advice.columns)
    return {f"{square}.json": json.dumps({"day": day, "crops": crops, "places": list(group["row"])},
                                         ensure_ascii=False, separators=(",", ":")).encode()
            for square, group in rows.groupby("square", sort=False)}


def publish(region, forecast):
    """Tonight's advice at the region's places, as area files on R2. Skipped, with a line in
    the log, when the crop table or the region's frost climate is not on this machine."""
    import r2
    started = time.time()
    crops_path = r2.generated(CROPS)
    frost_path = r2.generated(GENERATED / f"frost_odds_{region}.parquet")
    if not (crops_path.exists() and frost_path.exists()):
        print(f"Huerta: skipped, no {crops_path.name if not crops_path.exists() else frost_path.name}")
        return 0
    cond, start = conditions(forecast)
    day = start + pd.Timedelta(hours=12)                             # the morning after the run
    place = pd.read_parquet(frost_path)
    for frame, (la, lo) in ((place, ("Latitude", "Longitude")), (cond, ("lat", "lon"))):
        frame["key_lat"], frame["key_lon"] = frame[la].round(4), frame[lo].round(4)
    place = place.merge(cond.drop(columns=["lat", "lon"]), on=["key_lat", "key_lon"], how="inner")
    crops = pd.read_csv(crops_path)
    windows = load_windows(region)
    if windows is None:
        print(f"Huerta: no sowing windows for {region}, the rules decide")
    advice = advise(place, crops, day.dayofyear, windows)
    files = area_files(place, advice, f"{day:%Y-%m-%d}")

    s3, bucket = r2.client(), os.environ["R2_BUCKET_NAME"]
    with ThreadPoolExecutor(UPLOAD_WORKERS) as pool:
        list(pool.map(lambda kv: s3.put_object(Bucket=bucket, Key=f"huerta/advice/{region}/{kv[0]}", Body=kv[1],
                                               ContentType="application/json"), files.items()))
    s3.put_object(Bucket=bucket, Key="huerta/crops.json", Body=crop_needs(crops), ContentType="application/json")
    # The index last, so the map never reads an index ahead of its layers.
    maps = map_files(place, advice, f"{day:%Y-%m-%d}")
    for name in ("places.bin", "layers.bin", "index.json"):
        s3.put_object(Bucket=bucket, Key=f"huerta/map/{region}/{name}", Body=maps[name],
                      ContentType="application/json" if name.endswith(".json") else "application/octet-stream")
    print(f"Huerta: {len(place):,} places in {len(files)} area files for {day:%Y-%m-%d}, "
          f"{time.time() - started:.0f} s; sow or plant now at a typical place: "
          f"{int((advice == 'now').sum(axis=1).median())} of {advice.shape[1]} crops")
    return len(files)
