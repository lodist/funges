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
/** How far a cell reaches east and west, and north and south, of its place. */
const REACH_X = 0.06;
const REACH_Y = 0.04;

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

type Stops = [number, RGBA][];
interface Palette {
  crop: Record<'now' | 'wait' | 'over', RGBA>;
  /** No frost, ground frost, frost, frost later in the week (the bytes). */
  frost: [RGBA, RGBA, RGBA, RGBA];
  soil: Stops;
  water: Stops;
}

/** The layers' colours on a light basemap and on a dark one (worked out in
 *  OKLCH; the crop layer's three checked apart for colour blindness, and
 *  the deep green clear of the olive basemap the old one melted into).
 *  Every place the forecast covers is painted, its "nothing" faintest (no
 *  frost, no watering), so where the forecast ends shows: past it the map
 *  has no colour. Soil diverges at 10 C: cold in blue, warm in terracotta. */
export const PALETTES: Record<'light' | 'dark', Palette> = {
  light: {
    crop: {
      now: [6, 125, 77, 225], // oklch(0.52 0.12 158)
      wait: [247, 172, 77, 220], // oklch(0.80 0.14 70)
      over: [152, 149, 144, 150], // oklch(0.67 0.008 80)
    },
    frost: [
      [214, 226, 246, 100],
      [120, 161, 214, 215],
      [60, 97, 167, 230],
      [185, 212, 241, 205],
    ],
    soil: [
      [0, [47, 110, 158, 215]],
      [5, [124, 171, 204, 205]],
      [10, [232, 228, 221, 180]],
      [18, [233, 157, 110, 210]],
      [26, [176, 75, 43, 225]],
    ],
    water: [
      [0, [210, 231, 246, 100]],
      [1, [196, 228, 243, 190]],
      [15, [105, 174, 213, 210]],
      [35, [4, 96, 147, 230]],
    ],
  },
  // The ramps turned round: the "nothing" end dark, the most the brightest.
  dark: {
    crop: {
      now: [52, 157, 98, 215],
      wait: [234, 169, 80, 210],
      over: [79, 77, 72, 150],
    },
    frost: [
      [48, 57, 66, 120],
      [92, 136, 193, 210],
      [161, 199, 248, 225],
      [62, 91, 121, 200],
    ],
    soil: [
      [0, [84, 146, 197, 215]],
      [5, [55, 93, 118, 200]],
      [10, [59, 55, 50, 170]],
      [18, [163, 98, 59, 205]],
      [26, [235, 134, 86, 220]],
    ],
    water: [
      [0, [46, 58, 64, 120]],
      [1, [47, 82, 100, 185]],
      [15, [58, 137, 179, 205]],
      [35, [117, 202, 242, 225]],
    ],
  },
};

/** A layer's colour for one byte on a light (or `dark`) basemap; null leaves
 *  the place unpainted (no soil reading). */
export function colour(
  layer: MapLayer,
  value: number,
  dark = false
): RGBA | null {
  const palette = PALETTES[dark ? 'dark' : 'light'];
  if (layer === 'crop') return palette.crop[group(value)];
  if (layer === 'frost') return palette.frost[value] ?? null;
  if (value === 255) return null;
  if (layer === 'soil') return ramp(palette.soil, value - 40);
  return ramp(palette.water, value);
}

/** The crop layer's three groups (STATUS_GROUPS): in now, not yet, too late. */
const group = (value: number): keyof Palette['crop'] => {
  const code = String.fromCharCode(value);
  return code === 'n' ? 'now' : 'fswhap'.includes(code) ? 'wait' : 'over';
};

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
  values: Uint8Array,
  dark = false
): Uint8ClampedArray<ArrayBuffer> {
  const { places, bounds, width, height } = region;
  const pixels = new Uint8ClampedArray(width * height * 4);
  const perDegree = width / (bounds[2] - bounds[0]);
  const perRadian = (perDegree * 180) / Math.PI;
  const top = mercator(bounds[3]);
  for (let p = 0; p < values.length; p++) {
    const rgba = colour(layer, values[p], dark);
    if (!rgba) continue;
    const lat = places[2 * p] / 100,
      lon = places[2 * p + 1] / 100;
    // A cell runs edge to edge, a little past half the way to its neighbours:
    // kept to 0.01°, places sit 0.07 or 0.08° apart, and where two parts of
    // the grid meet a row can skip up to 0.12°; rows are 0.02-0.06° apart.
    const x0 = Math.max(0, Math.floor((lon - REACH_X - bounds[0]) * perDegree));
    const x1 = Math.min(
      width,
      Math.ceil((lon + REACH_X - bounds[0]) * perDegree)
    );
    const y0 = Math.max(
      0,
      Math.floor((top - mercator(lat + REACH_Y)) * perRadian)
    );
    const y1 = Math.min(
      height,
      Math.ceil((top - mercator(lat - REACH_Y)) * perRadian)
    );
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) pixels.set(rgba, (y * width + x) * 4);
  }
  return pixels;
}
