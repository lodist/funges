export const OFFLINE_MANIFEST_VERSION = 1;

export type OfflinePackageId = string;
export type OfflineContinent = 'eu' | 'us';
export type OfflineResourceKind = 'basemap' | 'forecast';

export interface OfflinePackageResource {
  id: string;
  kind: OfflineResourceKind;
  /** Independent version so changing forecasts do not redownload a basemap. */
  version?: string;
  /** URL used by the MapLibre style and therefore by the PMTiles protocol. */
  sourceUrl: string;
  /** Immutable artifact URL. Defaults to sourceUrl when omitted. */
  downloadUrl?: string;
  sizeBytes: number;
  etag?: string;
  sha256?: string;
}

export interface OfflinePackageDefinition {
  id: OfflinePackageId;
  continent: OfflineContinent;
  name: string;
  description: string;
  bounds: [number, number, number, number];
  minZoom: number;
  maxZoom: number;
  version: string;
  updatedAt: string;
  published: boolean;
  resources: OfflinePackageResource[];
}

export interface OfflinePackageManifest {
  schemaVersion: number;
  generatedAt: string;
  packages: OfflinePackageDefinition[];
}

export function packageSize(definition: OfflinePackageDefinition): number {
  return definition.resources.reduce(
    (total, resource) => total + resource.sizeBytes,
    0
  );
}

export function resourceVersion(
  definition: OfflinePackageDefinition,
  resource: OfflinePackageResource
): string {
  return resource.version ?? definition.version;
}

export function packageHasBasemap(
  definition: OfflinePackageDefinition
): boolean {
  return definition.resources.some(resource => resource.kind === 'basemap');
}

export function packageHasForecast(
  definition: OfflinePackageDefinition
): boolean {
  return definition.resources.some(resource => resource.kind === 'forecast');
}

export function containsCoordinate(
  definition: OfflinePackageDefinition,
  longitude: number,
  latitude: number
): boolean {
  const [west, south, east, north] = definition.bounds;
  return (
    longitude >= west &&
    longitude <= east &&
    latitude >= south &&
    latitude <= north
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function validateOfflineManifest(
  candidate: unknown
): OfflinePackageManifest {
  if (!candidate || typeof candidate !== 'object') {
    throw new Error('Offline package manifest is not an object');
  }

  const manifest = candidate as Partial<OfflinePackageManifest>;
  if (manifest.schemaVersion !== OFFLINE_MANIFEST_VERSION) {
    throw new Error(
      `Unsupported offline manifest version: ${String(manifest.schemaVersion)}`
    );
  }
  if (!Array.isArray(manifest.packages)) {
    throw new Error('Offline package manifest has no packages');
  }

  const ids = new Set<string>();
  manifest.packages.forEach(definition => {
    if (!definition.id || ids.has(definition.id)) {
      throw new Error(`Invalid or duplicate package id: ${definition.id}`);
    }
    ids.add(definition.id);
    if (
      !Array.isArray(definition.bounds) ||
      definition.bounds.length !== 4 ||
      !definition.bounds.every(isFiniteNumber)
    ) {
      throw new Error(`Invalid bounds for package ${definition.id}`);
    }
    if (!Array.isArray(definition.resources) || !definition.resources.length) {
      throw new Error(`Package ${definition.id} has no resources`);
    }
    const resourceIds = new Set<string>();
    definition.resources.forEach(resource => {
      if (
        !resource.id ||
        resourceIds.has(resource.id) ||
        !['basemap', 'forecast'].includes(resource.kind) ||
        !resource.sourceUrl ||
        !isFiniteNumber(resource.sizeBytes) ||
        resource.sizeBytes <= 0
      ) {
        throw new Error(`Invalid resource in package ${definition.id}`);
      }
      resourceIds.add(resource.id);
    });
    const basemaps = definition.resources.filter(
      resource => resource.kind === 'basemap'
    );
    if (
      basemaps.length !== 1 ||
      !basemaps[0].downloadUrl ||
      !packageHasForecast(definition)
    ) {
      throw new Error(
        `Package ${definition.id} must include one downloadable basemap and forecast data`
      );
    }
  });

  return manifest as OfflinePackageManifest;
}

export async function fetchOfflineManifest(): Promise<OfflinePackageManifest> {
  const response = await fetch(
    `${import.meta.env.BASE_URL}offline-packages.json`,
    { cache: 'no-cache' }
  );
  if (!response.ok) {
    throw new Error(`Offline package catalog failed: ${response.status}`);
  }
  return validateOfflineManifest(await response.json());
}
