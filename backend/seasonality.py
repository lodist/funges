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

    Precedence matches the model: zone curve -> region curve -> None. `ratio` is None
    for any row whose winning curve predates the two-part schema.
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
    return gate
