// Forecast slider helpers. One tileset carries both endpoints per feature (`<sp>_score`
// = today/d0, `<sp>_score_d6` = day 6); the slider interpolates between them, day 0 = d0.
export const FORECAST_DAYS = 7;
export const FORECAST_REGIONS = ['ne', 'se', 'use', 'usw'] as const;

function capitalize(word: string): string {
  return word.length ? word[0].toUpperCase() + word.slice(1) : word;
}

/** "<weekday> <day> <month>" label (e.g. "Gio 24 Aprile") for the date `dayIndex`
 *  days after `base`, localized to `locale` — weekday/month are capitalized since
 *  Intl lowercases them for several locales (it/fr/de/es/pt) but not others (en). */
export function forecastDayLabel(
  base: Date,
  dayIndex: number,
  locale: string
): string {
  const d = new Date(base);
  d.setDate(d.getDate() + dayIndex);
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  })
    .formatToParts(d)
    .map(part =>
      part.type === 'weekday' || part.type === 'month'
        ? capitalize(part.value)
        : part.value
    )
    .join('');
}

/** Return a copy of a fill-color `interpolate` expression whose input is the
 *  linear interpolation between today (d0 = `<species>_score`) and day-6
 *  (`<species>_score_d6`) at `frac` in [0,1]. Missing props coalesce to 0. */
/** d0->d6 interpolation VALUE expression at `frac` (frac 0 == d0/today). Missing _d6
 *  falls back to d0 (flat) so un-forecastable polygons hold their value instead of
 *  fading to 0; a stored _d6 (incl. 0) is a real decline. Missing d0 -> 0. */
function forecastValue(species: string, frac: number): unknown[] {
  const d0 = ['coalesce', ['get', `${species}_score`], 0];
  const d6 = [
    'coalesce',
    ['get', `${species}_score_d6`],
    ['get', `${species}_score`],
    0,
  ];
  return ['+', d0, ['*', frac, ['-', d6, d0]]];
}

export function setForecastFraction(
  fillColor: unknown[],
  species: string,
  frac: number
): unknown[] {
  const copy = [...fillColor];
  copy[2] = forecastValue(species, frac);
  return copy;
}

/** Numbers-layer `text-field` showing the score interpolated to `frac`: empty below 1,
 *  else the floored value. Rebuilt from the canonical template (matches the committed
 *  style), so re-applying each render is idempotent — no reading of the live field. */
export function forecastNumberField(species: string, frac: number): unknown[] {
  const v = forecastValue(species, frac);
  return ['case', ['<', v, 1], '', ['to-string', ['floor', v]]];
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
