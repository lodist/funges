"""Seasonality multipliers shared by the regional scoring scripts."""
import numpy as np
import pandas as pd

# Day-of-year of each month's midpoint (Jan..Dec).
_MONTH_MID_DOY = np.array([15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349])


def empirical_season_multiplier(dates, season_curve):
    """Smooth per-day multiplier from a 12-month curve {month(1-12): value}."""
    curve = {int(k): float(v) for k, v in season_curve.items()}
    vals = np.array([curve[m] for m in range(1, 13)], dtype=float)
    xp = np.concatenate(([_MONTH_MID_DOY[-1] - 365], _MONTH_MID_DOY, [_MONTH_MID_DOY[0] + 365]))
    fp = np.concatenate(([vals[-1]], vals, [vals[0]]))
    return np.interp(dates.dt.dayofyear.to_numpy(), xp, fp)


def season_months_ramp(dates, params):
    """Flat 1.0 inside season_months, linear ramp down to season_factor outside."""
    ramp_days = 31
    allowed_months = set(params["season_months"])
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
    factor = params.get("season_factor", 0.5)
    return np.where(in_season, 1, np.clip(1 - (1 - factor) * dist / ramp_days, factor, 1))


def season_multiplier_for_species(df, specie, params, zone_curves):
    """Per-row multiplier; precedence: zone curve -> region curve -> season_months ramp -> 1.0.

    df needs 'Date' and 'climate_zone'; zone_curves is {zone: {species: {month: mult}}}.
    """
    n = len(df)
    dates = df['Date']
    if "season_curve" in params:
        mult = np.asarray(empirical_season_multiplier(dates, params["season_curve"]), dtype=float)
    elif "season_months" in params:
        mult = np.asarray(season_months_ramp(dates, params), dtype=float)
    else:
        mult = np.ones(n, dtype=float)

    zones = df['climate_zone'].to_numpy()
    for zone, sp_map in zone_curves.items():
        curve = sp_map.get(specie)
        if not curve:
            continue
        mask = zones == zone
        if mask.any():
            mult[mask] = empirical_season_multiplier(dates[mask], curve)
    return mult
