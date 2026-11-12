/**
 * The calendar side of "what is in season". North of the equator (NE, SE, USE,
 * USW) seasons run by month: spring March–May, summer June–August, autumn
 * September–November, winter December–February. In the south (ANZ) they run half
 * a year on: spring September–November. Every month helper takes `south` for
 * that. The keys match the catalog's `season` field and `species:seasons.*`,
 * which name a species' seasons where it grows.
 */
export const SEASONS = ['spring', 'summer', 'fall', 'winter'] as const;
export type Season = (typeof SEASONS)[number];

/** Where a species' season sits relative to today's. */
export type SeasonPlace = 'now' | 'next' | 'before' | 'later';

/** First month (0-based) of each season in the north; each runs three months. */
const SEASON_START: Record<Season, number> = {
  spring: 2,
  summer: 5,
  fall: 8,
  winter: 11,
};
const SOUTH_SHIFT = 6;

/**
 * Whether seasons read as the south's: the reader is in Australia/New Zealand,
 * or the species grows only there.
 */
export function southern(
  readerRegion?: string | null,
  forecastRegions?: readonly string[]
): boolean {
  return (
    readerRegion === 'ANZ' ||
    (!!forecastRegions?.length && forecastRegions.every(r => r === 'ANZ'))
  );
}

export function seasonOf(date: Date, south = false): Season {
  const month = (date.getMonth() + (south ? SOUTH_SHIFT : 0)) % 12;
  return SEASONS[Math.floor(((month + 10) % 12) / 3)];
}

export const nextSeason = (season: Season): Season =>
  SEASONS[(SEASONS.indexOf(season) + 1) % 4];

export const previousSeason = (season: Season): Season =>
  SEASONS[(SEASONS.indexOf(season) + 3) % 4];

/** First and last month (0-based) of a season. */
export function seasonMonths(season: Season, south = false): [number, number] {
  const start = (SEASON_START[season] + (south ? SOUTH_SHIFT : 0)) % 12;
  return [start, (start + 2) % 12];
}

/** How far through its season a date is, from 0 to 1. */
export function seasonProgress(date: Date, south = false): number {
  const [start] = seasonMonths(seasonOf(date, south), south);
  // A season that runs over New Year belongs to the year it began in.
  const year = date.getFullYear() - (date.getMonth() < start ? 1 : 0);
  const from = new Date(year, start, 1).getTime();
  const to = new Date(year, start + 3, 1).getTime();
  return (date.getTime() - from) / (to - from);
}

/**
 * The catalog's season field as seasons. A range runs forward through the
 * year ('summer-fall', 'fall-winter'); 'spring-fall' is the exception, two
 * separate flushes ("Spring and Fall"), not the whole year between them.
 */
export function speciesSeasons(field: string | undefined): Season[] {
  if (field === 'spring-fall') return ['spring', 'fall'];
  const [from, to = from] = (field ?? '').split('-') as Season[];
  const start = SEASONS.indexOf(from);
  const end = SEASONS.indexOf(to);
  if (start < 0 || end < 0) return [];
  const seasons: Season[] = [];
  for (let i = start; ; i = (i + 1) % 4) {
    seasons.push(SEASONS[i]);
    if (i === end) return seasons;
  }
}

export function seasonPlace(seasons: Season[], current: Season): SeasonPlace {
  if (seasons.includes(current)) return 'now';
  if (seasons.includes(nextSeason(current))) return 'next';
  if (seasons.includes(previousSeason(current))) return 'before';
  return 'later';
}

/** The months a species is in season, as a set of 0-based month numbers. */
export function seasonMonthSet(seasons: Season[], south = false): Set<number> {
  return new Set(
    seasons.flatMap(season => {
      const [start] = seasonMonths(season, south);
      return [start, (start + 1) % 12, (start + 2) % 12];
    })
  );
}

/** The seasons as month spans, joining neighbours: autumn and winter run
 *  as one span, Sep–Feb; spring and autumn stay two. */
export function monthSpans(
  seasons: Season[],
  south = false
): [number, number][] {
  const spans: [number, number][] = [];
  for (const season of seasons) {
    const [start, end] = seasonMonths(season, south);
    const last = spans[spans.length - 1];
    if (last && (last[1] + 1) % 12 === start) last[1] = end;
    else spans.push([start, end]);
  }
  return spans;
}

/** "Sep–Nov" in the reader's language. */
export function monthRange(
  [start, end]: [number, number],
  language: string
): string {
  const format = new Intl.DateTimeFormat(language, { month: 'short' });
  const name = (month: number) => format.format(new Date(2026, month, 1));
  return `${name(start)}–${name(end)}`;
}

/** A species' months in the reader's language: "Sep–Feb", "Mar–May, Sep–Nov". */
export function monthsLabel(
  seasons: Season[],
  language: string,
  south = false
): string {
  return monthSpans(seasons, south)
    .map(span => monthRange(span, language))
    .join(', ');
}
