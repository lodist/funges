/**
 * The Huerta Worker's answers as the app reads them. Nothing here touches the
 * browser, so the Worker's morning cron decodes the night's files with the
 * same code.
 */
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
  };
}

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
  crops: Object.fromEntries(
    crops.map((id, i) => [id, STATUS[place.statuses[i]] ?? 'too_late'])
  ),
});

/** A crop's months at one place, bit 0 = January. */
export interface CropYear {
  sow: number;
  harvest: number;
}

/** A place's year: each crop's months, the 12 monthly mean air
 *  temperatures (C, January first), and the soil map's topsoil there (null
 *  where it has none). */
export interface PlaceYear {
  place: string;
  crops: Record<string, CropYear>;
  temps?: number[];
  soil?: MapSoil | null;
}

export interface YearResponse {
  crops: string[];
  place: {
    name: string;
    /** Six hex digits per entry of `crops`: sowing months, harvest months. */
    months: string;
    temps?: number[];
    /** Topsoil pH, clay %, sand %. */
    soil?: [number, number, number];
  };
}

export const decodeYear = ({ crops, place }: YearResponse): PlaceYear => ({
  place: place.name,
  temps: place.temps,
  soil: place.soil
    ? { ph: place.soil[0], clay: place.soil[1], sand: place.soil[2] }
    : null,
  crops: Object.fromEntries(
    crops.map((id, i) => {
      const code = place.months.slice(i * 6, i * 6 + 6);
      return [
        id,
        {
          sow: parseInt(code.slice(0, 3), 16),
          harvest: parseInt(code.slice(3), 16),
        },
      ];
    })
  ),
});
