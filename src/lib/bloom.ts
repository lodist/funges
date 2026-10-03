import type { ExpressionSpecification } from 'maplibre-gl';
import type { TFunction } from 'i18next';

/**
 * The cherry blossom layer (roadmap #272 step 5). It is picked like a species and
 * clicked like one, but it is not a catalog species: no page, no photo ID, no
 * score. Its tiles carry one property, `peak`: the predicted peak-bloom day as
 * days since 1970-01-01, built by backend/bloom.py from 1 February to 30 June.
 */
export const BLOOM_CODE = 'cherry_blossom';
export const BLOOM_SCIENTIFIC_NAME = 'Prunus serrulata';
export const BLOOM_EMOJI = '🌸';

const R2 = 'https://data.fung.es';
// Same R2 folders as the forecast tilesets.
export const BLOOM_REGIONS = {
  ne: 'EU/NE',
  se: 'EU/SE',
  use: 'USA/USE',
  usw: 'USA/USW',
} as const;
export type BloomRegion = keyof typeof BLOOM_REGIONS;
export const BLOOM_REGION_CODES = Object.keys(BLOOM_REGIONS) as BloomRegion[];

// Dev server only: with VITE_BLOOM_PREVIEW=2026-04-15 in .env.local the layer
// reads the tiles in public/bloom-preview/ (local, gitignored) and draws them as
// on that day, so it can be seen out of season. Tests and builds never read it.
const PREVIEW_DAY: string | undefined =
  import.meta.env.MODE === 'development'
    ? import.meta.env.VITE_BLOOM_PREVIEW
    : undefined;

/** Today, or the preview day on the dev server. */
export const bloomToday = (): Date =>
  PREVIEW_DAY ? new Date(`${PREVIEW_DAY}T12:00:00`) : new Date();

export const bloomSourceId = (region: BloomRegion) => `bloom-${region}`;
// `<code>_<region>`, like a species fill, so the store's region and selection
// matching apply to it unchanged.
export const bloomLayerId = (region: BloomRegion) => `${BLOOM_CODE}_${region}`;
export const bloomTilesUrl = (region: BloomRegion) =>
  PREVIEW_DAY
    ? `pmtiles://${window.location.origin}/bloom-preview/${region}_bloom.pmtiles`
    : `pmtiles://${R2}/${BLOOM_REGIONS[region]}/${region}_bloom.pmtiles`;
export const isBloomLayer = (id: string) => id.startsWith(`${BLOOM_CODE}_`);

/** The backend builds the layer from 1 February to 30 June. */
export const bloomInSeason = (date: Date): boolean =>
  date.getMonth() >= 1 && date.getMonth() <= 5;

/** A local calendar day as days since 1970-01-01, the unit of `peak`. */
export const unixDay = (date: Date): number =>
  Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000
  );

/** "12 April", or "12 Apr" with `month: 'short'`, in the given language. */
export const formatBloomDate = (
  day: number,
  language: string,
  month: 'long' | 'short' = 'long'
): string =>
  new Intl.DateTimeFormat(language, {
    day: 'numeric',
    month,
    timeZone: 'UTC',
  }).format(new Date(day * 86_400_000));

const PEAK_DAYS = 2; // peak is ±2 days
const SOON_DAYS = 21; // pink from three weeks out
const FADE_DAYS = 14; // green fades to its steady "done" tone over two weeks
// No peak of this season is older than this (the earliest come around 1 March),
// so an older one is last season's file, which waits on R2 until 1 February's run.
const STALE_DAYS = 150;

export type BloomStatus = 'later' | 'soon' | 'peak' | 'past' | 'stale';

export function bloomStatus(peak: number, day: number): BloomStatus {
  const toPeak = peak - day;
  if (toPeak > SOON_DAYS) return 'later';
  if (toPeak > PEAK_DAYS) return 'soon';
  if (toPeak >= -PEAK_DAYS) return 'peak';
  if (toPeak >= -STALE_DAYS) return 'past';
  return 'stale';
}

// Nothing in bloom: the light yellow the score layers start from.
export const BLOOM_IDLE = 'rgba(255, 255, 204, 0.9)';

// Done for this year: the steady pale green a town keeps until 30 June.
const BLOOM_DONE = 'rgba(156, 196, 148, 0.45)';

// Days to peak -> colour. Light yellow more than three weeks out, pink deepening
// to the peak, then leaf green as the petals drop, settling to a pale green that
// stays: a town never vanishes, which read as "no cherries here". Only last
// season's file is invisible.
export const BLOOM_RAMP: readonly (readonly [number, string])[] = [
  [-STALE_DAYS - 1, 'rgba(156, 196, 148, 0)'],
  [-STALE_DAYS, BLOOM_DONE],
  [-FADE_DAYS, BLOOM_DONE],
  [-6, '#9cc494'],
  [-PEAK_DAYS, '#c2185b'],
  [PEAK_DAYS, '#c2185b'],
  [7, '#ec6f9c'],
  [14, '#f7b8cf'],
  [SOON_DAYS, '#fce4ec'],
  [SOON_DAYS + 7, BLOOM_IDLE],
];

// One colour per stage, for the info modal's swatch.
export const BLOOM_STATUS_COLOR: Record<BloomStatus, string> = {
  later: BLOOM_IDLE,
  soon: '#f7b8cf',
  peak: '#c2185b',
  past: '#9cc494',
  stale: BLOOM_IDLE,
};

export function bloomFillColor(day: number): ExpressionSpecification {
  return [
    'interpolate',
    ['linear'],
    ['-', ['get', 'peak'], day],
    ...BLOOM_RAMP.flat(),
  ] as unknown as ExpressionSpecification;
}

/** The ramp as a legend, in the order a place goes through it: later -> done. */
export function bloomGradientCss(): string {
  // From four weeks before the peak to the steady "done" green; the months of
  // that green after it, and the stale stop, would only stretch the bar.
  const shown = BLOOM_RAMP.filter(([toPeak]) => toPeak >= -FADE_DAYS);
  const [far] = shown[shown.length - 1];
  const span = far - shown[0][0];
  const stops = [...shown]
    .reverse()
    .map(([toPeak, colour]) => `${colour} ${((far - toPeak) / span) * 100}%`);
  return `linear-gradient(to right, ${stops.join(', ')})`;
}

/** "in 9 days", "at peak now", "3 days ago". */
export function bloomWhen(t: TFunction, peak: number, day: number): string {
  const toPeak = peak - day;
  if (Math.abs(toPeak) <= PEAK_DAYS) return t('bloom.atPeak');
  return toPeak > 0
    ? t('bloom.inDays', { count: toPeak })
    : t('bloom.daysAgo', { count: -toPeak });
}
