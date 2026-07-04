import { PMTiles, FileSource } from 'pmtiles';
import { protocol } from './pmtiles-protocol';

export type ContinentId = 'eu' | 'us';

export const CONTINENTS: ContinentId[] = ['eu', 'us'];

const R2 = 'https://pub-9988c4492e7945f0a2ff14e35232acdf.r2.dev';

// Each continent's presence/forecast data lives in region-pair PMTiles files
// (NE+SE share the EU bbox, USE+USW share the US bbox — see mapStore's
// REGION_BBOX). There's no per-species file, so caching is continent-wide.
const CONTINENT_URLS: Record<ContinentId, string[]> = {
  eu: [
    `${R2}/EU/NE/ne_mushroom_data.pmtiles`,
    `${R2}/EU/SE/se_mushroom_data.pmtiles`,
    `${R2}/EU/NE/ne_forecast.pmtiles`,
    `${R2}/EU/SE/se_forecast.pmtiles`,
  ],
  us: [
    `${R2}/USA/USE/use_mushroom_data.pmtiles`,
    `${R2}/USA/USW/usw_mushroom_data.pmtiles`,
    `${R2}/USA/USE/use_forecast.pmtiles`,
    `${R2}/USA/USW/usw_forecast.pmtiles`,
  ],
};

export const CACHE_EXPIRY_MS = 14 * 24 * 60 * 60 * 1000;

const DB_NAME = 'funges-offline';
const STORE_NAME = 'pmtiles-blobs';

interface StoredBlob {
  url: string;
  continent: ContinentId;
  blob: Blob;
  sizeBytes: number;
  cachedAt: number;
}

export interface ContinentCacheInfo {
  continent: ContinentId;
  sizeBytes: number;
  cachedAt: number;
}

/** Pure grouping logic, kept separate from IndexedDB plumbing so it's unit-testable. */
export function groupByContinent(records: StoredBlob[]): ContinentCacheInfo[] {
  const byContinent = new Map<ContinentId, StoredBlob[]>();
  records.forEach(record => {
    const list = byContinent.get(record.continent) ?? [];
    list.push(record);
    byContinent.set(record.continent, list);
  });
  return Array.from(byContinent.entries()).map(([continent, group]) => ({
    continent,
    sizeBytes: group.reduce((sum, r) => sum + r.sizeBytes, 0),
    cachedAt: Math.min(...group.map(r => r.cachedAt)),
  }));
}

export function isExpired(cachedAt: number, now: number): boolean {
  return now - cachedAt > CACHE_EXPIRY_MS;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: 'url' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getAllStoredBlobs(): Promise<StoredBlob[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db
      .transaction(STORE_NAME, 'readonly')
      .objectStore(STORE_NAME)
      .getAll();
    request.onsuccess = () => resolve(request.result as StoredBlob[]);
    request.onerror = () => reject(request.error);
  });
}

function registerBlob(url: string, blob: Blob): void {
  protocol.add(new PMTiles(new FileSource(new File([blob], url))));
}

/** Re-registers whatever's already cached from a previous session. Call once at startup. */
export async function hydrateOfflineSources(): Promise<void> {
  const records = await getAllStoredBlobs();
  records.forEach(record => registerBlob(record.url, record.blob));
}

export async function getCachedContinents(): Promise<ContinentCacheInfo[]> {
  return groupByContinent(await getAllStoredBlobs());
}

export async function downloadContinent(
  continent: ContinentId
): Promise<ContinentCacheInfo> {
  const cachedAt = Date.now();
  // Atomic: if any file fails, nothing for this continent gets written or registered.
  const records: StoredBlob[] = await Promise.all(
    CONTINENT_URLS[continent].map(async url => {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to download ${url}: ${response.status}`);
      }
      const blob = await response.blob();
      return { url, continent, blob, sizeBytes: blob.size, cachedAt };
    })
  );

  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    records.forEach(record => tx.objectStore(STORE_NAME).put(record));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  records.forEach(record => registerBlob(record.url, record.blob));

  return groupByContinent(records)[0];
}

export async function removeContinent(continent: ContinentId): Promise<void> {
  const urls = CONTINENT_URLS[continent];
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    urls.forEach(url => tx.objectStore(STORE_NAME).delete(url));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  // Drop the offline-backed instance so the pmtiles:// resolver falls back to
  // its normal lazy FetchSource (network) for this URL again.
  urls.forEach(url => protocol.tiles.delete(url));
}

export async function purgeExpiredContinents(): Promise<ContinentId[]> {
  const now = Date.now();
  const continents = await getCachedContinents();
  const expired = continents.filter(c => isExpired(c.cachedAt, now));
  await Promise.all(expired.map(c => removeContinent(c.continent)));
  return expired.map(c => c.continent);
}
