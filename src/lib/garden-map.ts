/**
 * The garden map's drawing: every place of a region painted as one cell of
 * the places' grid, straight into a canvas laid out in the map's own (Web
 * Mercator) projection, so MapLibre can show it as one image with no
 * reprojection. A layer is one byte per place (see backend/huerta.py).
 */

/** The places' grid: 0.075° between places along a row. */
const LON_STEP = 0.075;
/** Pixels per grid step: crisp cells, a small canvas. */
const CELL_PX = 2;

export type MapLayer = 'crop' | 'frost' | 'soil' | 'water';
type RGBA = [number, number, number, number];

const mercator = (lat: number) =>
  Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));

export interface RegionGrid {
  /** Latitude and longitude ×100, place after place. */
  places: Int16Array;
  /** [west, south, east, north] of the drawing, degrees. */
  bounds: [number, number, number, number];
  width: number;
  height: number;
}

/** Where a region's places sit on its canvas. */
export function grid(places: Int16Array): RegionGrid {
  let south = 90,
    north = -90,
    west = 180,
    east = -180;
  for (let i = 0; i < places.length; i += 2) {
    const lat = places[i] / 100,
      lon = places[i + 1] / 100;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
    if (lon < west) west = lon;
    if (lon > east) east = lon;
  }
  const pad = LON_STEP / 2;
  const bounds: RegionGrid['bounds'] = [
    west - pad,
    south - pad,
    east + pad,
    north + pad,
  ];
  const width = Math.ceil(((bounds[2] - bounds[0]) / LON_STEP) * CELL_PX);
  const perRadian = width / (((bounds[2] - bounds[0]) * Math.PI) / 180);
  const height = Math.ceil(
    (mercator(bounds[3]) - mercator(bounds[1])) * perRadian
  );
  return { places, bounds, width, height };
}

/** A layer's colour for one byte; null leaves the place unpainted. */
export function colour(layer: MapLayer, value: number): RGBA | null {
  if (layer === 'crop') {
    const code = String.fromCharCode(value);
    if (code === 'n') return [201, 96, 58, 235];
    if ('fswhap'.includes(code)) return [245, 174, 144, 215];
    return [207, 198, 189, 170];
  }
  if (layer === 'frost')
    return value === 2
      ? [63, 107, 154, 225]
      : value === 1
        ? [169, 193, 220, 210]
        : null;
  if (value === 255) return null;
  if (layer === 'soil') return ramp(SOIL, value - 40);
  return value === 0 ? null : ramp(WATER, value);
}

const SOIL: [number, RGBA][] = [
  [0, [220, 230, 239, 215]],
  [10, [243, 220, 203, 215]],
  [18, [224, 144, 106, 220]],
  [26, [154, 63, 31, 225]],
];
const WATER: [number, RGBA][] = [
  [1, [222, 236, 246, 200]],
  [15, [130, 177, 214, 215]],
  [35, [47, 101, 150, 225]],
];

function ramp(stops: [number, RGBA][], x: number): RGBA {
  if (x <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [x1, c1] = stops[i];
    if (x <= x1) {
      const [x0, c0] = stops[i - 1];
      const t = (x - x0) / (x1 - x0);
      return c0.map((v, k) => Math.round(v + (c1[k] - v) * t)) as RGBA;
    }
  }
  return stops[stops.length - 1][1];
}

/** One layer of a region as RGBA pixels for its canvas. */
export function paint(
  region: RegionGrid,
  layer: MapLayer,
  values: Uint8Array
): Uint8ClampedArray<ArrayBuffer> {
  const { places, bounds, width, height } = region;
  const pixels = new Uint8ClampedArray(width * height * 4);
  const perDegree = width / (bounds[2] - bounds[0]);
  const perRadian = (perDegree * 180) / Math.PI;
  const top = mercator(bounds[3]);
  const half = Math.ceil(CELL_PX / 2);
  for (let p = 0; p < values.length; p++) {
    const rgba = colour(layer, values[p]);
    if (!rgba) continue;
    const lat = places[2 * p] / 100;
    const x = Math.round((places[2 * p + 1] / 100 - bounds[0]) * perDegree);
    const y = Math.round((top - mercator(lat)) * perRadian);
    // A cell reaches half a row up and down: rows are ~0.04-0.06° apart.
    const rows = Math.max(
      half,
      Math.ceil((0.03 * perDegree) / Math.cos((lat * Math.PI) / 180))
    );
    for (let dy = -rows; dy < rows; dy++) {
      const yy = y + dy;
      if (yy < 0 || yy >= height) continue;
      for (let dx = -half; dx < half; dx++) {
        const xx = x + dx;
        if (xx < 0 || xx >= width) continue;
        pixels.set(rgba, (yy * width + xx) * 4);
      }
    }
  }
  return pixels;
}
