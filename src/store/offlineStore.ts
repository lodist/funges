import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import {
  activateBasemapForCoordinate,
  downloadOfflinePackage,
  getCachedPackages,
  getOfflineStorageEstimate,
  removeOfflinePackage,
  requestOfflinePersistence,
  type OfflineDownloadProgress,
  type OfflinePackageCacheInfo,
  type OfflineStorageEstimate,
} from '@/lib/offlineCache';
import {
  fetchOfflineManifest,
  type OfflinePackageDefinition,
  type OfflinePackageId,
} from '@/lib/offline-packages';

const controllers = new Map<OfflinePackageId, AbortController>();

interface OfflineState {
  available: OfflinePackageDefinition[];
  cached: Record<OfflinePackageId, OfflinePackageCacheInfo>;
  progress: Record<OfflinePackageId, OfflineDownloadProgress>;
  storage: OfflineStorageEstimate;
  activeBasemapId: OfflinePackageId | null;
  ready: boolean;
  loading: boolean;
  error: string | null;
  initialize: () => Promise<void>;
  refresh: () => Promise<void>;
  download: (packageId: OfflinePackageId) => Promise<void>;
  cancel: (packageId: OfflinePackageId) => void;
  remove: (packageId: OfflinePackageId) => Promise<void>;
  activateForCoordinate: (
    longitude: number,
    latitude: number
  ) => Promise<OfflinePackageId | null>;
}

function toCachedMap(
  list: OfflinePackageCacheInfo[]
): Record<OfflinePackageId, OfflinePackageCacheInfo> {
  return Object.fromEntries(list.map(info => [info.id, info]));
}

function errorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return 'Download cancelled';
  }
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    return 'There is not enough device storage for this map';
  }
  return error instanceof Error
    ? error.message
    : 'Offline map operation failed';
}

export const useOfflineStore = create<OfflineState>()(
  devtools((set, get) => ({
    available: [],
    cached: {},
    progress: {},
    storage: { usageBytes: null, quotaBytes: null, persisted: null },
    activeBasemapId: null,
    ready: false,
    loading: false,
    error: null,

    initialize: async () => {
      if (get().loading) return;
      set({ loading: true, error: null });
      try {
        const [manifest, cached, storage] = await Promise.all([
          fetchOfflineManifest(),
          getCachedPackages(),
          getOfflineStorageEstimate(),
        ]);
        set({
          available: manifest.packages.filter(item => item.published),
          cached: toCachedMap(cached),
          storage,
          ready: true,
          loading: false,
        });
      } catch (error) {
        set({ ready: true, loading: false, error: errorMessage(error) });
      }
    },

    refresh: async () => {
      const [cached, storage] = await Promise.all([
        getCachedPackages(),
        getOfflineStorageEstimate(),
      ]);
      set({ cached: toCachedMap(cached), storage });
    },

    download: async packageId => {
      const definition = get().available.find(item => item.id === packageId);
      if (!definition || controllers.has(packageId)) return;
      const controller = new AbortController();
      controllers.set(packageId, controller);
      set({ error: null });

      try {
        await requestOfflinePersistence();
        const info = await downloadOfflinePackage(definition, {
          signal: controller.signal,
          onProgress: value =>
            set(state => ({
              progress: { ...state.progress, [packageId]: value },
            })),
        });
        set(state => {
          const progress = { ...state.progress };
          delete progress[packageId];
          return {
            cached: { ...state.cached, [packageId]: info },
            progress,
          };
        });
        await get().refresh();
      } catch (error) {
        set(state => {
          const progress = { ...state.progress };
          delete progress[packageId];
          return { progress, error: errorMessage(error) };
        });
      } finally {
        controllers.delete(packageId);
      }
    },

    cancel: packageId => {
      controllers.get(packageId)?.abort();
    },

    remove: async packageId => {
      controllers.get(packageId)?.abort();
      try {
        await removeOfflinePackage(packageId);
        set(state => {
          const cached = { ...state.cached };
          const progress = { ...state.progress };
          delete cached[packageId];
          delete progress[packageId];
          return {
            cached,
            progress,
            activeBasemapId:
              state.activeBasemapId === packageId
                ? null
                : state.activeBasemapId,
          };
        });
        await get().refresh();
      } catch (error) {
        set({ error: errorMessage(error) });
      }
    },

    activateForCoordinate: async (longitude, latitude) => {
      try {
        const packageId = await activateBasemapForCoordinate(
          longitude,
          latitude
        );
        set({ activeBasemapId: packageId });
        return packageId;
      } catch (error) {
        set({ error: errorMessage(error) });
        return null;
      }
    },
  }))
);
