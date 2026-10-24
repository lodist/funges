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

export { months, nextMonth } from '@/lib/huerta-wire';
