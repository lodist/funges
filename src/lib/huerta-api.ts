/**
 * Huerta's advice comes from the Huerta Worker, one place at a time, never as a
 * public file. Kept cheap: the position is rounded to ~1 km before it leaves
 * the device, a day's advice is kept and reused until the next day, and the
 * town search fetches one two-letter section of the town list once and
 * searches it here. Every call is the signed-in account's (lib/huerta-session).
 */
import { CROPS, type CropNeeds, type PlaceAdvice } from '@/lib/huerta';
import { currentGarden, updateGarden } from '@/lib/gardens';
import { apiFetch } from '@/lib/huerta-session';
import {
  decodeAdvice,
  decodeYear,
  type AdviceResponse,
  type PlaceYear,
  type YearResponse,
} from '@/lib/huerta-wire';

export { decodeAdvice };
export type { CropYear, PlaceYear } from '@/lib/huerta-wire';

/** Whether this build talks to the Worker (else the page shows its sample). */
export const huertaApiConfigured = Boolean(import.meta.env.VITE_HUERTA_API);

export interface Place {
  lat: number;
  lon: number;
}

export interface Town extends Place {
  name: string;
  /** ISO 3166 alpha-2, or '' at sea or off the map. */
  country: string;
  /** State or province: what tells the many Albas apart. */
  province: string;
}

/** About 1 km: enough to find the nearest place, kinder to privacy and caches. */
const rounded = (value: number) => Math.round(value * 100) / 100;

const localDay = () => new Date().toLocaleDateString('sv'); // YYYY-MM-DD, local
const ADVICE_KEY = 'huerta-advice';
const MAP_VIEW_KEY = 'huerta-map-view';

const read = <T>(key: string): T | null => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null;
  } catch {
    return null;
  }
};
const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or blocked storage: the next visit asks again.
  }
};

/** The current garden's place (lib/gardens), if it has one. */
export const savedPlace = (): Place | null => currentGarden()?.place ?? null;
export const savePlace = (place: Place) =>
  updateGarden({ place: { lat: rounded(place.lat), lon: rounded(place.lon) } });

export interface MapView {
  center: [number, number];
  zoom: number;
}
/** Where the garden map was left, to open there again. */
export const savedMapView = () => {
  const view = read<MapView>(MAP_VIEW_KEY);
  return Array.isArray(view?.center) &&
    view.center.length === 2 &&
    [...view.center, view.zoom].every(Number.isFinite)
    ? view
    : null;
};
export const saveMapView = (view: MapView) => write(MAP_VIEW_KEY, view);

/**
 * This week's advice at the place nearest `place`; null where Huerta has no
 * place (at sea, outside Europe and the US). Today's answer is kept, so a
 * second visit the same day asks nothing, unless the app now knows a crop the
 * kept answer lacks. A spot looked at on the map is not kept (`keep` false):
 * the kept answer is the garden's, for offline.
 */
export async function fetchAdvice(
  place: Place,
  keep = true
): Promise<PlaceAdvice | null> {
  const lat = rounded(place.lat);
  const lon = rounded(place.lon);
  const kept = read<{ lat: number; lon: number; advice: PlaceAdvice }>(
    ADVICE_KEY
  );
  if (
    kept &&
    kept.lat === lat &&
    kept.lon === lon &&
    kept.advice.day >= localDay() &&
    CROPS.every(crop => crop.id in kept.advice.crops)
  )
    return kept.advice;
  const response = await apiFetch('/v1/advice', { lat, lon });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Huerta advice: ${response.status}`);
  const advice = decodeAdvice((await response.json()) as AdviceResponse);
  if (keep) write(ADVICE_KEY, { lat, lon, advice });
  return advice;
}

/** Letters and digits in lower case, accents dropped: as the town list is keyed. */
export const plain = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .toLowerCase();

// Each town with its people, when the list knows them (0: a place's own name).
const sections = new Map<string, Promise<(Town & { pop: number })[]>>();

/** Towns whose name starts with `query`: exact names first, then bigger towns,
 *  then shorter names. A city under two names (Milan, Milano) sits at one
 *  spot and is listed once.
 *  Rejects when the town list cannot be reached, which is not "no such town". */
export async function searchTowns(query: string): Promise<Town[]> {
  const q = plain(query);
  if (q.length < 2) return [];
  const key = q.slice(0, 2);
  if (!sections.has(key)) {
    sections.set(
      key,
      apiFetch('/v1/towns', { q: key })
        .then(r => {
          if (!r.ok) throw new Error(`Huerta towns: ${r.status}`);
          return r.json();
        })
        .then((rows: [string, number, number, string, string?, number?][]) =>
          rows.map(([name, lat, lon, country, province = '', pop = 0]) => ({
            name,
            lat,
            lon,
            country,
            province,
            pop,
          }))
        )
        .catch(error => {
          sections.delete(key); // try again next time
          throw error;
        })
    );
  }
  const towns = await sections.get(key)!;
  const seen = new Set<string>();
  return towns
    .filter(town => plain(town.name).startsWith(q))
    .sort(
      (a, b) =>
        Number(plain(b.name) === q) - Number(plain(a.name) === q) ||
        b.pop - a.pop ||
        a.name.length - b.name.length
    )
    .filter(town => {
      const at = `${town.lat},${town.lon}`;
      return !seen.has(at) && Boolean(seen.add(at));
    })
    .slice(0, 8)
    .map(({ pop: _pop, ...town }) => town);
}

let needs: Promise<Record<string, CropNeeds>> | null = null;

/** Every crop's needs, asked once per visit; rejects (and asks again next
 *  time) when the Worker cannot be reached. */
export function fetchNeeds(): Promise<Record<string, CropNeeds>> {
  needs ??= apiFetch('/v1/crops')
    .then(r => {
      if (!r.ok) throw new Error(`Huerta crops: ${r.status}`);
      return r.json() as Promise<Record<string, CropNeeds>>;
    })
    .catch(error => {
      needs = null;
      throw error;
    });
  return needs;
}

/** The garden map's regions, by continent. */
export const MAP_REGIONS = { eu: ['SE', 'NE'], us: ['USE', 'USW'] } as const;
export type MapRegion = (typeof MAP_REGIONS)[keyof typeof MAP_REGIONS][number];

export interface MapNight {
  day: string;
  /** Layer names: frost, soil, water, then one per crop. */
  layers: string[];
  /** Latitude and longitude ×100, place after place. */
  places: Int16Array;
}

const bytes = async (path: string, query: Record<string, string>) => {
  const response = await apiFetch(path, query);
  if (!response.ok) throw new Error(`Huerta map: ${response.status}`);
  return response.arrayBuffer();
};

const nights = new Map<MapRegion, Promise<MapNight>>();

/** A region's places for the latest night, asked once per visit. */
export function fetchMapNight(region: MapRegion, again = false) {
  if (again) nights.delete(region);
  if (!nights.has(region)) {
    const night = (async () => {
      const response = await apiFetch('/v1/map/index', { region });
      if (!response.ok) throw new Error(`Huerta map: ${response.status}`);
      const { day, layers } = (await response.json()) as MapNight;
      const places = new Int16Array(
        await bytes('/v1/map/places', { region, day })
      );
      return { day, layers, places };
    })();
    night.catch(() => nights.delete(region));
    nights.set(region, night);
  }
  return nights.get(region)!;
}

const layers = new Map<string, Promise<Uint8Array>>();

/** One layer of one region, one byte per place, for the night `day`; asked
 *  once per visit, as the year's months are looked at back and forth. */
export function fetchMapLayer(region: MapRegion, day: string, layer: string) {
  const key = `${region}/${day}/${layer}`;
  if (!layers.has(key)) {
    const got = bytes('/v1/map/layer', { region, day, layer }).then(
      b => new Uint8Array(b)
    );
    got.catch(() => layers.delete(key));
    layers.set(key, got);
  }
  return layers.get(key)!;
}

const YEAR_KEY = 'huerta-year';
const YEAR_DAYS = 1; // a rebuilt year reaches the device the next day
// The year files' shape: a year kept in an older one is asked for again at
// once (2: each crop's sowing seasons), and stands in only while offline.
const YEAR_FORMAT = 2;

/** The nearest place's year. Kept on the device for a day, then asked for
 *  again past the browser's own cache; the kept one stands in while the
 *  Worker can't be reached. Null where Huerta has no place. */
export async function fetchYear(place: Place): Promise<PlaceYear | null> {
  const lat = rounded(place.lat);
  const lon = rounded(place.lon);
  const kept = read<{
    v?: number;
    lat: number;
    lon: number;
    at: number;
    year: PlaceYear;
  }>(YEAR_KEY);
  const usable =
    kept &&
    kept.lat === lat &&
    kept.lon === lon &&
    CROPS.every(crop => crop.id in kept.year.crops) &&
    kept.year.temps &&
    kept.year.soil !== undefined &&
    // Kept from before the year files carried the climate: ask again.
    kept.year.climate
      ? kept.year
      : null;
  if (
    usable &&
    kept!.v === YEAR_FORMAT &&
    Date.now() - kept!.at < YEAR_DAYS * 864e5
  )
    return usable;
  let response: Response;
  try {
    response = await apiFetch('/v1/year', { lat, lon }, { cache: 'no-cache' });
  } catch (error) {
    if (usable) return usable;
    throw error;
  }
  if (response.status === 404) return null;
  if (!response.ok) {
    if (usable) return usable;
    throw new Error(`Huerta year: ${response.status}`);
  }
  const year = decodeYear((await response.json()) as YearResponse);
  write(YEAR_KEY, { v: YEAR_FORMAT, lat, lon, at: Date.now(), year });
  return year;
}
