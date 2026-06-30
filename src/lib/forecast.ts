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
  // Missing _d6 means "flat": fall back to d0 so un-forecastable polygons hold
  // their value instead of fading to 0. A stored _d6 (incl. 0) is a real decline.
  const d6 = ['coalesce', ['get', `${species}_score_d6`], ['get', `${species}_score`], 0];
  copy[2] = ['+', d0, ['*', frac, ['-', d6, d0]]];
  return copy;
}

/** Interpolate a forecast feature's per-species scores to slider fraction `frac`.
 *  d0 = `<sp>_score`, d6 = `<sp>_score_d6` (missing => flat = d0). Returns a fresh
 *  props object with each `<sp>_score` set to the day-appropriate value and the
 *  `_d6` keys removed, so the existing FeatureInfoModal renders correct scores. */
export function interpolateScores(
  props: Record<string, unknown>,
  frac: number
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (k.endsWith('_score_d6')) continue; // folded into its base `_score` below
    if (k.endsWith('_score')) {
      const d0 = Number(v) || 0;
      const raw = props[`${k}_d6`];
      const d6 = raw == null ? d0 : Number(raw) || 0;
      out[k] = Math.round((d0 + frac * (d6 - d0)) * 10) / 10;
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** Forecast layer id for a species code + region (matches add-forecast-layers.cjs). */
export function forecastLayerId(speciesCode: string, region: string): string {
  return `${speciesCode}_${region}_fc`;
}
