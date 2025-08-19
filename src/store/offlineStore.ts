import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface OfflineState {
  cachedSpecies: string[];
  cacheQuota: number; // in MB
  addSpecies: (code: string) => void;
  removeSpecies: (code: string) => void;
  clearAll: () => void;
}

const STORAGE_KEY = 'cachedSpecies';

export const useOfflineStore = create<OfflineState>()(
  devtools(set => ({
    cachedSpecies: JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'),
    cacheQuota: 500,
    addSpecies: code =>
      set(state => {
        if (state.cachedSpecies.includes(code)) return state;
        const updated = [...state.cachedSpecies, code];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        return { cachedSpecies: updated };
      }),
    removeSpecies: code =>
      set(state => {
        const updated = state.cachedSpecies.filter(s => s !== code);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        return { cachedSpecies: updated };
      }),
    clearAll: () => {
      localStorage.removeItem(STORAGE_KEY);
      set({ cachedSpecies: [] });
    },
  }))
);
