import { CROPS, type CropStatus, type PlaceAdvice } from '@/lib/huerta';

/**
 * Huerta's advice comes from the Huerta Worker, one place at a time, never as a
 * public file. Kept cheap: the position is rounded to ~1 km before it leaves
 * the device, a day's advice is kept and reused until the next day, and the
 * town search fetches one two-letter section of the town list once and
 * searches it here. The key rides in the URL so no call needs a preflight.
 */
const API = import.meta.env.VITE_HUERTA_API as string | undefined;
const KEY = import.meta.env.VITE_HUERTA_KEY as string | undefined;

/** Whether this build talks to the Worker (else the page shows its sample). */
export const huertaApiConfigured = Boolean(API && KEY);

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

const STATUS: Record<string, CropStatus> = {
  n: 'now',
  f: 'wait_frost',
  s: 'wait_soil',
  w: 'wait_warm',
  h: 'too_warm',
  l: 'too_late',
  x: 'not_here',
  a: 'wait_autumn',
  p: 'wait_spring',
};
const FROST: Record<string, PlaceAdvice['frost']> = {
  '': 'none',
  g: 'ground_frost',
  f: 'frost',
};

interface AdviceResponse {
  day: string;
  crops: string[];
  place: {
    name: string;
    frost: string;
    soil: number | null;
    nights: number | null;
    rain: number | null;
    water: number | null;
    /** One letter per entry of `crops`. */
    statuses: string;
  };
}

export const decodeAdvice = ({ day, crops, place }: AdviceResponse) => ({
  place: place.name,
  day,
  frost: FROST[place.frost] ?? 'none',
  soil: place.soil,
  nights: place.nights,
  rain: place.rain,
  water: place.water,
  crops: Object.fromEntries(
    crops.map((id, i) => [id, STATUS[place.statuses[i]] ?? 'too_late'])
  ),
});

const url = (path: string, query: Record<string, string | number>) =>
  `${API}${path}?${new URLSearchParams({ ...query, k: KEY ?? '' } as Record<string, string>)}`;

/** About 1 km: enough to find the nearest place, kinder to privacy and caches. */
const rounded = (value: number) => Math.round(value * 100) / 100;

const localDay = () => new Date().toLocaleDateString('sv'); // YYYY-MM-DD, local
const ADVICE_KEY = 'huerta-advice';
const PLACE_KEY = 'huerta-place';

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

/** The place the visitor chose last, if any. */
export const savedPlace = () => read<Place>(PLACE_KEY);
export const savePlace = (place: Place) =>
  write(PLACE_KEY, { lat: rounded(place.lat), lon: rounded(place.lon) });

/**
 * This week's advice at the place nearest `place`; null where Huerta has no
 * place (at sea, outside Europe and the US). Today's answer is kept, so a
 * second visit the same day asks nothing, unless the app now knows a crop the
 * kept answer lacks.
 */
export async function fetchAdvice(place: Place): Promise<PlaceAdvice | null> {
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
  const response = await fetch(url('/v1/advice', { lat, lon }));
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Huerta advice: ${response.status}`);
  const advice = decodeAdvice((await response.json()) as AdviceResponse);
  write(ADVICE_KEY, { lat, lon, advice });
  return advice;
}

/** Letters and digits in lower case, accents dropped: as the town list is keyed. */
export const plain = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .toLowerCase();

const sections = new Map<string, Promise<Town[]>>();

/** Towns whose name starts with `query`: exact names first, then shorter ones.
 *  Rejects when the town list cannot be reached, which is not "no such town". */
export async function searchTowns(query: string): Promise<Town[]> {
  const q = plain(query);
  if (q.length < 2) return [];
  const key = q.slice(0, 2);
  if (!sections.has(key)) {
    sections.set(
      key,
      fetch(url('/v1/towns', { q: key }))
        .then(r => {
          if (!r.ok) throw new Error(`Huerta towns: ${r.status}`);
          return r.json();
        })
        .then((rows: [string, number, number, string, string?][]) =>
          rows.map(([name, lat, lon, country, province = '']) => ({
            name,
            lat,
            lon,
            country,
            province,
          }))
        )
        .catch(error => {
          sections.delete(key); // try again next time
          throw error;
        })
    );
  }
  const towns = await sections.get(key)!;
  return towns
    .filter(town => plain(town.name).startsWith(q))
    .sort(
      (a, b) =>
        Number(plain(b.name) === q) - Number(plain(a.name) === q) ||
        a.name.length - b.name.length
    )
    .slice(0, 8);
}
