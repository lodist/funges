"""Huerta, the garden space: this week's advice at every place, from the night's hourly
forecast, each place's frost climate and the crop table, published for the app.

Per place: the coldest hour of the next 3 days (frost3) and of the rest of the week, days
4-7 (frostw, with the night it comes: frostw_night), the mean soil temperature at 6 cm
over the next 3 days (soil3; NBM has none, so in the US the air's three-day mean stands
in), the week's mean night (night7), its rain (rain7) and reference evaporation (et07,
Hargreaves' radiation formula). All at the height of the place's village: in mountain valleys the
forecast's model stands far up the slopes (ICON-EU puts Chur, 601 m, at 1216 m), so its days move
by the frost table's forecast_lift (means) and forecast_lift_min (minima); so do the advice's
warm and lows, while blight reads the model's own hours. Per crop, the first rule that applies:
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
Between two of its windows (round the year) the cycle: too_late while the last window is nearer than
the next; then the window's own reason: soil usually too cold (wait_soil), frost still likely
(wait_frost), its warm nights to come (wait_warm), too warm (too_warm), days long enough to make it
bolt (wait_days), its season comes (wait_autumn / wait_spring, also where the day's letter only says
this round is over); not_here where it has none.

Inputs, built locally and shipped to R2 like every built file (backend/generated, pinned in
on_r2.json and fetched by r2.generated): huerta_crops.csv, the crop table; frost_odds_<REGION>.parquet,
each place's frost dates, yearly lows and warm-night season; huerta_windows_<REGION>.npz, the sowing
windows.

Output, private on R2 like the rest: one file per 1° square, huerta/advice/<REGION>/
<lat>_<lon>.json, {day, crops, places: [[name, lat, lon, frost, soil, nights, rain, water,
codes, last_frost, first_frost, later_frost, later_night, warm, blight, lows, gusts, rains]]}: frost
'' / 'g' (ground frost) / 'f' in the next 3 days, codes one letter per crop (CODES), last/first frost the place's
typical day of year of its last spring and first autumn frost (null: none in a typical
year), later_frost the same '' / 'g' / 'f' for days 4-7 and later_night the date of its
first such night (null: none), warm [first day, base64]: the place's daily mean air, one byte a day
((C + 30) x 2, 255 unknown) from up to WARM_DAYS back through the forecast's last full day, what a
planted crop's growth counts in the app (lib/growth; null where none is known), blight the place's blight
weather (blight_bits: bit k when the day before the file's day, plus k days, is a Hutton day; k = 0..7; only
where the run worked it out), lows as warm for each day's coldest hour from LOW_DAYS back, what the app's frost
check on planted crops reads (null where none is known), and gusts and rains each day's strongest gust (km/h)
and its rain (mm) the same way, one byte rounded (255 unknown), for the app's storm warnings and the check after
one (STORMS). A field the run did not work out is null when a later one is there, so the fields keep their
places. For the garden map,
huerta/map/<REGION>/:
index.json {day, n, layers}, places.bin (int16 lat x100, lon x100 per place) and layers.bin,
one byte per place per layer, layer after layer (MAP_LAYERS, then one per crop: its letter;
cold is the week's coldest hour, C + 40, and balance its rain less its evaporation, mm + 100;
then, where the sowing windows are, two per crop for the map's year: <crop>_jan_aug and
<crop>_sep_dec, the months it goes in in a typical year, one bit a month from January and from
September, 255 in the second where the windows have no such place),
so the Worker can hand out one layer with a range read. And huerta/crops.json, what each crop needs
(frost class, soil range, warm nights, days to harvest), for the app to say why. The Huerta Worker hands one place at a
time to the app.
"""
from __future__ import annotations

import base64
import io
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
WARM_DAYS = 400   # days of daily mean air a place's advice carries back, for its planted crops' growth
LOW_DAYS = 7      # days of coldest hours it carries back, for the frost check on planted crops
# Each day's strongest gust (km/h) and rain (mm) from LOW_DAYS back through the forecast, for storm warnings
# and the check after one: (advice field, hourly column, how a day sums it).
STORMS = (("gusts", "gust_kmh", "max"), ("rains", "precip_mm", "sum"))
FULL_DAY = 20     # hours a day's mean needs (the forecast's last day is cut short)
# %: an hour this humid counts toward blight weather (Hutton criteria, AHDB 2017: 90). NBM runs humid against
# US airports (1.7 times their humid hours, 17 Oct - 1 Nov 2026); at 92 % it keeps every blight day they had
# and drops 40 % of the false ones. ICON-EU + ECMWF match European airports at 90 %.
RH_WET = {"SE": 90, "NE": 90, "USE": 92, "USW": 92}
WET_HOURS = 6     # such hours a blight day needs
BLIGHT_MIN = 10   # C: the day's minimum a blight day needs
BLIGHT_DAYS = 8   # the advice's blight bits: the day before its day through the sixth after
# The garden map's own layers: frost (0 none; in the next 3 days 1 ground frost, 2 frost; 3 either
# later in the week), soil
# at 6 cm (degrees C + 40) and the week's water deficit (mm); 255 where unknown.
MAP_LAYERS = ("frost", "soil", "water", "cold", "balance")


def forecast_lift(place):
    """What moves the forecast from its model's height to each place's village's (the frost table's forecast_lift
    and forecast_lift_min, C: data_tools/build_frost_odds.py), as columns mean and min per (lat, lon) to 4
    decimals; None for a table without them."""
    if "forecast_lift" not in place:
        return None
    at = pd.MultiIndex.from_arrays([place["Latitude"].round(4), place["Longitude"].round(4)], names=["lat", "lon"])
    lift = pd.DataFrame({"mean": place["forecast_lift"].to_numpy(float),
                         "min": place["forecast_lift_min"].to_numpy(float)}, index=at)
    return lift[~lift.index.duplicated()]


def at_village(frame, lift, kind):
    """Daily values per place, (lat, lon) x day as daily_air's, moved by `lift` (forecast_lift's `kind` column)."""
    if frame is None or lift is None:
        return frame
    at = pd.MultiIndex.from_arrays([frame.index.get_level_values(0), frame.index.get_level_values(1)])
    return frame.add(lift[kind].reindex(at).fillna(0).to_numpy(), axis=0)


def conditions(forecast, lift=None):
    """Per place (lat, lon): frost3, soil3, night7, rain7, et07; and the forecast's first hour. With `lift`
    (forecast_lift), its days at each place's village's height: means by its mean, minima by its min."""
    start = forecast["time"].min()
    f = forecast.assign(day=((forecast["time"] - start) // pd.Timedelta(hours=24)).astype("int8"))
    keys = ["lat", "lon"]
    soon = f[f["day"] < 3].groupby(keys, sort=False).agg(
        frost3=("t2m_c", "min"), soil3=("soil_c", "mean"), air3=("t2m_c", "mean"))
    days = f.groupby([*keys, "day"], sort=False).agg(
        tmin=("t2m_c", "min"), tmean=("t2m_c", "mean"), rain=("precip_mm", "sum"), sun=("swdown_wm2", "sum"))
    if lift is not None:
        for frame, cols in ((soon, {"frost3": "min", "soil3": "mean", "air3": "mean"}),
                            (days, {"tmin": "min", "tmean": "mean"})):
            at = pd.MultiIndex.from_arrays([frame.index.get_level_values(k).round(4) for k in keys])
            up = lift.reindex(at).fillna(0)
            for col, kind in cols.items():
                frame[col] += up[kind].to_numpy()
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
    with np.load(path) as z:                                 # the calendar's season rows are the year files'
        return {k: z[k] for k in z.files if k != "seasons"}


def window_rows(windows, place):
    """Each place's row in the windows, matched on its coordinates; NaN where they have no such place."""
    def key(lat, lon):
        return np.round(np.asarray(lat, float) * 1e4).astype(np.int64) * 10**8 + np.round(np.asarray(lon, float) * 1e4).astype(np.int64)

    where = pd.Series(np.arange(len(windows["lat"])), index=key(windows["lat"], windows["lon"]))
    where = where[~where.index.duplicated()]
    return where.reindex(key(place["Latitude"], place["Longitude"])).to_numpy()


def in_windows(windows, place, crop, doy):
    """For one crop at each place (matched on its coordinates): today's window letter ('' where the
    windows have no such place or crop); whether it has a window at all; whether its last window is
    nearer than its next (round the year); and the day of year its next one opens. Windows are
    run-length letters per place and crop, place after place."""
    n = len(place)
    letter, ever, late, nxt = np.full(n, "", object), np.zeros(n, bool), np.zeros(n, bool), np.zeros(n, int)
    crops = list(windows["crops"])
    if crop not in crops:
        return letter, ever, late, nxt
    row = window_rows(windows, place)
    have = ~np.isnan(row)
    k = row[have].astype(np.int64) * len(crops) + crops.index(crop)
    a, b = windows["offsets"][k], windows["offsets"][k + 1]
    lengths = b - a
    first = np.concatenate([[0], np.cumsum(lengths)[:-1]])          # each place's first segment, gathered
    seg = np.repeat(np.arange(len(k)), lengths)
    idx = np.repeat(a - first, lengths) + np.arange(lengths.sum())
    starts, codes = windows["starts"][idx].astype(int), windows["codes"][idx]
    letters = windows["letters"]
    today = doy - 1
    upto = np.bincount(seg, starts <= today, minlength=len(k)).astype(int)
    now = codes[first + upto - 1]
    is_n = letters[codes] == "n"
    letter[have] = letters[now]
    ever[have] = np.bincount(seg, is_n, minlength=len(k)) > 0
    # Each window's first and last day; days to the next first and since the last last, round the year.
    ends = np.append(starts[1:], 365)
    ends[first + lengths - 1] = 365
    w = np.flatnonzero(is_n)
    until, since = np.full(len(k), 999), np.full(len(k), 999)
    np.minimum.at(until, seg[w], (starts[w] - today) % 365)
    np.minimum.at(since, seg[w], (today - (ends[w] - 1)) % 365)
    late[have] = since < until
    nxt[have] = (today + until) % 365 + 1
    return letter, ever, late, nxt


def advise(place, crops, doy, windows=None):
    """One status per crop and place: from the sowing windows and this week's weather where the windows
    hold the place and crop, else by the rules (module docstring)."""
    out = rules(place, crops, doy)
    if windows is None:
        return out
    soil, frost3, frostw, night7 = (place[c].to_numpy() for c in ("soil3", "frost3", "frostw", "night7"))
    for c in crops.itertuples(index=False):
        letter, ever, late, nxt = in_windows(windows, place, c.crop, doy)
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
        mark((letter != "") & late, "too_late")                          # the cycle: now, too late, not yet
        over = np.isin(letter, ["l", "x"])                               # this round over, the next one nearer
        mark(over & (nxt >= AUTUMN), "wait_autumn")
        mark(over, "wait_spring")
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


def map_files(place, advice, day, windows=None):
    """{name under huerta/map/<REGION>/: bytes} for the garden map, layers in MAP_LAYERS + crop order, then
    each crop's months from the windows."""
    n = len(place)
    frost = np.select([place["frost3"] <= 0, place["frost3"] <= 2, place["frostw"] <= 2], [2, 1, 3], 0).astype(np.uint8)
    water = (place["et07"] - place["rain7"]).clip(lower=0)
    cold = np.fmin(place["frost3"], place["frostw"])                   # the week's coldest hour
    balance = place["rain7"] - place["et07"]                            # rain to spare, or to water
    columns = [frost, _byte(place["soil3"], 40), _byte(water), _byte(cold, 40), _byte(balance, 100)]
    codes = advice.replace(CODES)
    columns += [np.frombuffer("".join(codes[c]).encode("ascii"), np.uint8) for c in advice.columns]
    names = [*MAP_LAYERS, *advice.columns]
    if windows is not None:
        # ponytail: the year only changes when the windows are rebuilt, sent again each night (~2 bytes a place
        # and crop) so it needs no Worker route of its own.
        row = window_rows(windows, place)
        have = ~np.isnan(row)
        crops = list(windows["crops"])
        for c in advice.columns:
            if c not in crops:
                continue
            months = np.zeros(n, np.uint16)
            months[have] = windows["sow"][row[have].astype(np.int64), crops.index(c)]
            columns += [(months & 0xFF).astype(np.uint8), np.where(have, months >> 8, 255).astype(np.uint8)]
            names += [f"{c}_jan_aug", f"{c}_sep_dec"]
    places = np.column_stack([np.round(place["Latitude"] * 100), np.round(place["Longitude"] * 100)]).astype("<i2")
    index = {"day": day, "n": n, "layers": names}
    return {"index.json": json.dumps(index, separators=(",", ":")).encode(), "places.bin": places.tobytes(),
            "layers.bin": np.concatenate(columns).tobytes()}


def warm_bytes(t):
    """Daily mean air (C) as the advice's bytes: (C + 30) x 2 in 0-254, 255 where unknown."""
    t = np.asarray(t, float)
    return np.where(np.isnan(t), 255, np.clip(np.round((t + 30) * 2), 0, 254)).astype(np.uint8)


def level_bytes(v):
    """Gusts (km/h) or rain (mm) as the advice's bytes: rounded, 0-254, 255 where unknown."""
    v = np.asarray(v, float)
    return np.where(np.isnan(v), 255, np.clip(np.round(v), 0, 254)).astype(np.uint8)


def day_means(rows, how="mean", column="t2m_c"):
    """Hourly rows (time, lat, lon, `column`) as each place's daily mean air (`how` "min": its coldest hour;
    another column, as `how` sums its day), (key_lat, key_lon) x day: an hour belongs to the UTC day it starts
    in, as the past days; a day of fewer than FULL_DAY hours is unknown."""
    rows = rows.assign(day=(rows["time"] - pd.Timedelta(hours=1)).dt.strftime("%Y-%m-%d"),
                       key_lat=rows["lat"].round(4), key_lon=rows["lon"].round(4))
    g = rows.groupby(["key_lat", "key_lon", "day"])[column]
    return g.agg(how).where(g.count() >= FULL_DAY).unstack("day")


def humidity(t, td):
    """Relative humidity (%) from air and dew point temperature (C): Magnus, Alduchov & Eskridge (1996)."""
    t, td = np.asarray(t, float), np.asarray(td, float)
    return 100 * np.exp(17.625 * td / (243.04 + td) - 17.625 * t / (243.04 + t))


def blight_bits(hours, day, rh_wet=90):
    """Blight weather at each place (key_lat, key_lon), as an int: bit k when the solar day `day` - 1 + k
    (k = 0..7) is a Hutton day, the second of two days in a row each with a minimum of at least BLIGHT_MIN and
    WET_HOURS hours or more at `rh_wet` % or more (RH_WET, by region). `hours`: time (UTC), lat, lon, t2m_c,
    td2m_c. A solar day starts
    at midnight at the place's longitude (UTC + lon / 15 h), as the Met Office day the criteria were built on;
    one with fewer than FULL_DAY hours never counts."""
    h = hours.dropna(subset=["t2m_c", "td2m_c"])
    solar = h["time"].dt.tz_convert(None) + pd.to_timedelta(h["lon"] * 240, unit="s")
    d = pd.DataFrame({"key_lat": h["lat"].round(4), "key_lon": h["lon"].round(4), "day": solar.dt.normalize(),
                      "t": h["t2m_c"], "wet": humidity(h["t2m_c"], h["td2m_c"]) >= rh_wet})
    days = d.groupby(["key_lat", "key_lon", "day"]).agg(n=("t", "size"), tmin=("t", "min"), wet=("wet", "sum"))
    ok = (days["n"] >= FULL_DAY) & (days["tmin"] >= BLIGHT_MIN) & (days["wet"] >= WET_HOURS)
    span = pd.date_range(pd.Timestamp(day) - pd.Timedelta(days=2), periods=BLIGHT_DAYS + 1)
    grid = ok.unstack("day", fill_value=False).reindex(columns=span, fill_value=False)
    a = grid.to_numpy(bool)
    bits = (a[:, 1:] & a[:, :-1]).astype(np.int64) @ (1 << np.arange(BLIGHT_DAYS, dtype=np.int64))
    return pd.Series(bits, index=grid.index, name="blight")


def _past_hours(region, day, s3=None, bucket=None, columns=("time", "lat", "lon", "t2m_c")):
    """One past day's hours at the region's places: here if kept, else from R2; None if neither has it, or it has
    no such column (written before the column was fetched)."""
    import hourly_weather
    path = hourly_weather.OUT_DIR / region / "past" / f"{day}.parquet"
    if not path.exists():
        if s3 is None:
            return None
        try:
            path = io.BytesIO(s3.get_object(Bucket=bucket, Key=f"hourly_weather/{region}/past/{day}.parquet")["Body"].read())
        except Exception:  # noqa: BLE001 - a night without weather
            return None
    try:
        return pd.read_parquet(path, columns=list(columns))
    except (KeyError, ValueError):  # pyarrow: no such column
        return None


def daily_air(region, forecast, s3=None, bucket=None, how="mean", back=WARM_DAYS, column="t2m_c"):
    """Each place's daily mean air (C, NaN unknown; `how` "min": its coldest hour; another `column`, its day as
    `how` sums it: STORMS), (key_lat, key_lon) x every day from `back` days back to the forecast's last full day:
    the past days, kept here in HOURLY_WEATHER_DIR/<REGION>/daily_air.npz (daily_min.npz, daily_max_gust_kmh.npz
    ...) and topped up each night with those it lacks (here, else on R2); then today, its past hours with the
    forecast's, and the forecast's days."""
    import hourly_weather
    air = column == "t2m_c"
    encode, decode = (warm_bytes, lambda b: b / 2 - 30) if air else (level_bytes, lambda b: b)
    name = "daily_air" if air and how == "mean" else f"daily_{how}" if air else f"daily_{how}_{column}"
    store = hourly_weather.OUT_DIR / region / f"{name}.npz"
    today = (forecast["time"].min() - pd.Timedelta(hours=1)).strftime("%Y-%m-%d")
    first = (pd.Timestamp(today) - pd.Timedelta(days=back)).strftime("%Y-%m-%d")
    past = pd.DataFrame(index=pd.MultiIndex.from_arrays([[], []], names=["key_lat", "key_lon"]))
    if store.exists():
        with np.load(store) as z:
            b = z["b"].astype(float)
            past = pd.DataFrame(np.where(b == 255, np.nan, decode(b)), columns=z["days"].tolist(),
                                index=pd.MultiIndex.from_arrays([z["lat"], z["lon"]], names=["key_lat", "key_lon"]))
    days = {p.stem for p in (hourly_weather.OUT_DIR / region / "past").glob("*.parquet")}
    if s3 is not None:
        pages = s3.get_paginator("list_objects_v2").paginate(Bucket=bucket, Prefix=f"hourly_weather/{region}/past/")
        days |= {o["Key"].rsplit("/", 1)[-1].removesuffix(".parquet") for page in pages for o in page.get("Contents", [])}
    for day in sorted(d for d in days if first <= d < today and d not in past.columns):
        rows = _past_hours(region, day, s3, bucket, ("time", "lat", "lon", column))
        if rows is not None:
            means = day_means(rows, how, column)
            if day in means:
                past = past.join(means[[day]], how="outer")
    past = past[sorted(c for c in past.columns if first <= c < today)]
    store.parent.mkdir(parents=True, exist_ok=True)
    np.savez(store, lat=past.index.get_level_values(0).to_numpy(float),
             lon=past.index.get_level_values(1).to_numpy(float), days=np.array(past.columns, dtype=str),
             b=encode(past.to_numpy(float)).reshape(len(past), len(past.columns)))  # no past days yet: (0, 0)
    now = forecast[["time", "lat", "lon", column]]
    kept = _past_hours(region, today, columns=("time", "lat", "lon", column))
    if kept is not None:
        now = pd.concat([kept, now], ignore_index=True)
    ahead = day_means(now, how, column)
    ahead = ahead[[c for c in ahead.columns if c >= today and ahead[c].notna().any()]]
    air = past.join(ahead, how="outer")
    if not len(air.columns):
        return air
    return air.reindex(columns=pd.date_range(min(air.columns), max(air.columns)).strftime("%Y-%m-%d"))


def blight_hours(region, forecast, s3=None, bucket=None):
    """The hours blight_bits reads: the past hours of the run's day and the two before it (a solar day east of
    Greenwich starts before UTC midnight), then the forecast's."""
    cols = ["time", "lat", "lon", "t2m_c", "td2m_c"]
    start = forecast["time"].min()
    run = (start - pd.Timedelta(hours=1)).normalize()
    past = [_past_hours(region, f"{run - pd.Timedelta(days=k):%Y-%m-%d}", s3, bucket, cols) for k in (2, 1, 0)]
    past = [p[p["time"] < start] for p in past if p is not None]
    return pd.concat([*past, forecast[cols]], ignore_index=True)


def area_files(place, advice, day, air=None, blight=None, lows=None, storms=None):
    """{R2 key suffix '<lat>_<lon>.json': file bytes}: every place of a 1° square, compact. With `air`
    (daily_air), each place's `warm`; with `blight` (blight_bits), its blight bits after it; with `lows` (daily_air
    "min"), its lows after them; with `storms` ({gusts, rains}: daily_air of STORMS), its gusts and rains last. A
    field not given is null where a later one is, so the fields keep their places."""
    frost = np.select([place["frost3"] <= 0, place["frost3"] <= 2], ["f", "g"], "")
    later = np.select([place["frostw"] <= 0, place["frostw"] <= 2], ["f", "g"], "")
    water = (place["et07"] - place["rain7"]).clip(lower=0)
    codes = advice.replace(CODES).agg("".join, axis=1)
    keys = pd.MultiIndex.from_arrays([place["Latitude"].round(4), place["Longitude"].round(4)])

    def by_day(frame, encode=warm_bytes):
        # [first day, base64 of its bytes] per place, null where no day is known.
        # ponytail: warm_bytes floors at -30 C; a colder night still reads as colder than every crop's limit.
        if frame is None:
            return None
        if not len(frame.columns):
            return [None] * len(place)
        b = encode(frame.reindex(keys).to_numpy(float))
        return [[frame.columns[0], base64.b64encode(r.tobytes()).decode()] if k else None
                for r, k in zip(b, (b != 255).any(axis=1))]

    storms = storms or {}
    fields = [by_day(air),
              blight.reindex(keys).fillna(0).astype(int).tolist() if blight is not None else None,
              by_day(lows),
              *(by_day(storms.get(name), level_bytes) for name, _, _ in STORMS)]
    given = [k for k, f in enumerate(fields) if f is not None]
    tails = [[f[i] if f is not None else None for f in fields[:given[-1] + 1]] if given else []
             for i in range(len(place))]
    rows = pd.DataFrame({
        "square": np.floor(place["Latitude"]).astype(int).astype(str) + "_"
        + np.floor(place["Longitude"]).astype(int).astype(str),
        "row": [[name, float(la), float(lo), fr, _number(s), _number(n), _number(r), _number(w, 0), c,
                 _day(last), _day(first), lf, ln if lf else None, *tail]
                for name, la, lo, fr, s, n, r, w, c, last, first, lf, ln, tail in zip(
                    place["Location_Id"].str.rsplit("_", n=2).str[0], place["Latitude"], place["Longitude"],
                    frost, place["soil3"], place["night7"], place["rain7"], water, codes,
                    place["last0_median"], place["first0_median"], later, place["frostw_night"], tails)],
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
    place = pd.read_parquet(frost_path)
    lift = forecast_lift(place)
    cond, start = conditions(forecast, lift)
    day = start + pd.Timedelta(hours=12)                             # the morning after the run
    for frame, (la, lo) in ((place, ("Latitude", "Longitude")), (cond, ("lat", "lon"))):
        frame["key_lat"], frame["key_lon"] = frame[la].round(4), frame[lo].round(4)
    place = place.merge(cond.drop(columns=["lat", "lon"]), on=["key_lat", "key_lon"], how="inner")
    crops = pd.read_csv(crops_path)
    windows = load_windows(region)
    if windows is None:
        print(f"Huerta: no sowing windows for {region}, the rules decide")
    advice = advise(place, crops, day.dayofyear, windows)
    s3, bucket = r2.client(), os.environ["R2_BUCKET_NAME"]
    try:
        air = daily_air(region, forecast, s3, bucket)
    except Exception as e:  # noqa: BLE001 - the advice goes out without it
        air = None
        print(f"Huerta: no daily air: {e!r}")
    try:
        blight = blight_bits(blight_hours(region, forecast, s3, bucket), f"{day:%Y-%m-%d}", RH_WET[region])
    except Exception as e:  # noqa: BLE001 - the advice goes out without it
        blight = None
        print(f"Huerta: no blight weather: {e!r}")
    try:
        lows = daily_air(region, forecast, s3, bucket, "min", LOW_DAYS)
    except Exception as e:  # noqa: BLE001 - the advice goes out without it
        lows = None
        print(f"Huerta: no nightly lows: {e!r}")
    try:
        storms = {name: daily_air(region, forecast, s3, bucket, how, LOW_DAYS, column) for name, column, how in STORMS}
    except Exception as e:  # noqa: BLE001 - the advice goes out without it
        storms = None
        print(f"Huerta: no storm weather: {e!r}")
    air, lows = at_village(air, lift, "mean"), at_village(lows, lift, "min")
    files = area_files(place, advice, f"{day:%Y-%m-%d}", air, blight, lows, storms)
    with ThreadPoolExecutor(UPLOAD_WORKERS) as pool:
        list(pool.map(lambda kv: s3.put_object(Bucket=bucket, Key=f"huerta/advice/{region}/{kv[0]}", Body=kv[1],
                                               ContentType="application/json"), files.items()))
    s3.put_object(Bucket=bucket, Key="huerta/crops.json", Body=crop_needs(crops), ContentType="application/json")
    # The index last, so the map never reads an index ahead of its layers.
    maps = map_files(place, advice, f"{day:%Y-%m-%d}", windows)
    for name in ("places.bin", "layers.bin", "index.json"):
        s3.put_object(Bucket=bucket, Key=f"huerta/map/{region}/{name}", Body=maps[name],
                      ContentType="application/json" if name.endswith(".json") else "application/octet-stream")
    print(f"Huerta: {len(place):,} places in {len(files)} area files for {day:%Y-%m-%d}, "
          f"{time.time() - started:.0f} s; sow or plant now at a typical place: "
          f"{int((advice == 'now').sum(axis=1).median())} of {advice.shape[1]} crops"
          + (f"; blight weather this week at {(blight > 0).mean():.0%} of places" if blight is not None else ""))
    return len(files)
