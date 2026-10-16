import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  fetchCurrentScores,
  type CurrentScores,
} from '@/lib/worth-foraging-now';
import { useMapStore } from '@/store/mapStore';

/**
 * Today's score for every species, near the reader when the map knows where
 * they are and across the map's region otherwise. `null` until it loads, and
 * after a failed load: the catalog pages then fall back to the calendar alone.
 */
export function useCurrentScores(): CurrentScores | null {
  const { i18n } = useTranslation();
  const center = useMapStore(state => state.center);
  const userLocation = useMapStore(state => state.userLocation);
  const [current, setCurrent] = useState<CurrentScores | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchCurrentScores({ mapCenter: center, userLocation })
      .then(result => !cancelled && setCurrent(result))
      .catch(() => !cancelled && setCurrent(null));
    return () => {
      cancelled = true;
    };
    // The region label is translated, so a language change reloads it.
  }, [center, userLocation, i18n.language]);

  return current;
}
