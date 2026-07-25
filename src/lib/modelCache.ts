/**
 * Downloads and caches the BioCLIP image tower for on-device identification.
 *
 * Kept separate from `offlineCache.ts` on purpose, in its OWN IndexedDB
 * database. That file's `openDb()` calls `createObjectStore` unconditionally in
 * `onupgradeneeded`, with no `objectStoreNames.contains()` guard — so bumping
 * its version from here to add a store would throw `ConstraintError` for every
 * user already on schema v1. A separate database sidesteps that entirely while
 * reusing the same pattern (raw `indexedDB`, blob + metadata record, no `idb`
 * dependency).
 *
 * There is no calendar expiry, unlike the 14-day PMTiles TTL: a model artifact
 * does not go stale on a schedule. Staleness happens when a new version ships,
 * which `MODEL_VERSION` below expresses directly.
 */

const R2 = 'https://pub-9988c4492e7945f0a2ff14e35232acdf.r2.dev';

/**
 * Bump this when a new artifact is published, and publish under a NEW path.
 *
 * The path is versioned rather than stable because the service worker caches it
 * CacheFirst with a long TTL. At a fixed URL, users who already downloaded would
 * keep the old model forever with nothing to signal it.
 */
export const MODEL_VERSION = 'bioclip2-int8-2026-07';

export const MODEL_URL = `${R2}/models/bioclip/${MODEL_VERSION}/image_tower_int8.onnx`;

/** Approximate, for UI copy before the download starts. Real size comes from the response. */
export const MODEL_APPROX_BYTES = 307_000_000;

const DB_NAME = 'funges-model-cache';
const STORE_NAME = 'model-blobs';

interface StoredModel {
  version: string;
  blob: Blob;
  sizeBytes: number;
  cachedAt: number;
}

export interface ModelCacheInfo {
  version: string;
  sizeBytes: number;
  cachedAt: number;
}

export type ProgressFn = (progress: {
  receivedBytes: number;
  totalBytes: number | null;
  /** 0..1, or null when the server sends no Content-Length. */
  fraction: number | null;
}) => void;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      // Guarded, unlike offlineCache's — so a future version bump that adds a
      // second store cannot fail for users already on v1.
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'version' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Turn a streamed response into a Blob, reporting progress as it goes.
 *
 * Exported for testing: this is the only non-trivial logic here, and at ~306MB
 * it is also where a silent truncation would be most damaging — a short read
 * produces a corrupt ONNX file, and ORT's failure message would point at the
 * model rather than the download.
 */
export async function readWithProgress(
  response: Response,
  onProgress?: ProgressFn
): Promise<Blob> {
  const header = response.headers.get('content-length');
  const totalBytes = header ? Number(header) : null;

  if (!response.body) {
    // No streaming available (very old browser, or a mocked response). Fall
    // back to a single read; progress simply jumps to complete.
    const blob = await response.blob();
    onProgress?.({
      receivedBytes: blob.size,
      totalBytes: totalBytes ?? blob.size,
      fraction: 1,
    });
    return blob;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    receivedBytes += value.byteLength;
    onProgress?.({
      receivedBytes,
      totalBytes,
      fraction: totalBytes ? receivedBytes / totalBytes : null,
    });
  }

  // A truncated download must fail loudly. Storing a short blob would cache a
  // corrupt model that fails at session creation on every later attempt, and
  // the error would look like a model problem rather than a network one.
  if (totalBytes !== null && receivedBytes !== totalBytes) {
    throw new Error(
      `model download truncated: got ${receivedBytes} of ${totalBytes} bytes`
    );
  }

  return new Blob(chunks as BlobPart[], { type: 'application/octet-stream' });
}

/** The cached model, if the cached version matches what the code expects. */
export async function getCachedModel(): Promise<{
  blob: Blob;
  info: ModelCacheInfo;
} | null> {
  const db = await openDb();
  const record = await new Promise<StoredModel | undefined>(
    (resolve, reject) => {
      const request = db
        .transaction(STORE_NAME, 'readonly')
        .objectStore(STORE_NAME)
        .get(MODEL_VERSION);
      request.onsuccess = () =>
        resolve(request.result as StoredModel | undefined);
      request.onerror = () => reject(request.error);
    }
  );
  if (!record) return null;
  return {
    blob: record.blob,
    info: {
      version: record.version,
      sizeBytes: record.sizeBytes,
      cachedAt: record.cachedAt,
    },
  };
}

/** Size of everything cached here, for the storage figure on the offline page. */
export async function getCachedModelSize(): Promise<number> {
  const db = await openDb();
  const all = await new Promise<StoredModel[]>((resolve, reject) => {
    const request = db
      .transaction(STORE_NAME, 'readonly')
      .objectStore(STORE_NAME)
      .getAll();
    request.onsuccess = () => resolve(request.result as StoredModel[]);
    request.onerror = () => reject(request.error);
  });
  return all.reduce((sum, r) => sum + r.sizeBytes, 0);
}

export async function downloadModel(
  onProgress?: ProgressFn,
  signal?: AbortSignal
): Promise<ModelCacheInfo> {
  const response = await fetch(MODEL_URL, { signal });
  if (!response.ok) {
    throw new Error(`model download failed: ${response.status} ${MODEL_URL}`);
  }

  const blob = await readWithProgress(response, onProgress);
  const record: StoredModel = {
    version: MODEL_VERSION,
    blob,
    sizeBytes: blob.size,
    cachedAt: Date.now(),
  };

  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  // Drop any superseded version now that the new one is safely stored, rather
  // than before — a failed download must never leave the user with nothing.
  await removeOtherVersions(MODEL_VERSION);

  return {
    version: record.version,
    sizeBytes: record.sizeBytes,
    cachedAt: record.cachedAt,
  };
}

async function removeOtherVersions(keep: string): Promise<void> {
  const db = await openDb();
  const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
    const request = db
      .transaction(STORE_NAME, 'readonly')
      .objectStore(STORE_NAME)
      .getAllKeys();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const stale = keys.filter(k => k !== keep);
  if (stale.length === 0) return;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    stale.forEach(k => tx.objectStore(STORE_NAME).delete(k));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Remove every cached model, freeing the storage. */
export async function removeModel(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
