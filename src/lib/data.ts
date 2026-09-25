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

/** Direction from the zone's centre; 'c' = central. */
export type Compass = 'c' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

/** A basemap place label: local `name` plus translations keyed by language. */
export type PlaceName = { name: string } & Partial<Record<string, string>>;

/** An area that got clearly more rain than the zone's median. */
export interface RainHotspot {
  /** Median window total over the hotspot's cells. */
  rain_mm: number;
  /** 90th percentile of the same: the "up to" figure. */
  rain_high: number;
  /** Day most of the rain fell (YYYY-MM-DD). */
  peak_date: string;
  /** Rain-then-dry flush pattern active there (DataPage's rain-first check). */
  flush: boolean;
  /** Most prominent map labels there, most prominent first. */
  places?: PlaceName[];
  /** Set instead of `places` when the map has no label there. */
  dir?: Compass;
}

/**
 * Across-cell spread over a window ending today. A zone mean hides local
 * weather (a storm over Valencia averages to ~0 mm across Iberia), so the
 * narrative reads this to say where and how unevenly it rained.
 */
export interface ZoneSpread {
  /** Median cell's window rain total. */
  rain_p50?: number;
  /** Up to two, largest first; only for the 7, 14 and 30 day windows. */
  hotspots?: RainHotspot[];
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
const STORAGE_KEY = 'data:v12';
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
    !!c.regions &&
    // Pre-spread files have no ALL_ZONE rows and would render an empty page;
    // reject them so a stale cache or CDN copy is never used.
    Object.values(c.regions).every(r => !!r?.spread)
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
      // Revalidate with the CDN: the file changes every 3h and the page
      // already caches it in localStorage.
      cache: 'no-cache',
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
