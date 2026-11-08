/**
 * The season atlas: when each mushroom fruits in a place (scripts/build_season_atlas_site.py
 * writes the files under public/season-atlas/). A place's curve is 12 monthly values, 1 at
 * its peak month; the map frames are one image per month, blended between month mids the
 * way the forecast blends them.
 */

import { monthRange } from './seasons';

/** [lon min, lat min, lon max, lat max] of a place's map image. */
export type Extent = [number, number, number, number];

export interface AtlasCurve {
  records: number;
  curve: number[];
}

export interface AtlasPlaceSummary {
  id: string;
  kind: 'continent' | 'country' | 'state';
  name: string;
  iso: string | null;
  continent: 'EU' | 'US';
  species: string[];
}

export interface AtlasIndex {
  places: AtlasPlaceSummary[];
  /** species key → URL slug (`mushroom` → `porcini`) */
  slugs: Record<string, string>;
}

export interface AtlasPlace extends Omit<AtlasPlaceSummary, 'species'> {
  extent: Extent;
  /** one month's frame in the sprite, [width, height] in pixels */
  frame: [number, number];
  /** outline rings, [lon, lat] points */
  land: [number, number][][];
  species: Record<string, AtlasCurve>;
}

/** A month counts as in season from half its place's peak. */
export const IN_SEASON = 0.5;
/** Local records from which a place's curve is its own (the season grid's shipping bar);
 *  below it the curve leans on similar climates, and under RARE the species is hardly seen. */
export const SOLID_RECORDS = 150;
export const RARE_RECORDS = 10;

/** The common namespace's `data.*` strings: t('data.' + key) in the app, the build's own
 *  lookup in scripts/seo-pages.ts. This file stays free of the app's runtime (no
 *  import.meta.env) because the build imports it. */
export type Say = (key: string, vars?: Record<string, string>) => string;

const regionNames = new Map<string, Intl.DisplayNames | null>();

/** A place's name in `language`: countries by their ISO code. */
export function placeLabel(
  place: Pick<AtlasPlaceSummary, 'kind' | 'iso' | 'name' | 'continent'>,
  language: string,
  say: Say
): string {
  if (place.kind === 'continent')
    return say(place.continent === 'EU' ? 'europe' : 'unitedStates');
  if (place.kind !== 'country' || !place.iso) return place.name;
  if (!regionNames.has(language)) {
    try {
      regionNames.set(
        language,
        new Intl.DisplayNames([language], { type: 'region' })
      );
    } catch {
      regionNames.set(language, null);
    }
  }
  try {
    return regionNames.get(language)?.of(place.iso) ?? place.name;
  } catch {
    return place.name;
  }
}

/** What a curve says on any day: its peak month and its main season(s). */
export function seasonSentences(
  curve: number[],
  language: string,
  say: Say
): string[] {
  const long = new Intl.DateTimeFormat(language, { month: 'long' });
  const monthName = (m: number) => long.format(new Date(2026, m, 15));
  const span = ([a, b]: [number, number]) =>
    a === b ? monthName(a) : monthRange([a, b], language);
  const windows = seasonWindows(curve, IN_SEASON);
  const lines = [
    say('atlas.peak', { month: monthName(curve.indexOf(Math.max(...curve))) }),
  ];
  if (windows.length === 1 && windows[0][0] === 0 && windows[0][1] === 11)
    lines.push(say('atlas.allYear'));
  else if (windows.length === 1)
    lines.push(say('atlas.window', { months: span(windows[0]) }));
  else if (windows.length > 1)
    lines.push(
      say('atlas.windows', {
        first: windows.slice(0, -1).map(span).join(', '),
        last: span(windows[windows.length - 1]),
      })
    );
  return lines;
}

/** How many local finds a curve rests on, in words. */
export function recordsSentence(
  records: number,
  language: string,
  say: Say
): string {
  const formatted = records.toLocaleString(language);
  if (records >= SOLID_RECORDS) return say('atlas.records', { formatted });
  if (records >= RARE_RECORDS) return say('atlas.fewRecords', { formatted });
  return say('atlas.rareRecords');
}

/** An atlas page's search description, the same in the built page and the app: its
 *  title, then what the curve says on any day (nothing about today, the page is built
 *  once). */
export function atlasDescription(
  title: string,
  entry: AtlasCurve,
  language: string,
  say: Say
): string {
  return [
    `${title}.`,
    ...seasonSentences(entry.curve, language, say),
    recordsSentence(entry.records, language, say),
  ].join(' ');
}

/**
 * The map camera that shows `extent` on a `width` × `height` screen: its middle and the
 * zoom that fits it, with a margin. MapLibre's world is 512 px wide at zoom 0, Web Mercator.
 */
export function mapView(
  [w, s, e, n]: Extent,
  width: number,
  height: number
): { lat: number; lng: number; zoom: number } {
  const y = (lat: number) =>
    Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  const fit = Math.min(
    width / ((512 * (e - w)) / 360),
    height / ((512 * (y(n) - y(s))) / (2 * Math.PI))
  );
  const round = (v: number, places: number) =>
    Math.round(v * 10 ** places) / 10 ** places;
  return {
    lat: round((Math.atan(Math.sinh((y(s) + y(n)) / 2)) * 180) / Math.PI, 4),
    lng: round((w + e) / 2, 4),
    zoom: round(Math.log2(fit * 0.85), 2),
  };
}

/**
 * Nothing to the local peak: the brand green's steps, --happy-900 (the band) up to --happy-50,
 * the same in both themes. Literals because the canvas and the baked frames need them; mirrors
 * RAMP in build_season_atlas_site.py.
 */
export const ATLAS_RAMP = [
  '#00280b', // --happy-900
  '#005e25', // --happy-700
  '#00ac4e', // --happy-600
  '#47c86e', // --happy-500
  '#93e4a4', // --happy-300
  '#ccf4d3', // --happy-100
  '#e8fbeb', // --happy-50
];

/** Mid-month days of year, as the scoring's season blend uses them. */
export const MONTH_MID_DOY = [
  15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349,
];

/** 1 January = 1; 29 February counts as 28 February, so the year has 365 days. */
export function dayOfYear(date: Date): number {
  const start = Date.UTC(date.getFullYear(), 0, 1);
  const today = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const doy = Math.round((today - start) / 86_400_000) + 1;
  const leap = new Date(date.getFullYear(), 1, 29).getMonth() === 1;
  return leap && doy > 59 ? doy - 1 : doy;
}

/** The two months around a day and the weight of the second: [month A, month B, weight of B]. */
export function blendMonths(doy: number): [number, number, number] {
  const ext = [
    MONTH_MID_DOY[11] - 365,
    ...MONTH_MID_DOY,
    MONTH_MID_DOY[0] + 365,
  ];
  let hi = ext.findIndex(d => d > doy);
  if (hi < 1) hi = ext.length - 1;
  const month = (i: number) => (i + 11) % 12;
  return [
    month(hi - 1),
    month(hi),
    (doy - ext[hi - 1]) / (ext[hi] - ext[hi - 1]),
  ];
}

export function curveAt(curve: number[], doy: number): number {
  const [a, b, f] = blendMonths(doy);
  return curve[a] * (1 - f) + curve[b] * f;
}

/** Runs of months at or above `level` (0-based, a run may wrap past December), by first month. */
export function seasonWindows(
  curve: number[],
  level = 0.5
): [number, number][] {
  const on = curve.map(v => v >= level);
  if (on.every(Boolean)) return [[0, 11]];
  if (!on.some(Boolean)) return [];
  const start = on.indexOf(false);
  const runs: [number, number][] = [];
  let run: [number, number] | null = null;
  for (let i = 1; i <= 12; i++) {
    const m = (start + i) % 12;
    if (on[m]) {
      if (run) run[1] = m;
      else run = [m, m];
    } else if (run) {
      runs.push(run);
      run = null;
    }
  }
  return runs.sort((p, q) => p[0] - q[0]);
}

/** Whether `month` falls inside a window that may wrap past December. */
export function inWindow([from, to]: [number, number], month: number) {
  return from <= to
    ? month >= from && month <= to
    : month >= from || month <= to;
}

/**
 * An equirectangular map of `extent` at most `width` wide and `maxHeight` tall, longitude
 * shrunk by the cosine of the middle latitude so a country keeps its shape.
 */
export function projection(extent: Extent, width: number, maxHeight: number) {
  const [w, s, e, n] = extent;
  const cos = Math.cos((((s + n) / 2) * Math.PI) / 180);
  const aspect = (n - s) / ((e - w) * cos);
  const mapWidth = Math.min(width, maxHeight / aspect);
  const mapHeight = mapWidth * aspect;
  return {
    width: mapWidth,
    height: mapHeight,
    x: (lon: number) => ((lon - w) / (e - w)) * mapWidth,
    y: (lat: number) => ((n - lat) / (n - s)) * mapHeight,
  };
}
