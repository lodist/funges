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

import {
  VARIANT_BY_VERSION,
  type ModelVariant,
  type VariantSpec,
} from './bioclip/variant';

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
  variant: ModelVariant;
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

function toInfo(record: StoredModel, spec: VariantSpec): ModelCacheInfo {
  return {
    version: record.version,
    variant: spec.variant,
    sizeBytes: record.sizeBytes,
    cachedAt: record.cachedAt,
  };
}

/**
 * Whichever variant is already on this device, if any.
 *
 * Deliberately "any known variant" rather than "the variant this device would
 * choose today". A user who already paid for a 307MB download must not be asked
 * to pay for a 280MB one because the selection logic changed underneath them;
 * `removeModel` is the way to switch. Records whose version is not a currently
 * published variant are ignored, which is how a retired artifact gets superseded.
 */
export async function getAnyCachedModel(): Promise<{
  blob: Blob;
  info: ModelCacheInfo;
} | null> {
  const db = await openDb();
  const all = await new Promise<StoredModel[]>((resolve, reject) => {
    const request = db
      .transaction(STORE_NAME, 'readonly')
      .objectStore(STORE_NAME)
      .getAll();
    request.onsuccess = () => resolve(request.result as StoredModel[]);
    request.onerror = () => reject(request.error);
  });

  for (const record of all) {
    const spec = VARIANT_BY_VERSION[record.version];
    if (spec) return { blob: record.blob, info: toInfo(record, spec) };
  }
  return null;
}

/** The cached model for one specific variant. */
export async function getCachedModel(spec: VariantSpec): Promise<{
  blob: Blob;
  info: ModelCacheInfo;
} | null> {
  const db = await openDb();
  const record = await new Promise<StoredModel | undefined>(
    (resolve, reject) => {
      const request = db
        .transaction(STORE_NAME, 'readonly')
        .objectStore(STORE_NAME)
        .get(spec.version);
      request.onsuccess = () =>
        resolve(request.result as StoredModel | undefined);
      request.onerror = () => reject(request.error);
    }
  );
  if (!record) return null;
  return { blob: record.blob, info: toInfo(record, spec) };
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
  spec: VariantSpec,
  onProgress?: ProgressFn,
  signal?: AbortSignal
): Promise<ModelCacheInfo> {
  const response = await fetch(spec.url, { signal });
  if (!response.ok) {
    throw new Error(`model download failed: ${response.status} ${spec.url}`);
  }

  const blob = await readWithProgress(response, onProgress);
  const record: StoredModel = {
    version: spec.version,
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
  // This also means only ever one artifact on disk, so switching variants
  // reclaims the old one instead of holding ~590MB.
  await removeOtherVersions(spec.version);

  return toInfo(record, spec);
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
