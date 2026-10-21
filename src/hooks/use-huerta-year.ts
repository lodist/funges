import { useEffect, useState } from 'react';
import {
  fetchYear,
  huertaApiConfigured,
  savedPlace,
  type PlaceYear,
} from '@/lib/huerta-api';

/** The visitor's place's year, once known; null without a place or the API. */
export function useHuertaYear() {
  const [year, setYear] = useState<PlaceYear | null>(null);
  useEffect(() => {
    const place = huertaApiConfigured ? savedPlace() : null;
    if (!place) return;
    let live = true;
    fetchYear(place)
      .then(y => live && setYear(y))
      .catch(() => {}); // the pages read fine without it
    return () => {
      live = false;
    };
  }, []);
  return year;
}

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
