/**
 * The Huerta Worker's answers as the app reads them. Nothing here touches the
 * browser, so the Worker's morning cron decodes the night's files with the
 * same code.
 */
import type { Bio, Warm } from '@/lib/growth';
import type { CropStatus, PlaceAdvice } from '@/lib/huerta';
import type { MapSoil } from '@/lib/soil';

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
  d: 'wait_days',
};
const FROST: Record<string, PlaceAdvice['frost']> = {
  '': 'none',
  g: 'ground_frost',
  f: 'frost',
};

export interface AdviceResponse {
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
    lastFrost?: number | null;
    firstFrost?: number | null;
    laterFrost?: string;
    laterNight?: string | null;
    /** The first day, then one byte a day in base64: (C + 30) x 2, 255
     *  unknown. */
    warm?: [string, string];
  };
}

/** The night's daily mean air at a place, from the advice's bytes. */
export const decodeWarm = ([start, bytes]: [string, string]): Warm => ({
  start,
  t: Array.from(atob(bytes), c => {
    const b = c.charCodeAt(0);
    return b === 255 ? null : b / 2 - 30;
  }),
});

export const decodeAdvice = ({
  day,
  crops,
  place,
}: AdviceResponse): PlaceAdvice => ({
  place: place.name,
  day,
  frost: FROST[place.frost] ?? 'none',
  soil: place.soil,
  nights: place.nights,
  rain: place.rain,
  water: place.water,
  lastFrost: place.lastFrost,
  firstFrost: place.firstFrost,
  laterFrost:
    place.laterFrost === undefined
      ? undefined
      : (FROST[place.laterFrost] ?? 'none'),
  laterNight: place.laterNight ?? null,
  ...(place.warm ? { warm: decodeWarm(place.warm) } : {}),
  crops: Object.fromEntries(
    crops.map((id, i) => [id, STATUS[place.statuses[i]] ?? 'too_late'])
  ),
});

/** The seasons a crop can be sown in, each a row of the calendar where it is
 *  sown in more than one: named for its middle, or 'overwinter', sown to stand
 *  the winter and harvested the following year. */
export const SEASONS = [
  'spring',
  'summer',
  'autumn',
  'winter',
  'overwinter',
] as const;
export type Season = (typeof SEASONS)[number];

/** A crop's months at one place, bit 0 = January; where it is sown in more
 *  than one season, each season's own. */
export interface CropYear {
  sow: number;
  harvest: number;
  seasons?: { season: Season; sow: number; harvest: number }[];
}

/** What a place's climate does to crops in the ground: its frost season
 *  (0 C) and hard-frost season (-3 C), each its first autumn and last spring
 *  night as days of the year (null: none in a typical year); its warm-night
 *  seasons (nights from 10 C, from 13 C), each its first and last day (null:
 *  never here); and its typical winter low (C, null: not known). */
export interface Climate {
  frost: [number, number] | null;
  hard: [number, number] | null;
  warm10: [number, number] | null;
  warm13: [number, number] | null;
  low: number | null;
  /** The first light frost (2 C) of autumn, day of the year; 0: none. */
  light?: number;
}

/** A place's year: each crop's months, the 12 monthly mean air
 *  temperatures (C, January first), the soil map's topsoil there (null
 *  where it has none), its climate and each crop's hardiness (the lowest
 *  temperature it lives through, C; null for tender crops), where the year
 *  files carry them. */
export interface PlaceYear {
  place: string;
  crops: Record<string, CropYear>;
  temps?: number[];
  soil?: MapSoil | null;
  climate?: Climate;
  hardy?: Record<string, number | null>;
  /** The 12 monthly mean sunshine, MJ m-2 day-1. */
  sun?: number[];
  /** Per crop, what the calendar's growth model needs (lib/growth); null
   *  for a crop whose harvest is a season. */
  bio?: Record<string, Bio | null>;
}

/** A crop's model parameters as the year files list them (bio_rows). */
type BioRow = [
  number,
  number,
  number,
  number,
  number,
  Bio['kill'],
  Bio['end'],
  number,
  number,
  number | null,
  number,
];

export interface YearResponse {
  crops: string[];
  /** Per crop, as `crops`. */
  hardy?: (number | null)[];
  bio?: (BioRow | null)[];
  place: {
    name: string;
    /** Six hex digits per entry of `crops`: sowing months, harvest months. */
    months: string;
    /** The crops sown in more than one season, by index in `crops`: seven
     *  characters per season, its index in SEASONS, then its sowing and harvest
     *  months as three hex digits each. */
    seasons?: Record<string, string>;
    temps?: number[];
    /** Topsoil pH, clay %, sand %. */
    soil?: [number, number, number];
    /** First frost, last frost, first hard frost, last hard frost, warm
     *  nights from 10 C start and end, from 13 C start and end (days of the
     *  year, 0: none), winter low (C or null), first light frost. */
    climate?: (number | null)[];
    sun?: number[];
  };
}

const days = (first: number | null, last: number | null) =>
  first && last ? ([first, last] as [number, number]) : null;

const seasonsOf = (code: string) =>
  Array.from({ length: code.length / 7 }, (_, k) => {
    const part = code.slice(k * 7, k * 7 + 7);
    return {
      season: SEASONS[Number(part[0])],
      sow: parseInt(part.slice(1, 4), 16),
      harvest: parseInt(part.slice(4), 16),
    };
  });

export const decodeYear = ({
  crops,
  hardy,
  bio,
  place,
}: YearResponse): PlaceYear => ({
  place: place.name,
  temps: place.temps,
  soil: place.soil
    ? { ph: place.soil[0], clay: place.soil[1], sand: place.soil[2] }
    : null,
  ...(place.climate
    ? {
        climate: {
          frost: days(place.climate[0], place.climate[1]),
          hard: days(place.climate[2], place.climate[3]),
          // A warm-night season's start may be day 0; its end is never.
          warm10: place.climate[5]
            ? [place.climate[4] ?? 0, place.climate[5]]
            : null,
          warm13: place.climate[7]
            ? [place.climate[6] ?? 0, place.climate[7]]
            : null,
          low: place.climate[8] ?? null,
          ...(place.climate[9] !== undefined
            ? { light: place.climate[9] ?? 0 }
            : {}),
        },
      }
    : {}),
  ...(hardy
    ? {
        hardy: Object.fromEntries(crops.map((id, i) => [id, hardy[i] ?? null])),
      }
    : {}),
  ...(place.sun ? { sun: place.sun } : {}),
  ...(bio
    ? {
        bio: Object.fromEntries(
          crops.map((id, i) => {
            const b = bio[i];
            return [
              id,
              b && {
                tb: b[0],
                tlo: b[1],
                thi: b[2],
                tmax: b[3],
                days: b[4],
                kill: b[5],
                end: b[6],
                pick: b[7],
                strict: Boolean(b[8]),
                hardy: b[9],
                night: Boolean(b[10]),
              },
            ];
          })
        ),
      }
    : {}),
  crops: Object.fromEntries(
    crops.map((id, i) => {
      const code = place.months.slice(i * 6, i * 6 + 6);
      const seasons = place.seasons?.[i];
      return [
        id,
        {
          sow: parseInt(code.slice(0, 3), 16),
          harvest: parseInt(code.slice(3), 16),
          ...(seasons ? { seasons: seasonsOf(seasons) } : {}),
        },
      ];
    })
  ),
});

/** The months a bit mask holds, January first. */
export const months = (mask: number) =>
  Array.from({ length: 12 }, (_, m) => (mask >> m) & 1).map(Boolean);

/** The first month after `from` (0-11) that the mask holds, wrapping; null if none. */
export function nextMonth(mask: number, from: number) {
  for (let k = 1; k <= 12; k++) {
    const m = (from + k) % 12;
    if ((mask >> m) & 1) return m;
  }
  return null;
}
