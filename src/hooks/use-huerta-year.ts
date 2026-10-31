import { useEffect, useState } from 'react';
import {
  fetchYear,
  huertaApiConfigured,
  savedPlace,
  type PlaceYear,
} from '@/lib/huerta-api';

/** The visitor's place's year, once known (null without a place or the
 *  API), and how asking for it went: `none` where Huerta has no place,
 *  `failed` when the Worker could not be reached; `retry` asks again. */
export function useHuertaYearLoad() {
  const [year, setYear] = useState<PlaceYear | null>(null);
  const [state, setState] = useState<'loading' | 'none' | 'failed'>('loading');
  const [tries, setTries] = useState(0);
  useEffect(() => {
    const place = huertaApiConfigured ? savedPlace() : null;
    if (!place) return;
    let live = true;
    fetchYear(place)
      .then(y => {
        if (!live) return;
        setYear(y);
        if (!y) setState('none');
      })
      .catch(() => live && setState('failed'));
    return () => {
      live = false;
    };
  }, [tries]);
  const retry = () => {
    setState('loading');
    setTries(n => n + 1);
  };
  return { year, state, retry };
}

/** The visitor's place's year, once known; null without a place or the API
 *  (the pages read fine without it). */
export const useHuertaYear = () => useHuertaYearLoad().year;

export { months, nextMonth } from '@/lib/huerta-wire';
