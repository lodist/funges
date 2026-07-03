import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import {
  CONTINENTS,
  downloadContinent,
  removeContinent,
  getCachedContinents,
  purgeExpiredContinents,
  type ContinentId,
  type ContinentCacheInfo,
} from '@/lib/offlineCache';

interface OfflineState {
  cached: Partial<Record<ContinentId, ContinentCacheInfo>>;
  downloading: Partial<Record<ContinentId, boolean>>;
  error: string | null;
  refresh: () => Promise<void>;
  download: (continent: ContinentId) => Promise<void>;
  remove: (continent: ContinentId) => Promise<void>;
  purgeExpired: () => Promise<void>;
}

function toCachedMap(
  list: ContinentCacheInfo[]
): Partial<Record<ContinentId, ContinentCacheInfo>> {
  const cached: Partial<Record<ContinentId, ContinentCacheInfo>> = {};
  list.forEach(info => {
    cached[info.continent] = info;
  });
  return cached;
}

export const useOfflineStore = create<OfflineState>()(
  devtools((set, get) => ({
    cached: {},
    downloading: {},
    error: null,

    refresh: async () => {
      const list = await getCachedContinents();
      set({ cached: toCachedMap(list) });
    },

    download: async continent => {
      set(state => ({
        downloading: { ...state.downloading, [continent]: true },
        error: null,
      }));
      try {
        const info = await downloadContinent(continent);
        set(state => ({
          cached: { ...state.cached, [continent]: info },
          downloading: { ...state.downloading, [continent]: false },
        }));
      } catch (err) {
        set(state => ({
          downloading: { ...state.downloading, [continent]: false },
          error: err instanceof Error ? err.message : 'Download failed',
        }));
      }
    },

    remove: async continent => {
      await removeContinent(continent);
      set(state => {
        const cached = { ...state.cached };
        delete cached[continent];
        return { cached };
      });
    },

    purgeExpired: async () => {
      await purgeExpiredContinents();
      await get().refresh();
    },
  }))
);

export { CONTINENTS };
export type { ContinentId };
