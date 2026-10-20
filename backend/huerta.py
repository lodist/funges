"""Huerta, the garden space: this week's advice at every place, from the night's hourly
forecast, each place's frost climate and the crop table, published for the app.

Per place: the coldest hour of the next 3 days (frost3), the mean soil temperature at 6 cm
over them (soil3; NBM has none, so in the US the air's three-day mean stands in), the
week's mean night (night7), its rain (rain7) and reference evaporation (et07, Hargreaves'
radiation formula). Per crop, the first rule that applies:
- a crop that goes in only in autumn (bulbs, winter rye) -> wait_autumn before July; one that
  goes in only in spring (asparagus crowns) -> wait_spring from July;
- tender: no warm-night season here -> not_here; an autumn frost before harvest in more
  than 1 year in 10, or harvest past the end of the warm-night season -> too_late; a frost
  (<= 2 C) in the next 3 days, or one still to come in more than 1 year in 10 ->
  wait_frost; over two weeks before the warm nights normally begin, or this week's nights
  below its need -> wait_warm; soil below its need -> wait_soil (too_late from July on: the
  soil only cools);
- hardier crops: soil below or above its range -> wait_soil (too_late from July on) /
  too_warm; half-hardy ones also wait out a hard frost (-3 C) in the forecast, or one still
  to come in more than half the years; unless its winters are mild enough for the crop to
  overwinter, a hard frost before harvest in more than half the years -> too_late;
- otherwise: now.

Inputs, local and never in the repo: HUERTA_DIR (default app_operation/huerta) holds
crops.csv, the crop table; FROST_ODDS_DIR (default app_operation/frost_odds) holds
<REGION>_frost.parquet, each place's frost dates, yearly lows and warm-night season.

Output, private on R2 like the rest: one file per 1° square, huerta/advice/<REGION>/
<lat>_<lon>.json, {day, crops, places: [[name, lat, lon, frost, soil, nights, rain, water,
codes, last_frost, first_frost]]}: frost '' / 'g' (ground frost) / 'f', codes one letter per
crop (CODES), last/first frost the place's typical day of year of its last spring and first
autumn frost (null: none in a typical year). And huerta/crops.json, what each crop needs
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

APP = Path(__file__).resolve().parents[2]
HUERTA_DIR = Path(os.getenv("HUERTA_DIR") or APP / "huerta")
FROST_ODDS_DIR = Path(os.getenv("FROST_ODDS_DIR") or APP / "frost_odds")
SAFE = 0.1      # tender crops: a frost before harvest in at most 1 year in 10
RISKY = 0.5     # hardier crops: a hard frost before harvest in at most half the years
EARLY = 14      # days before the warm nights normally begin that a tender crop may go out
AUTUMN = 182    # day of year (1 July): soil too cold means too late from here; autumn crops open
CODES = {"now": "n", "wait_frost": "f", "wait_soil": "s", "wait_warm": "w", "too_warm": "h",
         "too_late": "l", "not_here": "x", "wait_autumn": "a", "wait_spring": "p"}
UPLOAD_WORKERS = 16


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
    out = soon.join(week).reset_index()
    out["soil3"] = out["soil3"].fillna(out.pop("air3"))
    return out, start


def frost_risk(place, name, doy, days):
    """Per place, over the years: the share with a frost (threshold `name`, 0 or m3) still to
    come after day `doy` in spring, and the share with an autumn one by day `doy + days`."""
    years = [c.split("_")[1] for c in place.columns if c.startswith(f"last{name}_") and c.split("_")[1].isdigit()]
    last = place[[f"last{name}_{y}" for y in years]].to_numpy()
    first = place[[f"first{name}_{y}" for y in years]].to_numpy()
    return (last >= doy).mean(axis=1), ((first > 0) & (first <= doy + days)).mean(axis=1)


def advise(place, crops, doy):
    """One status per crop and place, by the rules in the module docstring."""
    soil, frost3, night7 = (place[c].to_numpy() for c in ("soil3", "frost3", "night7"))
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


def area_files(place, advice, day):
    """{R2 key suffix '<lat>_<lon>.json': file bytes}: every place of a 1° square, compact."""
    frost = np.select([place["frost3"] <= 0, place["frost3"] <= 2], ["f", "g"], "")
    water = (place["et07"] - place["rain7"]).clip(lower=0)
    codes = advice.replace(CODES).agg("".join, axis=1)
    rows = pd.DataFrame({
        "square": np.floor(place["Latitude"]).astype(int).astype(str) + "_"
        + np.floor(place["Longitude"]).astype(int).astype(str),
        "row": [[name, float(la), float(lo), fr, _number(s), _number(n), _number(r), _number(w, 0), c,
                 _day(last), _day(first)]
                for name, la, lo, fr, s, n, r, w, c, last, first in zip(
                    place["Location_Id"].str.rsplit("_", n=2).str[0], place["Latitude"], place["Longitude"],
                    frost, place["soil3"], place["night7"], place["rain7"], water, codes,
                    place["last0_median"], place["first0_median"])],
    })
    crops = list(advice.columns)
    return {f"{square}.json": json.dumps({"day": day, "crops": crops, "places": list(group["row"])},
                                         ensure_ascii=False, separators=(",", ":")).encode()
            for square, group in rows.groupby("square", sort=False)}


def publish(region, forecast):
    """Tonight's advice at the region's places, as area files on R2. Skipped, with a line in
    the log, when the crop table or the region's frost climate is not on this machine."""
    started = time.time()
    crops_path, frost_path = HUERTA_DIR / "crops.csv", FROST_ODDS_DIR / f"{region}_frost.parquet"
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
    advice = advise(place, crops, day.dayofyear)
    files = area_files(place, advice, f"{day:%Y-%m-%d}")

    import r2
    s3, bucket = r2.client(), os.environ["R2_BUCKET_NAME"]
    with ThreadPoolExecutor(UPLOAD_WORKERS) as pool:
        list(pool.map(lambda kv: s3.put_object(Bucket=bucket, Key=f"huerta/advice/{region}/{kv[0]}", Body=kv[1],
                                               ContentType="application/json"), files.items()))
    s3.put_object(Bucket=bucket, Key="huerta/crops.json", Body=crop_needs(crops), ContentType="application/json")
    print(f"Huerta: {len(place):,} places in {len(files)} area files for {day:%Y-%m-%d}, "
          f"{time.time() - started:.0f} s; sow or plant now at a typical place: "
          f"{int((advice == 'now').sum(axis=1).median())} of {advice.shape[1]} crops")
    return len(files)
