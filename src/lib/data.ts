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
  /** Rain reached by the wettest tenth of the zone that day. */
  precip_p90?: number;
  scores?: Record<string, number>;
}

/** Region-wide rows/spread key: the page's "all zones" view. */
export const ALL_ZONE = '_all';

export type Compass = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

/**
 * Across-cell spread over a window ending today. A zone mean hides local
 * weather (a storm over Valencia averages to ~0 mm across Iberia), so the
 * narrative reads this to say how uneven it was.
 */
export interface ZoneSpread {
  rain_p50?: number;
  rain_p90?: number;
  /** Where the wettest tenth sits; null when central or uniform. */
  rain_dir?: Compass | null;
  temp_avg_p10?: number;
  temp_avg_p90?: number;
  humidity_p10?: number;
  humidity_p90?: number;
  wind_ms_p10?: number;
  wind_ms_p90?: number;
}

export interface ForagingRegion {
  label: string;
  zones: string[];
  zones_geo: GeoJSON.FeatureCollection;
  /** One row per zone per day, plus ALL_ZONE rows. */
  data: ForagingRow[];
  /** zone (or ALL_ZONE) → window length in days → spread. */
  spread?: Record<string, Record<string, ZoneSpread>>;
}

export interface ForagingDataset {
  updated_at: string;
  days: number;
  regions: Record<RegionId, ForagingRegion>;
}

const DATA_NERD_URL = `${import.meta.env.BASE_URL}data/data_nerd.json`;
const STORAGE_KEY = 'data:v11';
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
