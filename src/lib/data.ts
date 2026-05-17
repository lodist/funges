export type RegionId = 'NE' | 'SE' | 'USE' | 'USW';

export interface ForagingRow {
  date: string;
  zone: string;
  precip_mm?: number;
  temp_avg?: number;
  temp_min?: number;
  temp_max?: number;
  humidity?: number;
  wind_ms?: number;
  pressure_hpa?: number;
  scores?: Record<string, number>;
}

export interface ForagingRegion {
  label: string;
  zones: string[];
  zones_geo: GeoJSON.FeatureCollection;
  data: ForagingRow[];
}

export interface ForagingDataset {
  updated_at: string;
  days: number;
  regions: Record<RegionId, ForagingRegion>;
}

const DATA_NERD_URL = `${import.meta.env.BASE_URL}data/data_nerd.json`;
const STORAGE_KEY = 'data:v10';
const STORAGE_TTL_MS = 3 * 60 * 60 * 1000;

let cached: ForagingDataset | null = null;
let cachedPromise: Promise<ForagingDataset> | null = null;

interface StoragePayload {
  cachedAt: number;
  dataset: ForagingDataset;
}

function isForagingDataset(v: unknown): v is ForagingDataset {
  if (!v || typeof v !== 'object') return false;
  const c = v as Partial<ForagingDataset>;
  return (
    typeof c.updated_at === 'string' &&
    typeof c.days === 'number' &&
    !!c.regions
  );
}

function readStorage(): ForagingDataset | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoragePayload>;
    if (
      typeof parsed.cachedAt !== 'number' ||
      !isForagingDataset(parsed.dataset)
    )
      return null;
    if (Date.now() - parsed.cachedAt > STORAGE_TTL_MS) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed.dataset;
  } catch {
    return null;
  }
}

function writeStorage(dataset: ForagingDataset) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ cachedAt: Date.now(), dataset })
    );
  } catch {
    // ignore quota errors
  }
}

export async function loadForagingDataset(): Promise<ForagingDataset> {
  if (cached) return cached;

  const local = readStorage();
  if (local) {
    cached = local;
    return local;
  }

  if (!cachedPromise) {
    cachedPromise = fetch(DATA_NERD_URL, {
      headers: { Accept: 'application/json' },
    })
      .then(async res => {
        if (!res.ok) throw new Error('Failed to load data nerd dataset');
        const data = (await res.json()) as unknown;
        if (!isForagingDataset(data))
          throw new Error('Data nerd dataset is malformed');
        cached = data;
        writeStorage(data);
        return data;
      })
      .finally(() => {
        cachedPromise = null;
      });
  }

  return cachedPromise;
}

export function formatZoneLabel(zone: string): string {
  return zone
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
