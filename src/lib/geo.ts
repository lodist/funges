export type LngLat = [number, number];

// Type for GeoJSON coordinates which can be deeply nested
type GeoJSONCoordinate = LngLat | GeoJSONCoordinate[];

// Area-weighted centroid of a polygon ring (shoelace). Falls back to the vertex
// mean for degenerate (zero-area) rings. Exact centre for a triangle.
function ringCentroid(ring: LngLat[]): { centroid: LngLat; area: number } {
  let twiceArea = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[i + 1];
    const cross = x0 * y1 - x1 * y0;
    twiceArea += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  if (twiceArea === 0) {
    const mean = ring.reduce(
      (acc, [x, y]) => [acc[0] + x, acc[1] + y] as LngLat,
      [0, 0] as LngLat
    );
    const n = ring.length || 1;
    return { centroid: [mean[0] / n, mean[1] / n], area: 0 };
  }
  return {
    centroid: [cx / (3 * twiceArea), cy / (3 * twiceArea)],
    area: Math.abs(twiceArea) / 2,
  };
}

// Returns a representative [lng, lat] for any GeoJSON feature.
// Points return their coordinates; polygons return the area-weighted centroid
// (for MultiPolygons, the centroid of the largest part) so a route stop lands
// inside the rendered polygon rather than at a bbox corner.
export function getRepresentativeLngLat(
  feature: maplibregl.GeoJSONFeature
): LngLat {
  const geom = feature.geometry;
  if (geom.type === 'Point') {
    return geom.coordinates as LngLat;
  }
  if (geom.type === 'MultiPoint') {
    return (geom.coordinates as LngLat[])[0];
  }
  if (geom.type === 'Polygon') {
    const ring = (geom.coordinates as LngLat[][])[0];
    if (ring && ring.length) return ringCentroid(ring).centroid;
  }
  if (geom.type === 'MultiPolygon') {
    let best: { centroid: LngLat; area: number } | null = null;
    for (const poly of geom.coordinates as LngLat[][][]) {
      const ring = poly[0];
      if (!ring || !ring.length) continue;
      const c = ringCentroid(ring);
      if (!best || c.area > best.area) best = c;
    }
    if (best) return best.centroid;
  }

  // LineString / fallback: bbox centre of all vertices.
  const coords: LngLat[] = [];
  const extract = (c: GeoJSONCoordinate): void => {
    if (typeof c[0] === 'number') {
      coords.push(c as LngLat);
    } else if (Array.isArray(c)) {
      (c as GeoJSONCoordinate[]).forEach(extract);
    }
  };
  extract(geom.coordinates as GeoJSONCoordinate);
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
