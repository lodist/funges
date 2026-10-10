import type { ExpressionSpecification } from 'maplibre-gl';
import type { TFunction } from 'i18next';

/**
 * The spectacle layers (roadmap #272 step 5): cherry blossom, bluebell woods and
 * the desert superbloom. Each is picked like a species and clicked like one, but
 * it is not a catalog species: no page, no photo ID, no score. Their tiles carry
 * `peak`, the predicted peak day as days since 1970-01-01, built in season by
 * backend/bloom.py, bluebell.py and superbloom.py; the superbloom's carry its
 * strength, `level`, as well.
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

export const bloomSourceId = (
  region: BloomRegion,
  spectacle: Spectacle = CHERRY_BLOSSOM
) => `${spectacle.tiles}-${region}`;
// `<code>_<region>`, like a species fill, so the store's region and selection
// matching apply to it unchanged.
export const bloomLayerId = (
  region: BloomRegion,
  spectacle: Spectacle = CHERRY_BLOSSOM
) => `${spectacle.code}_${region}`;
export const bloomTilesUrl = (
  region: BloomRegion,
  spectacle: Spectacle = CHERRY_BLOSSOM
) =>
  `pmtiles://${R2}/${BLOOM_REGIONS[region]}/${region}_${spectacle.tiles}.pmtiles`;
/** The spectacle a map layer id belongs to, if any. */
export const spectacleOfLayer = (id: string): Spectacle | undefined =>
  SPECTACLES.find(spectacle => id.startsWith(`${spectacle.code}_`));
export const isBloomLayer = (id: string) => spectacleOfLayer(id) !== undefined;

/** Whether the backend builds the layer in `date`'s month (cherry: February-June). */
export const bloomInSeason = (
  date: Date,
  spectacle: Spectacle = CHERRY_BLOSSOM
): boolean => spectacle.months.includes(date.getMonth());

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

/**
 * Days to peak -> colour. Light yellow more than three weeks out, `soon` (one
 * week, two, three out) deepening to `peak`, then `after` as the flowers drop,
 * settling to `done`, which stays: a place never vanishes, which read as "none
 * here". Only last season's file is invisible.
 */
const peakRamp = (
  soon: readonly [string, string, string],
  peak: string,
  done: string,
  after: string
): readonly (readonly [number, string])[] => [
  [-STALE_DAYS - 1, done.replace(/[\d.]+\)$/, '0)')],
  [-STALE_DAYS, done],
  [-FADE_DAYS, done],
  [-6, after],
  [-PEAK_DAYS, peak],
  [PEAK_DAYS, peak],
  [7, soon[0]],
  [14, soon[1]],
  [SOON_DAYS, soon[2]],
  [SOON_DAYS + 7, BLOOM_IDLE],
];

// Cherry pink, then leaf green as the petals drop.
export const BLOOM_RAMP = peakRamp(
  ['#ec6f9c', '#f7b8cf', '#fce4ec'],
  '#c2185b',
  BLOOM_DONE,
  '#9cc494'
);

// One colour per stage, for the info modal's swatch.
export const BLOOM_STATUS_COLOR: Record<BloomStatus, string> = {
  later: BLOOM_IDLE,
  soon: '#f7b8cf',
  peak: '#c2185b',
  past: '#9cc494',
  stale: BLOOM_IDLE,
};

export function bloomFillColor(
  day: number,
  spectacle: Spectacle = CHERRY_BLOSSOM
): ExpressionSpecification {
  const ramp = [
    'interpolate',
    ['linear'],
    ['-', ['get', 'peak'], day],
    ...spectacle.ramp.flat(),
  ];
  return (spectacle.levels
    ? ['case', ['==', ['get', 'level'], 0], spectacle.levels.noneColor, ramp]
    : ramp) as unknown as ExpressionSpecification;
}

/** A spectacle with levels is drawn fainter the weaker its bloom. */
export function bloomFillOpacity<T>(
  spectacle: Spectacle,
  fallback: T
): T | ExpressionSpecification {
  if (!spectacle.levels) return fallback;
  const { opacity } = spectacle.levels;
  return [
    'match',
    ['get', 'level'],
    ...opacity.slice(0, -1).flatMap((value, level) => [level, value]),
    opacity[opacity.length - 1],
  ] as unknown as ExpressionSpecification;
}

/** The ramp as a legend, in the order a place goes through it: later -> done. */
export function bloomGradientCss(
  spectacle: Spectacle = CHERRY_BLOSSOM
): string {
  // Four weeks either side of the peak, so the deep pink sits in the middle,
  // under "Peak bloom"; after the fade it is the steady "done" green.
  const { ramp } = spectacle;
  const [far] = ramp[ramp.length - 1];
  const done = ramp[1][1];
  const shown = [
    [-far, done] as const,
    ...ramp.filter(([toPeak]) => toPeak > -far),
  ];
  const stops = shown
    .reverse()
    .map(
      ([toPeak, colour]) => `${colour} ${((far - toPeak) / (2 * far)) * 100}%`
    );
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

/**
 * A layer picked like a species and clicked like one, but timed by the season
 * rather than scored: its tiles carry `peak`, built by the backend (bloom.py)
 * in its months only.
 */
export interface Spectacle {
  /** Its map code: `?species=`, and layer ids `<code>_<region>`. */
  code: string;
  scientificName: string;
  emoji: string;
  /** Where its strings sit in map.json: `<keys>.name`, `<keys>.offSeason`. */
  keys: string;
  /** Its tileset `<region>_<tiles>.pmtiles` on R2, and the tiles' layer name. */
  tiles: string;
  regions: readonly BloomRegion[];
  /** The months (0-11) the backend builds it. */
  months: readonly number[];
  /** Days to peak -> colour; [1] is the steady "done" colour. */
  ramp: readonly (readonly [number, string])[];
  statusColor: Record<BloomStatus, string>;
  /**
   * Strength levels, when the tiles carry `level` (superbloom): their names
   * (`<keys>.levels.<name>`; level 0 is no bloom, drawn in `noneColor`) and the
   * fill opacity of each.
   */
  levels?: {
    names: readonly string[];
    opacity: readonly number[];
    noneColor: string;
  };
}

export const CHERRY_BLOSSOM: Spectacle = {
  code: BLOOM_CODE,
  scientificName: BLOOM_SCIENTIFIC_NAME,
  emoji: BLOOM_EMOJI,
  keys: 'bloom',
  // Its tilesets predate the other spectacles and keep their name.
  tiles: 'bloom',
  regions: BLOOM_REGION_CODES,
  months: [1, 2, 3, 4, 5],
  ramp: BLOOM_RAMP,
  statusColor: BLOOM_STATUS_COLOR,
};

// Bluebell violet deepening to the peak, then the wood's leaf green.
export const BLUEBELL: Spectacle = {
  code: 'bluebell',
  scientificName: 'Hyacinthoides non-scripta',
  emoji: '🪻',
  keys: 'bluebell',
  tiles: 'bluebell',
  regions: ['ne', 'se'],
  months: [2, 3, 4, 5],
  ramp: peakRamp(
    ['#7a6fd0', '#b6aee8', '#e4e0f7'],
    '#4a3f9f',
    BLOOM_DONE,
    '#9cc494'
  ),
  statusColor: {
    later: BLOOM_IDLE,
    soon: '#b6aee8',
    peak: '#4a3f9f',
    past: '#9cc494',
    stale: BLOOM_IDLE,
  },
};

// Poppy orange deepening to the peak, then dry gold; a winter too dry for a
// bloom is grey sand, and the weaker a bloom the fainter it is drawn.
export const SUPERBLOOM: Spectacle = {
  code: 'superbloom',
  scientificName: 'Geraea, Abronia, Eschscholzia',
  emoji: '🌼',
  keys: 'superbloom',
  tiles: 'superbloom',
  regions: ['usw'],
  months: [0, 1, 2, 3, 4],
  ramp: peakRamp(
    ['#f08a3c', '#f6bd6e', '#fbe3b0'],
    '#d9480f',
    'rgba(201, 176, 120, 0.45)',
    '#c9a75e'
  ),
  statusColor: {
    later: BLOOM_IDLE,
    soon: '#f6bd6e',
    peak: '#d9480f',
    past: '#c9a75e',
    stale: BLOOM_IDLE,
  },
  levels: {
    names: ['none', 'ordinary', 'good', 'superbloom'],
    opacity: [0.6, 0.45, 0.7, 0.9],
    noneColor: 'rgba(205, 196, 180, 0.8)',
  },
};

export const SPECTACLES: readonly Spectacle[] = [
  CHERRY_BLOSSOM,
  BLUEBELL,
  SUPERBLOOM,
];

export const spectacleByCode = (
  code: string | null | undefined
): Spectacle | undefined =>
  SPECTACLES.find(spectacle => spectacle.code === code);
