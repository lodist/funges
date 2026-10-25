/**
 * The season atlas: when each mushroom fruits in a place (scripts/build_season_atlas_site.py
 * writes the files under public/season-atlas/). A place's curve is 12 monthly values, 1 at
 * its peak month; the map frames are one image per month, blended between month mids the
 * way the forecast blends them.
 */

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

export const ATLAS_BASE = `${import.meta.env.BASE_URL}season-atlas/`;

/**
 * Nothing to the local peak: dark teal lit up to near-white, the same in both themes, so the
 * season glows like the dark map. Mirrors TEAL in build_season_atlas_site.py.
 */
export const ATLAS_TEAL = [
  '#082a24',
  '#0e4037',
  '#165c4d',
  '#237a65',
  '#3a9a7f',
  '#5fb99c',
  '#8fd6bb',
  '#bfe8da',
  '#e3f4ee',
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
