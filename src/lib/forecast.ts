// Forecast slider helpers. Day 0 = today (today tileset); days 1..6 = forecast tileset.
export const FORECAST_DAYS = 7;
export const FORECAST_REGIONS = ['ne', 'se', 'use', 'usw'] as const;

/** "D/M" label for the date `dayIndex` days after `base`. */
export function forecastDayLabel(base: Date, dayIndex: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + dayIndex);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

/** Return a copy of a fill-color `interpolate` expression whose input is the
 *  linear interpolation between today (d0 = `<species>_score`) and day-6
 *  (`<species>_score_d6`) at `frac` in [0,1]. Missing props coalesce to 0. */
export function setForecastFraction(
  fillColor: unknown[],
  species: string,
  frac: number
): unknown[] {
  const copy = [...fillColor];
  const d0 = ['coalesce', ['get', `${species}_score`], 0];
  const d6 = ['coalesce', ['get', `${species}_score_d6`], 0];
  copy[2] = ['+', d0, ['*', frac, ['-', d6, d0]]];
  return copy;
}

/** Forecast layer id for a species code + region (matches add-forecast-layers.cjs). */
export function forecastLayerId(speciesCode: string, region: string): string {
  return `${speciesCode}_${region}_fc`;
}
