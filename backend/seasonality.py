"""Seasonality multipliers shared by the regional scoring scripts."""
import numpy as np
import pandas as pd

# Day-of-year of each month's midpoint (Jan..Dec).
_MONTH_MID_DOY = np.array([15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349])

# Gate thresholds, as a fraction of the species' peak effort-normalised monthly rate.
# Below GATE_OFF the species is treated as not fruiting; above GATE_FULL it is unrestricted;
# in between the gate ramps, so shoulder seasons stay smooth instead of switching on.
#
# Swept on the Apr-Aug 2026 grid over 17 region-species (scripts/qa_season_simulate.py).
# Season AUC / dead-month cell-days above the recommendation threshold / median onset error:
#   no gate      0.707 / 40.8% / 27 days   (7 of 17 region-species below random)
#   0.05, 0.15   0.931 /  4.6% / 21 days   (one species never reaches the threshold)
#   0.02, 0.10   0.923 /  9.1% / 15 days   <- chosen
#   0.01, 0.04   0.884 / 18.5% / 10 days
# Tightening past 0.02/0.10 keeps buying separation but starts pushing the season start
# later than the observed one, which is the failure mode being fixed in the first place.
GATE_OFF = 0.02
GATE_FULL = 0.10
# Fallback gate floor for species with no empirical ratio, driven by season_months only.
# Not 0.0: season_months is hand-curated and coarse, so a hard zero there would erase a
# species on the strength of a month boundary somebody typed.
SEASON_MONTHS_GATE_FLOOR = 0.25


# The learned plant season (tools/fit_phenology.py): per 0.25 degree cell of the ERA5 normals
# grid, each week's share of a plant's sightings in the stage people pick, against its yearly
# peak there (uint8: x 254, 255 off the grid). Weeks centre on these days of the year; a day
# blends the two either side. It becomes the multiplier and gate as an empirical curve does.
PHENOLOGY_WEEK_DOY = np.arange(4, 365, 7)
# The plant gate is stricter than the fungi curves' (fully open at 10% of the peak): a
# plant's out-of-season tail is reports of the odd late fruit, 8-10% of the peak per
# sighting for wild strawberry in North Europe from September, and should not reopen it.
PHENOLOGY_GATE_OFF, PHENOLOGY_GATE_FULL = 0.10, 0.30
# Inside the open season the plant multiplier only tilts, between 0.8 and 1.0, not the fungi
# curves' 0.6: the months it replaces held the whole window at 1.0 and the gate already shuts
# the off-season. The tilt sets the map's level, not the ranking (the held-out AUC is the same
# at 0.6 and 0.8).
PHENOLOGY_LOW = 0.8


# The mushrooms' local season (tools/build_local_season.py): per 0.2 degree cell, each month's
# effort-corrected activity against the peak month there, from the records around it (uint8:
# x 254, 255 where it has no curve). A day blends the months either side, as the region curves
# do. It replaces the region and zone curves, which gave half a continent one season.
LOCAL_LOW = 0.6  # the multiplier's floor, the region curves' (build_season_curves --low)


def local_season_ratio(df, model):
    """The local season at each row's place and day (1 = its peak month there). NaN where the
    grid does not reach or has no curve, which leaves the row to the region and zone curves."""
    lat, lon = model["lat"], model["lon"]
    i = np.rint((lat[0] - df["Latitude"].to_numpy(float)) / (lat[0] - lat[1])).astype(int)
    j = np.rint((df["Longitude"].to_numpy(float) - lon[0]) / (lon[1] - lon[0])).astype(int)
    inside = (i >= 0) & (i < len(lat)) & (j >= 0) & (j < len(lon))
    i, j = np.clip(i, 0, len(lat) - 1), np.clip(j, 0, len(lon) - 1)
    doy = pd.to_datetime(df["Date"]).dt.dayofyear.to_numpy(float)
    ext = np.concatenate([[_MONTH_MID_DOY[-1] - 365], _MONTH_MID_DOY, [_MONTH_MID_DOY[0] + 365]])
    month = np.concatenate([[11], np.arange(12), [0]])
    hi = np.searchsorted(ext, doy, side="right").clip(1, len(ext) - 1)
    frac = (doy - ext[hi - 1]) / (ext[hi] - ext[hi - 1])

    def values_at(m):
        v = model["ratio"][m, i, j].astype(float)
        return np.where(v == 255, np.nan, v / 254.0)

    r = (1 - frac) * values_at(month[hi - 1]) + frac * values_at(month[hi])
    return np.where(inside, r, np.nan)


def phenology_multiplier(ratio):
    return PHENOLOGY_LOW + (1.0 - PHENOLOGY_LOW) * np.asarray(ratio, float)


def phenology_gate(ratio):
    return np.clip((np.asarray(ratio, float) - PHENOLOGY_GATE_OFF) / (PHENOLOGY_GATE_FULL - PHENOLOGY_GATE_OFF), 0.0, 1.0)


def blend_weeks(values_at, doys):
    """values_at(week index per row) -> that week's ratio per row; each day of the year
    blends the weeks either side of it, across the turn of the year too."""
    position = (np.asarray(doys, float) - PHENOLOGY_WEEK_DOY[0]) / 7.0
    before = np.floor(position).astype(int)
    weight = position - before
    n = len(PHENOLOGY_WEEK_DOY)
    return (1 - weight) * values_at(before % n) + weight * values_at((before + 1) % n)


def phenology_ratio(df, model):
    """The learned season at each row's place and day (1 = its peak week there). NaN where the
    grid does not reach, which leaves the row to the curves or the months."""
    lat, lon = model["lat"], model["lon"]
    i = np.rint((lat[0] - df["Latitude"].to_numpy(float)) / (lat[0] - lat[1])).astype(int)
    j = np.rint((df["Longitude"].to_numpy(float) - lon[0]) / (lon[1] - lon[0])).astype(int)
    inside = (i >= 0) & (i < len(lat)) & (j >= 0) & (j < len(lon))
    i, j = np.clip(i, 0, len(lat) - 1), np.clip(j, 0, len(lon) - 1)

    def values_at(week):
        v = model["ratio"][week, i, j].astype(float)
        return np.where(v == 255, np.nan, v / 254.0)

    r = blend_weeks(values_at, pd.to_datetime(df["Date"]).dt.dayofyear.to_numpy())
    return np.where(inside, r, np.nan)


def _as_month_map(values):
    return {int(k): float(v) for k, v in values.items()}


def normalize_curve(raw):
    """Coerce either curve schema off the wire into the canonical two-part form.

    Loaders must go through this rather than doing `{int(k): float(v)}` themselves: on the
    two-part schema that idiom raises on `int("multiplier")`, and because the loaders catch
    Exception and fall back, the failure is silent -- production would quietly drop every
    empirical curve and run on `season_months` alone.
    """
    if not raw:
        return None
    if "multiplier" in raw:
        curve = {"multiplier": _as_month_map(raw["multiplier"])}
        if raw.get("ratio"):
            curve["ratio"] = _as_month_map(raw["ratio"])
        return curve
    return {"multiplier": _as_month_map(raw)}


def split_curve(season_curve):
    """Accept either curve schema and return (multiplier_map, ratio_map_or_None).

    Old schema is a flat {month: multiplier}. Current schema is
    {"multiplier": {month: v}, "ratio": {month: v}}, where `ratio` is the uncompressed
    effort-normalised monthly signal (peak = 1.0) that the gate needs.
    """
    if not season_curve:
        return None, None
    if "multiplier" in season_curve:
        ratio = season_curve.get("ratio")
        return _as_month_map(season_curve["multiplier"]), (_as_month_map(ratio) if ratio else None)
    return _as_month_map(season_curve), None


def empirical_season_multiplier(dates, season_curve):
    """Smooth per-day multiplier from a 12-month curve {month(1-12): value}."""
    curve, _ratio = split_curve(season_curve)
    return _interpolate_months(dates, curve)


def _interpolate_months(dates, curve):
    vals = np.array([curve[m] for m in range(1, 13)], dtype=float)
    xp = np.concatenate(([_MONTH_MID_DOY[-1] - 365], _MONTH_MID_DOY, [_MONTH_MID_DOY[0] + 365]))
    fp = np.concatenate(([vals[-1]], vals, [vals[0]]))
    return np.interp(dates.dt.dayofyear.to_numpy(), xp, fp)


def season_months_ramp(dates, params):
    """Flat 1.0 inside season_months, linear ramp down to season_factor outside."""
    return _months_ramp(dates, params["season_months"], params.get("season_factor", 0.5))


def _months_ramp(dates, allowed_months, factor, ramp_days=31):
    """The ramp depends only on the date, and a nightly run scores a handful of dates on up to
    ~10^6 rows: worked out once per distinct date. Per row it built a rows x in-season-days
    matrix, ~1 GB per call on US West, twice per species."""
    unique, rows = np.unique(pd.to_datetime(dates).to_numpy(), return_inverse=True)
    return _months_ramp_rows(pd.Series(unique), allowed_months, factor, ramp_days)[rows.reshape(-1)]


def _months_ramp_rows(dates, allowed_months, factor, ramp_days=31):
    allowed_months = set(allowed_months)
    in_season = dates.dt.month.isin(allowed_months)
    day_of_year = dates.dt.dayofyear
    valid_days = np.concatenate([
        pd.date_range(f'2021-{m:02d}-01', f'2021-{m:02d}-{pd.Period(f"2021-{m:02d}").days_in_month}')
          .dayofyear.to_numpy()
        for m in sorted(allowed_months)
    ])
    dist = np.minimum(
        np.abs(day_of_year.values[:, None] - valid_days[None, :]),
        365 - np.abs(day_of_year.values[:, None] - valid_days[None, :])
    ).min(axis=1)
    return np.where(in_season, 1, np.clip(1 - (1 - factor) * dist / ramp_days, factor, 1))


def _resolve_curve(df, specie, params, zone_curves):
    """Per-row (multiplier, ratio) with zone curves overriding the region curve.

    Precedence matches the model: learned plant season -> local season -> zone curve ->
    region curve -> None. `ratio` is None for any row whose winning curve predates the
    two-part schema.
    """
    n = len(df)
    dates = df['Date']
    multiplier = np.full(n, np.nan)
    ratio = np.full(n, np.nan)

    curve, curve_ratio = split_curve(params.get("season_curve"))
    if curve:
        multiplier = _interpolate_months(dates, curve)
        if curve_ratio:
            ratio = _interpolate_months(dates, curve_ratio)

    zones = df['climate_zone'].to_numpy()
    for zone, sp_map in zone_curves.items():
        zone_curve, zone_ratio = split_curve(sp_map.get(specie))
        if not zone_curve:
            continue
        mask = zones == zone
        if not mask.any():
            continue
        multiplier[mask] = _interpolate_months(dates[mask], zone_curve)
        ratio[mask] = _interpolate_months(dates[mask], zone_ratio) if zone_ratio else np.nan
    if params.get("local_season") is not None:  # the mushrooms' season where they grow
        local = local_season_ratio(df, params["local_season"])
        on = np.isfinite(local)
        multiplier[on] = LOCAL_LOW + (1.0 - LOCAL_LOW) * local[on]
        ratio[on] = local[on]
    if params.get("phenology") is not None:     # the learned plant season comes first
        learned = phenology_ratio(df, params["phenology"])
        on = np.isfinite(learned)
        multiplier[on] = phenology_multiplier(learned[on])
        ratio[on] = learned[on]
    return multiplier, ratio


def season_multiplier_for_species(df, specie, params, zone_curves):
    """Per-row multiplier; precedence: zone curve -> region curve -> season_months ramp -> 1.0.

    df needs 'Date' and 'climate_zone'; zone_curves is {zone: {species: {month: mult}}}.
    """
    multiplier, _ratio = _resolve_curve(df, specie, params, zone_curves)
    missing = ~np.isfinite(multiplier)
    if missing.any():
        if "season_months" in params:
            fallback = season_months_ramp(df['Date'], params)
        else:
            fallback = np.ones(len(df), dtype=float)
        multiplier = np.where(missing, fallback, multiplier)
    return multiplier


def season_gate_for_species(df, specie, params, zone_curves):
    """Per-row gate in [0, 1] that can actually reach zero out of season.

    The multiplier alone cannot express "this species does not fruit now": it is
    compressed into a narrow band and then multiplied against a 0-10 weather score, so
    weather always wins. The gate is the part that is allowed to say no.

    Uses the uncompressed empirical ratio where the curve provides one, and falls back to
    the hand-curated season_months otherwise.
    """
    _multiplier, ratio = _resolve_curve(df, specie, params, zone_curves)
    gate = np.clip((ratio - GATE_OFF) / (GATE_FULL - GATE_OFF), 0.0, 1.0)

    missing = ~np.isfinite(ratio)
    if missing.any():
        if "season_months" in params:
            fallback = _months_ramp(df['Date'], params["season_months"], SEASON_MONTHS_GATE_FLOOR)
        else:
            fallback = np.ones(len(df), dtype=float)
        gate = np.where(missing, fallback, gate)
    if params.get("phenology") is not None:
        learned = phenology_ratio(df, params["phenology"])
        on = np.isfinite(learned)
        gate = np.where(on, phenology_gate(np.where(on, learned, 0.0)), gate)
    return gate
