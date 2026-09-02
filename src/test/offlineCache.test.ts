import { describe, expect, it } from 'vitest';
import {
  containsCoordinate,
  intersectsBounds,
  offlineMapMaxZoom,
  ONLINE_MAX_ZOOM,
  packageHasBasemap,
  packageSize,
  validateOfflineManifest,
  type OfflinePackageDefinition,
} from '@/lib/offline-packages';
import {
  assertStorageCapacity,
  isOfflinePackageExpired,
  OFFLINE_PACKAGE_MAX_AGE_MS,
} from '@/lib/offlineCache';

const definition: OfflinePackageDefinition = {
  id: 'ch',
  continent: 'eu',
  name: 'Switzerland',
  description: 'Pilot',
  bounds: [5.95, 45.81, 10.49, 47.81],
  minZoom: 3,
  maxZoom: 12,
  version: 'v1',
  updatedAt: '2026-08-20T00:00:00Z',
  published: true,
  resources: [
    {
      id: 'basemap',
      kind: 'basemap',
      sourceUrl: 'https://example.com/world.pmtiles',
      downloadUrl: 'https://example.com/ch.pmtiles',
      sizeBytes: 100,
    },
    {
      id: 'forecast',
      kind: 'forecast',
      sourceUrl: 'https://example.com/forecast.pmtiles',
      sizeBytes: 20,
    },
  ],
};

describe('offline package definitions', () => {
  it('counts replaceable package files as available space during updates', async () => {
    const originalStorage = Object.getOwnPropertyDescriptor(
      navigator,
      'storage'
    );
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        estimate: async () => ({ usage: 1_700, quota: 2_000 }),
        persisted: async () => false,
      },
    });

    try {
      await expect(assertStorageCapacity(1_300)).rejects.toMatchObject({
        name: 'QuotaExceededError',
      });
      await expect(
        assertStorageCapacity(1_300, 1_200)
      ).resolves.toBeUndefined();
    } finally {
      if (originalStorage) {
        Object.defineProperty(navigator, 'storage', originalStorage);
      } else {
        Reflect.deleteProperty(navigator, 'storage');
      }
    }
  });

  it('expires a downloaded package after seven days', () => {
    const downloadedAt = Date.UTC(2026, 7, 20);
    expect(
      isOfflinePackageExpired(
        downloadedAt,
        downloadedAt + OFFLINE_PACKAGE_MAX_AGE_MS - 1
      )
    ).toBe(false);
    expect(
      isOfflinePackageExpired(
        downloadedAt,
        downloadedAt + OFFLINE_PACKAGE_MAX_AGE_MS
      )
    ).toBe(true);
  });

  it('calculates package capabilities and size', () => {
    expect(packageSize(definition)).toBe(120);
    expect(packageHasBasemap(definition)).toBe(true);
  });

  it('uses inclusive geographic bounds', () => {
    expect(containsCoordinate(definition, 5.95, 45.81)).toBe(true);
    expect(containsCoordinate(definition, 8.2, 46.8)).toBe(true);
    expect(containsCoordinate(definition, 11, 46.8)).toBe(false);
  });

  it('keeps a package in view while any part of it is on screen', () => {
    // The centre sits north of Switzerland but the package still covers the
    // bottom of the viewport - this is the case that used to show the notice.
    expect(intersectsBounds(definition, [4, 46.5, 12, 52])).toBe(true);
    // A sliver of overlap at the very edge is enough.
    expect(intersectsBounds(definition, [10.49, 47.81, 20, 55])).toBe(true);
    // Only a viewport with no overlap at all shows the notice.
    expect(intersectsBounds(definition, [11, 48, 20, 55])).toBe(false);
    expect(intersectsBounds(definition, [-20, 30, -10, 40])).toBe(false);
  });

  it('accepts a supported, complete manifest', () => {
    const manifest = {
      schemaVersion: 1,
      generatedAt: '2026-08-20T00:00:00Z',
      packages: [definition],
    };
    expect(validateOfflineManifest(manifest)).toBe(manifest);
  });

  it('rejects duplicate package ids', () => {
    expect(() =>
      validateOfflineManifest({
        schemaVersion: 1,
        generatedAt: '2026-08-20T00:00:00Z',
        packages: [definition, definition],
      })
    ).toThrow(/duplicate package id/i);
  });

  it('rejects packages without a downloadable basemap', () => {
    expect(() =>
      validateOfflineManifest({
        schemaVersion: 1,
        generatedAt: '2026-08-20T00:00:00Z',
        packages: [
          {
            ...definition,
            resources: definition.resources.filter(
              resource => resource.kind === 'forecast'
            ),
          },
        ],
      })
    ).toThrow(/downloadable basemap/i);
  });

  it('rejects incompatible manifest versions', () => {
    expect(() =>
      validateOfflineManifest({ schemaVersion: 2, packages: [] })
    ).toThrow(/unsupported offline manifest version/i);
  });
});

describe('offlineMapMaxZoom', () => {
  it('caps the camera at the offline package maxZoom', () => {
    expect(offlineMapMaxZoom(false, 8)).toBe(8);
  });

  it('keeps the full range online even over a downloaded package', () => {
    expect(offlineMapMaxZoom(true, 8)).toBe(ONLINE_MAX_ZOOM);
  });

  it('keeps the full range offline with no package covering the view', () => {
    expect(offlineMapMaxZoom(false, null)).toBe(ONLINE_MAX_ZOOM);
  });
});
