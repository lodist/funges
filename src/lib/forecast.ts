// Forecast slider helpers. Day 0 = today (today tileset); days 1..6 = forecast tileset.
export const FORECAST_DAYS = 7;
export const FORECAST_REGIONS = ['ne', 'se', 'use', 'usw'] as const;

/** "D/M" label for the date `dayIndex` days after `base`. */
export function forecastDayLabel(base: Date, dayIndex: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + dayIndex);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

/** Return a copy of a fill-color `interpolate` expression with its input
 *  rewritten to `<species>_score_d{day}`. The colour ramp is preserved. */
export function setDayOnFillColor(
  fillColor: unknown[],
  species: string,
  day: number
): unknown[] {
  const copy = [...fillColor];
  copy[2] = ['get', `${species}_score_d${day}`];
  return copy;
}

/** Forecast layer id for a species code + region (matches add-forecast-layers.cjs). */
export function forecastLayerId(speciesCode: string, region: string): string {
  return `${speciesCode}_${region}_fc`;
}
