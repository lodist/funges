import { describe, expect, it } from 'vitest';
import { getRepresentativeLngLat } from '@/lib/geo';
import type { GeoJSONFeature } from 'maplibre-gl';

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

  it('returns the centroid of a square Polygon', () => {
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

  it('returns the area centroid of a triangle (not the bbox centre)', () => {
    // bbox centre would be [3, 3]; the true centroid is the vertex mean [2, 2].
    const feature = makeFeature({
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [6, 0],
          [0, 6],
          [0, 0],
        ],
      ],
    });
    const [lng, lat] = getRepresentativeLngLat(feature);
    expect(lng).toBeCloseTo(2, 6);
    expect(lat).toBeCloseTo(2, 6);
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

  it('returns the centroid of the largest part for a MultiPolygon', () => {
    const feature = makeFeature({
      type: 'MultiPolygon',
      coordinates: [
        // larger part (6x6) -> its centroid [3, 3] wins
        [
          [
            [0, 0],
            [6, 0],
            [6, 6],
            [0, 6],
            [0, 0],
          ],
        ],
        // smaller part (2x2)
        [
          [
            [8, 8],
            [10, 8],
            [10, 10],
            [8, 10],
            [8, 8],
          ],
        ],
      ],
    });
    expect(getRepresentativeLngLat(feature)).toEqual([3, 3]);
  });
});
