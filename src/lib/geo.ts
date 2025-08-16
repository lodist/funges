export type LngLat = [number, number];

// Type for GeoJSON coordinates which can be deeply nested
type GeoJSONCoordinate = LngLat | GeoJSONCoordinate[];

// Returns a representative [lng, lat] for any GeoJSON feature
// For points, the feature's coordinates are returned directly.
// For polygons/lines, a simple bbox centroid is computed.
export function getRepresentativeLngLat(
  feature: mapboxgl.GeoJSONFeature
): LngLat {
  const geom = feature.geometry;
  if (geom.type === 'Point') {
    return geom.coordinates as LngLat;
  }
  if (geom.type === 'MultiPoint') {
    return (geom.coordinates as LngLat[])[0];
  }
  // Collect all coordinate pairs from nested arrays
  const coords: LngLat[] = [];
  const extract = (c: GeoJSONCoordinate): void => {
    if (typeof c[0] === 'number') {
      coords.push(c as LngLat);
    } else if (Array.isArray(c)) {
      (c as GeoJSONCoordinate[]).forEach(extract);
    }
  };

  // Handle different geometry types
  if (geom.type === 'LineString' || geom.type === 'Polygon') {
    extract(geom.coordinates as GeoJSONCoordinate);
  } else if (geom.type === 'MultiLineString' || geom.type === 'MultiPolygon') {
    (geom.coordinates as GeoJSONCoordinate[][]).forEach(extract);
  }

  if (coords.length === 0) {
    return [0, 0];
  }
  let minX = coords[0][0];
  let maxX = coords[0][0];
  let minY = coords[0][1];
  let maxY = coords[0][1];
  coords.forEach(([x, y]) => {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  });
  return [(minX + maxX) / 2, (minY + maxY) / 2];
}
