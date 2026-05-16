import { describe, expect, it } from 'vitest';
import { getRepresentativeLngLat } from '@/lib/geo';
import type { GeoJSONFeature } from 'mapbox-gl';

function makeFeature(geometry: GeoJSONFeature['geometry']): GeoJSONFeature {
  return { type: 'Feature', geometry, properties: {} } as GeoJSONFeature;
}

describe('getRepresentativeLngLat', () => {
  it('returns coordinates directly for a Point', () => {
    const feature = makeFeature({ type: 'Point', coordinates: [7.5, 47.6] });
    expect(getRepresentativeLngLat(feature)).toEqual([7.5, 47.6]);
  });

  it('returns first coordinate for a MultiPoint', () => {
    const feature = makeFeature({
      type: 'MultiPoint',
      coordinates: [
        [1, 2],
        [3, 4],
      ],
    });
    expect(getRepresentativeLngLat(feature)).toEqual([1, 2]);
  });

  it('returns bbox centroid for a LineString', () => {
    const feature = makeFeature({
      type: 'LineString',
      coordinates: [
        [0, 0],
        [10, 10],
      ],
    });
    expect(getRepresentativeLngLat(feature)).toEqual([5, 5]);
  });

  it('returns bbox centroid for a Polygon', () => {
    const feature = makeFeature({
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
          [0, 0],
        ],
      ],
    });
    expect(getRepresentativeLngLat(feature)).toEqual([5, 5]);
  });

  it('returns bbox centroid for a MultiLineString', () => {
    const feature = makeFeature({
      type: 'MultiLineString',
      coordinates: [
        [
          [0, 0],
          [4, 4],
        ],
        [
          [6, 6],
          [10, 10],
        ],
      ],
    });
    expect(getRepresentativeLngLat(feature)).toEqual([5, 5]);
  });

  it('returns bbox centroid for a MultiPolygon', () => {
    const feature = makeFeature({
      type: 'MultiPolygon',
      coordinates: [
        [
          [
            [0, 0],
            [4, 0],
            [4, 4],
            [0, 4],
            [0, 0],
          ],
        ],
        [
          [
            [6, 6],
            [10, 6],
            [10, 10],
            [6, 10],
            [6, 6],
          ],
        ],
      ],
    });
    expect(getRepresentativeLngLat(feature)).toEqual([5, 5]);
  });
});
