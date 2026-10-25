/**
 * The garden map's drawing: every place of a region falls in one cell of a
 * grid laid out in the map's own (Web Mercator) projection, and each colour
 * class of a layer (a crop's status, frost, a band of soil warmth or of
 * watering) is traced around its cells as one smooth shape (marching
 * squares, then corner cutting) for a MapLibre fill layer: crisp, rounded
 * edges at every zoom. A layer is one byte per place (see backend/huerta.py).
 */
import { contours } from 'd3-contour';
import type { FeatureCollection, MultiLineString, MultiPolygon } from 'geojson';

/** The places' grid: 0.075° between places along a row, a cell a step. */
const LON_STEP = 0.075;
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
  /** [west, south, east, north] of the grid, degrees. */
  bounds: [number, number, number, number];
  width: number;
  height: number;
}

/** Where a region's places sit on its grid. */
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
  const width = Math.ceil((bounds[2] - bounds[0]) / LON_STEP);
  const perRadian = width / (((bounds[2] - bounds[0]) * Math.PI) / 180);
  const height = Math.ceil(
    (mercator(bounds[3]) - mercator(bounds[1])) * perRadian
  );
  return { places, bounds, width, height };
}

type Stops = [number, RGBA][];
interface Palette {
  /** Go in now and not yet; too late is hatched. */
  crop: Record<'now' | 'wait', RGBA>;
  /** Ground frost, frost, frost later in the week (bytes 1-3). */
  frost: [RGBA, RGBA, RGBA];
  soil: Stops;
  water: Stops;
  /** The forecast's limit and the too-late hatching. */
  line: string;
}

/** The layers' colours on a light basemap and on a dark one, worked out in
 *  OKLCH and checked apart for colour blindness. Go in now in a light
 *  apricot, Huerta's warmth, light enough to lie over a whole continent;
 *  not yet in pale sand; too late hatched in grey, as maps mark what is
 *  out. No frost and nothing to water stay uncoloured; a solid line marks
 *  where the forecast ends. Soil diverges at 10 C: cold in blue, warm in
 *  terracotta. */
export const PALETTES: Record<'light' | 'dark', Palette> = {
  light: {
    crop: {
      now: [234, 144, 109, 190], // oklch(0.74 0.12 42)
      wait: [247, 231, 187, 185], // oklch(0.93 0.06 90)
    },
    frost: [
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
      [1, [196, 228, 243, 190]],
      [15, [105, 174, 213, 210]],
      [35, [4, 96, 147, 230]],
    ],
    line: 'rgba(52, 50, 46, 0.75)',
  },
  // The ramps turned round: the "nothing" end dark, the most the brightest.
  dark: {
    crop: {
      now: [226, 134, 98, 190], // oklch(0.70 0.12 42)
      wait: [213, 194, 156, 175], // oklch(0.82 0.055 85)
    },
    frost: [
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
      [1, [47, 82, 100, 185]],
      [15, [58, 137, 179, 205]],
      [35, [117, 202, 242, 225]],
    ],
    line: 'rgba(236, 234, 228, 0.7)',
  },
};

/** Soil warmth in bands, C: under 2, 2-6, 6-10, ... 22 and over, each
 *  coloured at its middle; watering likewise, L/m²: 1-5, 5-10, 10-20,
 *  20-35, 35 and more (less than 1 uncoloured). */
const SOIL_EDGES = [2, 6, 10, 14, 18, 22];
const SOIL_MIDS = [0, 4, 8, 12, 16, 20, 24];
const WATER_EDGES = [5, 10, 20, 35];
const WATER_MIDS = [3, 7.5, 15, 27, 35];
const band = (edges: number[], x: number) => edges.filter(e => x >= e).length;

/** The crop layer's three groups (STATUS_GROUPS): now, not yet, too late. */
const group = (value: number) => {
  const code = String.fromCharCode(value);
  return code === 'n' ? 0 : 'fswhap'.includes(code) ? 1 : 2;
};

/** A class's look: a colour, or the too-late hatching. */
export type Fill = RGBA | 'hatch';

export interface Classes {
  fills: Fill[];
  /** The class of a place's byte; -1 for none (uncoloured). */
  of: (value: number) => number;
}

/** A layer's colour classes on a light (or `dark`) basemap. */
export function classes(layer: MapLayer, dark = false): Classes {
  const palette = PALETTES[dark ? 'dark' : 'light'];
  switch (layer) {
    case 'crop':
      return {
        fills: [palette.crop.now, palette.crop.wait, 'hatch'],
        of: group,
      };
    case 'frost':
      return { fills: palette.frost, of: v => (v >= 1 && v <= 3 ? v - 1 : -1) };
    case 'soil':
      return {
        fills: SOIL_MIDS.map(x => ramp(palette.soil, x)),
        of: v => (v === 255 ? -1 : band(SOIL_EDGES, v - 40)),
      };
    case 'water':
      return {
        fills: WATER_MIDS.map(x => ramp(palette.water, x)),
        of: v => (v === 255 || v < 1 ? -1 : band(WATER_EDGES, v)),
      };
  }
}

function ramp(stops: Stops, x: number): RGBA {
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

/** Each cell's class (-1: no place there, or none). */
export function cells(
  region: RegionGrid,
  values: Uint8Array,
  of: Classes['of']
): Int8Array {
  const { places, bounds, width, height } = region;
  const out = new Int8Array(width * height).fill(-1);
  const perDegree = width / (bounds[2] - bounds[0]);
  const perRadian = (perDegree * 180) / Math.PI;
  const top = mercator(bounds[3]);
  for (let p = 0; p < values.length; p++) {
    const k = of(values[p]);
    if (k < 0) continue;
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
    for (let y = y0; y < y1; y++) out.fill(k, y * width + x0, y * width + x1);
  }
  return out;
}

/** Chaikin's corner cutting, once: each edge's quarter points. */
function round(ring: number[][]): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i],
      [x1, y1] = ring[i + 1];
    out.push(
      [0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1],
      [0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1]
    );
  }
  out.push(out[0]);
  return out;
}

export type Shapes = FeatureCollection<
  MultiPolygon | MultiLineString,
  { fill?: string; opacity?: number; hatch?: boolean; edge?: boolean }
>;

/** One layer of a region as shapes: each class traced around its cells and
 *  rounded twice, and the line around every place the forecast covers, in
 *  longitude and latitude. */
export function shapes(
  region: RegionGrid,
  layer: MapLayer,
  values: Uint8Array,
  dark = false
): Shapes {
  const { fills, of } = classes(layer, dark);
  const cell = cells(region, values, of);
  const { bounds, width, height } = region;
  const perDegree = width / (bounds[2] - bounds[0]);
  const perRadian = (perDegree * 180) / Math.PI;
  const top = mercator(bounds[3]);
  const lonLat = ([x, y]: number[]) => [
    bounds[0] + x / perDegree,
    ((2 * Math.atan(Math.exp(top - y / perRadian)) - Math.PI / 2) * 180) /
      Math.PI,
  ];
  const trace = contours().size([width, height]).smooth(true).thresholds([0.5]);
  const field = new Float64Array(width * height);
  const rings = (polygons: number[][][][]) =>
    polygons.map(polygon =>
      polygon.map(ring => round(round(ring)).map(lonLat))
    );
  const features: Shapes['features'] = [];
  fills.forEach((fill, k) => {
    let any = false;
    for (let i = 0; i < cell.length; i++) {
      field[i] = cell[i] === k ? 1 : 0;
      any ||= cell[i] === k;
    }
    if (!any) return;
    features.push({
      type: 'Feature',
      properties:
        fill === 'hatch'
          ? { hatch: true }
          : {
              fill: `rgb(${fill[0]},${fill[1]},${fill[2]})`,
              opacity: fill[3] / 255,
            },
      geometry: {
        type: 'MultiPolygon',
        coordinates: rings(trace(field)[0].coordinates),
      },
    });
  });
  // The forecast's limit: around every place, whatever its value.
  const covered = cells(region, values, () => 0);
  for (let i = 0; i < covered.length; i++) field[i] = covered[i] === 0 ? 1 : 0;
  features.push({
    type: 'Feature',
    properties: { edge: true },
    geometry: {
      type: 'MultiLineString',
      coordinates: rings(trace(field)[0].coordinates).flat(),
    },
  });
  return { type: 'FeatureCollection', features };
}
