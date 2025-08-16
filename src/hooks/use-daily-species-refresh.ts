import { useEffect } from 'react';
import { usePWA } from './use-pwa';

const REFRESH_KEY = 'speciesLastRefresh';
const DAY = 1000 * 60 * 60 * 24;

export const useDailySpeciesRefresh = () => {
  const { isOnline } = usePWA();

  useEffect(() => {
    const refresh = () => {
      const last = Number(localStorage.getItem(REFRESH_KEY) || '0');
      const now = Date.now();
      if (isOnline && now - last > DAY) {
        // placeholder for refreshing species metadata
        localStorage.setItem(REFRESH_KEY, now.toString());
      }
    };

    refresh();
    window.addEventListener('online', refresh);
    return () => window.removeEventListener('online', refresh);
  }, [isOnline]);
};

export default useDailySpeciesRefresh;
