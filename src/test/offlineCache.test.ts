import { describe, expect, it } from 'vitest';
import {
  containsCoordinate,
  packageHasBasemap,
  packageSize,
  validateOfflineManifest,
  type OfflinePackageDefinition,
} from '@/lib/offline-packages';

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
  it('calculates package capabilities and size', () => {
    expect(packageSize(definition)).toBe(120);
    expect(packageHasBasemap(definition)).toBe(true);
  });

  it('uses inclusive geographic bounds', () => {
    expect(containsCoordinate(definition, 5.95, 45.81)).toBe(true);
    expect(containsCoordinate(definition, 8.2, 46.8)).toBe(true);
    expect(containsCoordinate(definition, 11, 46.8)).toBe(false);
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
