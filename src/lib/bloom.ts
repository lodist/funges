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

// Cultivar names, the same in every language.
export const BLOOM_VARIETY_NAME = {
  yoshino: 'Yoshino',
  kanzan: 'Kanzan',
} as const;

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

// Nothing in bloom: the light yellow the score layers start from.
export const BLOOM_IDLE = 'rgba(255, 255, 204, 0.9)';

// Days to peak -> colour. Light yellow more than three weeks out, pink deepening
// to the peak, then leaf green as the petals drop, fading out two weeks after:
// last season's file, which the map keeps until the first run on 1 February,
// reads as long over.
export const BLOOM_RAMP: readonly (readonly [number, string])[] = [
  [-PAST_DAYS - 1, 'rgba(156, 196, 148, 0)'],
  [-PAST_DAYS, 'rgba(156, 196, 148, 0.35)'],
  [-6, '#9cc494'],
  [-PEAK_DAYS, '#c2185b'],
  [PEAK_DAYS, '#c2185b'],
  [7, '#ec6f9c'],
  [14, '#f7b8cf'],
  [SOON_DAYS, '#fce4ec'],
  [SOON_DAYS + 7, BLOOM_IDLE],
];

// One colour per stage, for the list's dots and the popup's swatch.
export const BLOOM_STATUS_COLOR: Record<BloomStatus, string> = {
  later: BLOOM_IDLE,
  soon: '#f7b8cf',
  peak: '#c2185b',
  past: '#9cc494',
  over: BLOOM_IDLE,
};

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

/**
 * The spots as map points. A spot carries its `peak` only while its bloom is
 * ahead or under way, so off-season, after its bloom or with no forecast it
 * paints as idle instead of as last year's date.
 */
export function bloomSpotFeatures(
  peaks: BloomPeaks,
  day: number
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  const inSeason = bloomInSeason(peaks, day);
  return {
    type: 'FeatureCollection',
    features: BLOOM_SPOTS.map(spot => {
      const peak = peaks[spot.id];
      const active =
        inSeason &&
        typeof peak === 'number' &&
        bloomStatus(peak, day) !== 'over';
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [spot.lon, spot.lat] },
        properties: active ? { id: spot.id, peak } : { id: spot.id },
      };
    }),
  };
}

export const BLOOM_SPOT_SOURCE = 'bloom-spots';
// Not `cherry_blossom_*`: the store treats those as fill layers.
export const BLOOM_SPOT_LAYER = 'bloom-spots';
export const BLOOM_SPOT_SHADOW_LAYER = 'bloom-spots-shadow';

/** Grows with zoom; `extra` widens the shadow around the dot. */
export const bloomSpotRadius = (extra: number): ExpressionSpecification =>
  [
    'interpolate',
    ['linear'],
    ['zoom'],
    3,
    10 + extra,
    6,
    15 + extra,
    9,
    22 + extra,
    12,
    30 + extra,
    15,
    42 + extra,
  ] as unknown as ExpressionSpecification;

export function bloomSpotColor(day: number): ExpressionSpecification {
  return [
    'case',
    ['has', 'peak'],
    bloomFillColor(day),
    BLOOM_IDLE,
  ] as unknown as ExpressionSpecification;
}

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
