import type { ExpressionSpecification } from 'maplibre-gl';
import type { TFunction } from 'i18next';
import SPOTS from '@/data/bloom-spots.json';

/**
 * The cherry blossom layer (roadmap #272 step 5). It is picked like a species but
 * is not a catalog one: no page, no photo ID, no score. Its tiles carry one
 * property, `peak`: the predicted peak-bloom day as days since 1970-01-01, built
 * by backend/bloom.py from 1 February to 30 June.
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

export const bloomSourceId = (region: BloomRegion) => `bloom-${region}`;
// `<code>_<region>`, like a species fill, so the store's region and selection
// matching apply to it unchanged.
export const bloomLayerId = (region: BloomRegion) => `${BLOOM_CODE}_${region}`;
export const bloomTilesUrl = (region: BloomRegion) =>
  `pmtiles://${R2}/${BLOOM_REGIONS[region]}/${region}_bloom.pmtiles`;
export const isBloomLayer = (id: string) => id.startsWith(`${BLOOM_CODE}_`);

/** A local calendar day as days since 1970-01-01, the unit of `peak`. */
export const unixDay = (date: Date): number =>
  Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000
  );

/** "12 April" in the given language. */
export const formatBloomDate = (day: number, language: string): string =>
  new Intl.DateTimeFormat(language, {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(day * 86_400_000));

const PEAK_DAYS = 2; // peak is ±2 days
const SOON_DAYS = 21; // pink from three weeks out
const PAST_DAYS = 14; // fades for two weeks after, as long as the backend keeps a cell

export type BloomStatus = 'later' | 'soon' | 'peak' | 'past' | 'over';

export function bloomStatus(peak: number, day: number): BloomStatus {
  const toPeak = peak - day;
  if (toPeak > SOON_DAYS) return 'later';
  if (toPeak > PEAK_DAYS) return 'soon';
  if (toPeak >= -PEAK_DAYS) return 'peak';
  if (toPeak >= -PAST_DAYS) return 'past';
  return 'over';
}

// Days to peak -> colour. Grey more than three weeks out, pink deepening to the
// peak, fading for two weeks after, then nothing: last season's file, which the
// map keeps until the first run on 1 February, reads as long over.
export const BLOOM_RAMP: readonly (readonly [number, string])[] = [
  [-PAST_DAYS - 1, 'rgba(240, 98, 146, 0)'],
  [-PAST_DAYS, 'rgba(240, 98, 146, 0.3)'],
  [-PEAK_DAYS - 1, 'rgba(216, 27, 96, 0.65)'],
  [-PEAK_DAYS, '#c2185b'],
  [PEAK_DAYS, '#c2185b'],
  [7, '#e0608f'],
  [SOON_DAYS, '#f8c8da'],
  [SOON_DAYS + 1, 'rgba(120, 120, 120, 0.22)'],
];

export function bloomFillColor(day: number): ExpressionSpecification {
  return [
    'interpolate',
    ['linear'],
    ['-', ['get', 'peak'], day],
    ...BLOOM_RAMP.flat(),
  ] as unknown as ExpressionSpecification;
}

/** The ramp as a legend, in the order a place goes through it: later -> past. */
export function bloomGradientCss(): string {
  const [far] = BLOOM_RAMP[BLOOM_RAMP.length - 1];
  const span = far - BLOOM_RAMP[0][0];
  const stops = [...BLOOM_RAMP]
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

export interface BloomSpot {
  id: string;
  lat: number;
  lon: number;
  region: 'NE' | 'SE' | 'USE' | 'USW';
  variety: 'yoshino' | 'kanzan';
}

export const BLOOM_SPOTS = SPOTS as BloomSpot[];

export type BloomPeaks = Record<string, number | null>;

/** Upcoming and blooming first, soonest first; then past, latest first; no forecast last. */
export function sortSpots<T extends { peak: number | null }>(
  spots: readonly T[],
  day: number
): T[] {
  const rank = ({ peak }: T): [number, number] =>
    peak === null ? [2, 0] : peak - day >= -PEAK_DAYS ? [0, peak] : [1, -peak];
  return [...spots].sort((a, b) => {
    const [ra, va] = rank(a);
    const [rb, vb] = rank(b);
    return ra - rb || va - vb;
  });
}

/** In season when some spot is not yet over; before 1 February the files are last year's. */
export const bloomInSeason = (peaks: BloomPeaks, day: number): boolean =>
  Object.values(peaks).some(
    peak => peak !== null && bloomStatus(peak, day) !== 'over'
  );

let peaksRequest: Promise<BloomPeaks> | null = null;

/** Every region's spot peaks, fetched once; a region that fails simply has none. */
export function loadBloomPeaks(): Promise<BloomPeaks> {
  peaksRequest ??= Promise.all(
    BLOOM_REGION_CODES.map(region =>
      fetch(`${R2}/${BLOOM_REGIONS[region]}/${region}_bloom_spots.json`, {
        cache: 'no-cache',
      })
        .then(response => (response.ok ? response.json() : null))
        .then(json =>
          json && typeof json.peaks === 'object'
            ? (json.peaks as BloomPeaks)
            : {}
        )
        .catch((): BloomPeaks => ({}))
    )
  ).then(parts => Object.assign({}, ...parts) as BloomPeaks);
  return peaksRequest;
}
