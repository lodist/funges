import { FileSource, PMTiles } from 'pmtiles';
import { protocol } from './pmtiles-protocol';
import {
  containsCoordinate,
  packageHasBasemap,
  packageSize,
  resourceVersion,
  type OfflinePackageDefinition,
  type OfflinePackageId,
  type OfflinePackageResource,
} from './offline-packages';

const DB_NAME = 'funges-offline';
const DB_VERSION = 2;
const PACKAGE_STORE = 'packages';
const RESOURCE_STORE = 'package-resources';
const OPFS_DIRECTORY = 'offline-map-packages';

export type OfflineStorageBackend = 'opfs' | 'indexeddb';

interface StoredPackage {
  id: OfflinePackageId;
  definition: OfflinePackageDefinition;
  version: string;
  cachedAt: number;
  sizeBytes: number;
  complete: boolean;
}

interface StoredResource {
  key: string;
  packageId: OfflinePackageId;
  resourceVersion: string;
  resourceId: string;
  kind: OfflinePackageResource['kind'];
  sourceUrl: string;
  sizeBytes: number;
  backend: OfflineStorageBackend;
  fileName?: string;
  blob?: Blob;
}

export interface OfflinePackageCacheInfo {
  id: OfflinePackageId;
  definition: OfflinePackageDefinition;
  version: string;
  sizeBytes: number;
  cachedAt: number;
  complete: boolean;
}

export interface OfflineDownloadProgress {
  packageId: OfflinePackageId;
  resourceId: string;
  receivedBytes: number;
  totalBytes: number;
  fraction: number;
}

export interface OfflineStorageEstimate {
  usageBytes: number | null;
  quotaBytes: number | null;
  persisted: boolean | null;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PACKAGE_STORE)) {
        db.createObjectStore(PACKAGE_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(RESOURCE_STORE)) {
        const resources = db.createObjectStore(RESOURCE_STORE, {
          keyPath: 'key',
        });
        resources.createIndex('packageId', 'packageId');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getStoredPackages(): Promise<StoredPackage[]> {
  const db = await openDb();
  return requestResult(
    db
      .transaction(PACKAGE_STORE, 'readonly')
      .objectStore(PACKAGE_STORE)
      .getAll()
  );
}

async function getStoredResources(): Promise<StoredResource[]> {
  const db = await openDb();
  return requestResult(
    db
      .transaction(RESOURCE_STORE, 'readonly')
      .objectStore(RESOURCE_STORE)
      .getAll()
  );
}

async function getResourcesForPackage(
  packageId: OfflinePackageId
): Promise<StoredResource[]> {
  const db = await openDb();
  const index = db
    .transaction(RESOURCE_STORE, 'readonly')
    .objectStore(RESOURCE_STORE)
    .index('packageId');
  return requestResult(index.getAll(packageId));
}

function resourceKey(
  definition: OfflinePackageDefinition,
  resource: OfflinePackageResource
): string {
  return `${definition.id}:${resourceVersion(definition, resource)}:${resource.id}`;
}

function safeFileName(key: string): string {
  return `${key.replace(/[^a-zA-Z0-9._-]/g, '_')}.pmtiles`;
}

function supportsOpfs(): boolean {
  return typeof navigator.storage?.getDirectory === 'function';
}

async function getOpfsDirectory(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(OPFS_DIRECTORY, { create: true });
}

async function readStoredFile(resource: StoredResource): Promise<File> {
  if (resource.backend === 'opfs' && resource.fileName) {
    const directory = await getOpfsDirectory();
    const handle = await directory.getFileHandle(resource.fileName);
    return handle.getFile();
  }
  if (resource.blob) {
    return new File([resource.blob], resource.sourceUrl, {
      type: 'application/octet-stream',
    });
  }
  throw new Error(`Offline resource ${resource.key} has no data`);
}

async function assertPmtilesFile(
  file: Blob,
  expectedBytes: number
): Promise<void> {
  if (file.size !== expectedBytes) {
    throw new Error(
      `Download truncated: received ${file.size} of ${expectedBytes} bytes`
    );
  }
  const magic = new Uint8Array(await file.slice(0, 3).arrayBuffer());
  if (magic[0] !== 0x50 || magic[1] !== 0x4d || magic[2] !== 3) {
    throw new Error('Downloaded file is not a PMTiles v3 archive');
  }
}

async function registerResource(resource: StoredResource): Promise<void> {
  const file = await readStoredFile(resource);
  const sourceFile = new File([file], resource.sourceUrl, {
    type: 'application/octet-stream',
  });
  protocol.add(new PMTiles(new FileSource(sourceFile)));
}

async function writeResponseToOpfs(
  response: Response,
  fileName: string,
  expectedBytes: number,
  signal: AbortSignal,
  onChunk: (bytes: number) => void
): Promise<File> {
  const directory = await getOpfsDirectory();
  const handle = await directory.getFileHandle(fileName, { create: true });
  const writable = await handle.createWritable();
  let received = 0;

  try {
    if (!response.body) {
      const blob = await response.blob();
      signal.throwIfAborted();
      await writable.write(blob);
      received = blob.size;
      onChunk(blob.size);
    } else {
      const reader = response.body.getReader();
      for (;;) {
        signal.throwIfAborted();
        const { done, value } = await reader.read();
        if (done) break;
        await writable.write(value);
        received += value.byteLength;
        onChunk(value.byteLength);
      }
    }
    await writable.close();
  } catch (error) {
    await writable.abort().catch(() => undefined);
    await directory.removeEntry(fileName).catch(() => undefined);
    throw error;
  }

  if (received !== expectedBytes) {
    await directory.removeEntry(fileName).catch(() => undefined);
    throw new Error(
      `Download truncated: received ${received} of ${expectedBytes} bytes`
    );
  }
  return handle.getFile();
}

async function downloadResource(
  definition: OfflinePackageDefinition,
  resource: OfflinePackageResource,
  signal: AbortSignal,
  onChunk: (bytes: number) => void
): Promise<StoredResource> {
  const response = await fetch(resource.downloadUrl ?? resource.sourceUrl, {
    signal,
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`Download failed (${response.status}): ${resource.id}`);
  }

  const header = response.headers.get('content-length');
  if (header && Number(header) !== resource.sizeBytes) {
    throw new Error(
      `Package catalog is stale for ${resource.id}: expected ${resource.sizeBytes}, server reported ${header}`
    );
  }

  const key = resourceKey(definition, resource);
  if (supportsOpfs()) {
    const fileName = safeFileName(key);
    const file = await writeResponseToOpfs(
      response,
      fileName,
      resource.sizeBytes,
      signal,
      onChunk
    );
    await assertPmtilesFile(file, resource.sizeBytes);
    return {
      key,
      packageId: definition.id,
      resourceVersion: resourceVersion(definition, resource),
      resourceId: resource.id,
      kind: resource.kind,
      sourceUrl: resource.sourceUrl,
      sizeBytes: file.size,
      backend: 'opfs',
      fileName,
    };
  }

  const blob = await response.blob();
  signal.throwIfAborted();
  onChunk(blob.size);
  await assertPmtilesFile(blob, resource.sizeBytes);
  return {
    key,
    packageId: definition.id,
    resourceVersion: resourceVersion(definition, resource),
    resourceId: resource.id,
    kind: resource.kind,
    sourceUrl: resource.sourceUrl,
    sizeBytes: blob.size,
    backend: 'indexeddb',
    blob,
  };
}

async function removeOpfsResource(resource: StoredResource): Promise<void> {
  if (resource.backend !== 'opfs' || !resource.fileName || !supportsOpfs()) {
    return;
  }
  const directory = await getOpfsDirectory();
  await directory.removeEntry(resource.fileName).catch(() => undefined);
}

export async function getOfflineStorageEstimate(): Promise<OfflineStorageEstimate> {
  if (!navigator.storage) {
    return { usageBytes: null, quotaBytes: null, persisted: null };
  }
  const [estimate, persisted] = await Promise.all([
    navigator.storage.estimate?.() ?? Promise.resolve({}),
    navigator.storage.persisted?.() ?? Promise.resolve(false),
  ]);
  return {
    usageBytes: estimate.usage ?? null,
    quotaBytes: estimate.quota ?? null,
    persisted,
  };
}

export async function requestOfflinePersistence(): Promise<boolean | null> {
  if (!navigator.storage?.persist) return null;
  return navigator.storage.persist();
}

export async function assertStorageCapacity(
  requiredBytes: number
): Promise<void> {
  const { usageBytes, quotaBytes } = await getOfflineStorageEstimate();
  if (usageBytes === null || quotaBytes === null) return;
  const freeBytes = quotaBytes - usageBytes;
  if (freeBytes < requiredBytes * 1.1) {
    throw new DOMException(
      `Not enough storage: ${requiredBytes} bytes required, ${freeBytes} available`,
      'QuotaExceededError'
    );
  }
}

export async function hydrateOfflineSources(): Promise<void> {
  const packages = (await getStoredPackages()).filter(item => item.complete);
  const resources = await getStoredResources();
  const activeVersions = new Map(
    packages.flatMap(item =>
      item.definition.resources.map(resource => [
        `${item.id}:${resource.id}`,
        resourceVersion(item.definition, resource),
      ])
    )
  );

  for (const resource of resources) {
    if (
      resource.kind === 'forecast' &&
      activeVersions.get(`${resource.packageId}:${resource.resourceId}`) ===
        resource.resourceVersion
    ) {
      await registerResource(resource);
    }
  }
}

export async function activateBasemapForCoordinate(
  longitude: number,
  latitude: number
): Promise<OfflinePackageId | null> {
  const packages = (await getStoredPackages()).filter(
    item =>
      item.complete &&
      packageHasBasemap(item.definition) &&
      containsCoordinate(item.definition, longitude, latitude)
  );
  const selected = packages.sort(
    (a, b) => packageSize(a.definition) - packageSize(b.definition)
  )[0];
  if (!selected) return null;

  const resources = await getResourcesForPackage(selected.id);
  for (const resource of resources) {
    const definitionResource = selected.definition.resources.find(
      candidate => candidate.id === resource.resourceId
    );
    if (
      definitionResource &&
      resource.resourceVersion ===
        resourceVersion(selected.definition, definitionResource) &&
      resource.kind === 'basemap'
    ) {
      await registerResource(resource);
    }
  }
  return selected.id;
}

export async function getCachedPackages(): Promise<OfflinePackageCacheInfo[]> {
  return (await getStoredPackages())
    .filter(item => item.complete)
    .map(item => ({ ...item }));
}

export async function downloadOfflinePackage(
  definition: OfflinePackageDefinition,
  options: {
    signal: AbortSignal;
    onProgress?: (progress: OfflineDownloadProgress) => void;
  }
): Promise<OfflinePackageCacheInfo> {
  await assertStorageCapacity(packageSize(definition));
  const previousResources = await getResourcesForPackage(definition.id);
  const previousById = new Map(
    previousResources.map(resource => [resource.resourceId, resource])
  );
  const downloaded: StoredResource[] = [];
  const retained: StoredResource[] = [];
  let receivedBytes = 0;
  const totalBytes = packageSize(definition);

  try {
    for (const resource of definition.resources) {
      const previous = previousById.get(resource.id);
      if (
        previous &&
        previous.resourceVersion === resourceVersion(definition, resource) &&
        previous.sourceUrl === resource.sourceUrl &&
        previous.sizeBytes === resource.sizeBytes
      ) {
        try {
          const file = await readStoredFile(previous);
          await assertPmtilesFile(file, resource.sizeBytes);
          retained.push(previous);
          receivedBytes += resource.sizeBytes;
          options.onProgress?.({
            packageId: definition.id,
            resourceId: resource.id,
            receivedBytes,
            totalBytes,
            fraction: Math.min(receivedBytes / totalBytes, 1),
          });
          continue;
        } catch {
          // Missing/corrupt retained data is downloaded again below.
        }
      }
      const stored = await downloadResource(
        definition,
        resource,
        options.signal,
        bytes => {
          receivedBytes += bytes;
          options.onProgress?.({
            packageId: definition.id,
            resourceId: resource.id,
            receivedBytes,
            totalBytes,
            fraction: Math.min(receivedBytes / totalBytes, 1),
          });
        }
      );
      downloaded.push(stored);
    }

    const cachedAt = Date.now();
    const record: StoredPackage = {
      id: definition.id,
      definition,
      version: definition.version,
      cachedAt,
      sizeBytes: [...retained, ...downloaded].reduce(
        (sum, item) => sum + item.sizeBytes,
        0
      ),
      complete: true,
    };
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([PACKAGE_STORE, RESOURCE_STORE], 'readwrite');
      const resources = tx.objectStore(RESOURCE_STORE);
      previousResources.forEach(item => resources.delete(item.key));
      [...retained, ...downloaded].forEach(item => resources.put(item));
      tx.objectStore(PACKAGE_STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
      tx.onerror = () => reject(tx.error);
    });

    for (const resource of downloaded.filter(
      item => item.kind === 'forecast'
    )) {
      await registerResource(resource);
    }
    const retainedKeys = new Set(retained.map(item => item.key));
    await Promise.all(
      previousResources
        .filter(item => !retainedKeys.has(item.key))
        .map(removeOpfsResource)
    );
    return { ...record };
  } catch (error) {
    await Promise.all(downloaded.map(removeOpfsResource));
    throw error;
  }
}

export async function removeOfflinePackage(
  packageId: OfflinePackageId
): Promise<void> {
  const resources = await getResourcesForPackage(packageId);
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([PACKAGE_STORE, RESOURCE_STORE], 'readwrite');
    tx.objectStore(PACKAGE_STORE).delete(packageId);
    const resourceStore = tx.objectStore(RESOURCE_STORE);
    resources.forEach(resource => resourceStore.delete(resource.key));
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
    tx.onerror = () => reject(tx.error);
  });
  resources.forEach(resource => protocol.tiles.delete(resource.sourceUrl));
  await Promise.all(resources.map(removeOpfsResource));
}
