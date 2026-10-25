/**
 * The garden map's drawing: every place of a region falls in one cell of a
 * grid laid out in the map's own (Web Mercator) projection, and a layer's
 * values (soil warmth, the week's coldest hour, its water balance, or a
 * crop's status) become bands of colour: one field, smoothed a little, cut
 * at each band's edge (marching squares, d3-contour), so neighbouring bands
 * share their edges exactly; each band is the area between two cuts, its
 * rings nested as polygons for a MapLibre fill layer. A layer is one byte per
 * place (see backend/huerta.py).
 */
import { contours } from 'd3-contour';
import type { FeatureCollection, MultiLineString, MultiPolygon } from 'geojson';

/** The places' grid: 0.075° between places along a row, a cell a step. */
const LON_STEP = 0.075;
/** How far a cell reaches east and west, and north and south, of its place. */
const REACH_X = 0.06;
const REACH_Y = 0.04;

export type MapLayer = 'crop' | 'frost' | 'soil' | 'water';
/** The bytes a layer is drawn from: a crop's status, soil warmth, the week's
 *  coldest hour (cold) and water balance (balance), or, in files from before
 *  those, frost codes (frost) and water still to give (water). */
export type MapSource =
  | 'crop'
  | 'soil'
  | 'cold'
  | 'balance'
  | 'frost'
  | 'water';
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
  /** Go in now and not yet; too late is hatched over `wash`. */
  crop: Record<'now' | 'wait', RGBA>;
  wash: RGBA;
  /** The old frost codes, mildest first: later in the week, ground frost, frost. */
  frost: [RGBA, RGBA, RGBA];
  soil: Stops;
  cold: Stops;
  balance: Stops;
  water: Stops;
  /** The forecast's limit and the too-late hatching. */
  line: string;
}

/** The layers' colours on a light basemap and on a dark one, worked out in
 *  OKLCH and checked apart for colour blindness. Go in now in a light
 *  apricot, not yet in pale sand, too late greyed and hatched. Warmth, cold
 *  and water share one language: blue for cold or wet, terracotta for warm
 *  or dry, a pale neutral between. */
export const PALETTES: Record<'light' | 'dark', Palette> = {
  light: {
    crop: {
      now: [234, 144, 109, 190], // oklch(0.74 0.12 42)
      wait: [247, 231, 187, 185], // oklch(0.93 0.06 90)
    },
    wash: [236, 234, 228, 110],
    frost: [
      [185, 212, 241, 205],
      [120, 161, 214, 215],
      [60, 97, 167, 230],
    ],
    soil: [
      [0, [47, 110, 158, 215]],
      [5, [124, 171, 204, 205]],
      [10, [232, 228, 221, 180]],
      [18, [233, 157, 110, 210]],
      [26, [176, 75, 43, 225]],
    ],
    cold: [
      [-8, [33, 78, 140, 225]],
      [-3, [47, 110, 158, 215]],
      [1, [124, 171, 204, 205]],
      [6, [232, 228, 221, 180]],
      [12, [233, 157, 110, 205]],
      [18, [176, 75, 43, 220]],
    ],
    balance: [
      [-35, [176, 75, 43, 220]],
      [-15, [233, 157, 110, 205]],
      [0, [232, 228, 221, 170]],
      [15, [124, 171, 204, 200]],
      [45, [47, 110, 158, 220]],
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
    wash: [24, 24, 22, 110],
    frost: [
      [62, 91, 121, 200],
      [92, 136, 193, 210],
      [161, 199, 248, 225],
    ],
    soil: [
      [0, [84, 146, 197, 215]],
      [5, [55, 93, 118, 200]],
      [10, [59, 55, 50, 170]],
      [18, [163, 98, 59, 205]],
      [26, [235, 134, 86, 220]],
    ],
    cold: [
      [-8, [140, 190, 240, 225]],
      [-3, [84, 146, 197, 215]],
      [1, [55, 93, 118, 200]],
      [6, [59, 55, 50, 170]],
      [12, [163, 98, 59, 205]],
      [18, [235, 134, 86, 220]],
    ],
    balance: [
      [-35, [235, 134, 86, 220]],
      [-15, [163, 98, 59, 205]],
      [0, [59, 55, 50, 165]],
      [15, [55, 93, 118, 200]],
      [45, [117, 202, 242, 220]],
    ],
    water: [
      [1, [47, 82, 100, 185]],
      [15, [58, 137, 179, 205]],
      [35, [117, 202, 242, 225]],
    ],
    line: 'rgba(236, 234, 228, 0.7)',
  },
};

/** A band's look: a colour, too late (hatched over a wash), or none. */
export type Fill = RGBA | 'over' | null;

export interface Bands {
  /** The value a place's byte stands for; NaN for none. */
  value: (byte: number) => number;
  /** Where one band ends and the next begins, ascending. */
  edges: number[];
  /** A fill per band: one more than there are edges. */
  fills: Fill[];
  /** About half a band: how sharply a band meets the forecast's limit. */
  step: number;
  /** Rounds of smoothing over neighbouring places. */
  smooth: number;
}

/** The crop layer's groups as an order: now, not yet, too late. */
const STATUS = (byte: number) => {
  const code = String.fromCharCode(byte);
  return code === 'n' ? 0 : 'fswhap'.includes(code) ? 1 : 2;
};
/** The old frost codes by how hard: none, later in the week, ground frost, frost. */
const SEVERITY = [0, 2, 3, 1];
const offset = (by: number) => (byte: number) =>
  byte === 255 ? NaN : byte - by;
/** Each band's middle, the outer two half a band past their edges. */
const middles = (edges: number[]) => [
  edges[0] - (edges[1] - edges[0]) / 2,
  ...edges.slice(1).map((e, i) => (e + edges[i]) / 2),
  edges[edges.length - 1] +
    (edges[edges.length - 1] - edges[edges.length - 2]) / 2,
];

/** How a source is cut into bands, and each band's colour. */
export function bands(source: MapSource, dark = false): Bands {
  const palette = PALETTES[dark ? 'dark' : 'light'];
  const ramped = (stops: Stops, edges: number[]) =>
    middles(edges).map(x => ramp(stops, x));
  switch (source) {
    case 'crop':
      return {
        value: STATUS,
        edges: [0.5, 1.5],
        fills: [palette.crop.now, palette.crop.wait, 'over'],
        step: 0.5,
        smooth: 1,
      };
    case 'frost':
      return {
        value: byte => SEVERITY[byte] ?? NaN,
        edges: [0.5, 1.5, 2.5],
        fills: [null, ...palette.frost],
        step: 0.5,
        smooth: 1,
      };
    case 'water': {
      const edges = [1, 5, 10, 20, 35];
      return {
        value: offset(0),
        edges,
        fills: [null, ...ramped(palette.water, edges).slice(1)],
        step: 2,
        smooth: 1,
      };
    }
    case 'soil': {
      const edges = [2, 6, 10, 14, 18, 22];
      return {
        value: offset(40),
        edges,
        fills: ramped(palette.soil, edges),
        step: 2,
        smooth: 1,
      };
    }
    case 'cold': {
      const edges = [-6, -4, -2, 0, 2, 4, 7, 10, 14];
      return {
        value: offset(40),
        edges,
        fills: ramped(palette.cold, edges),
        step: 1,
        smooth: 2,
      };
    }
    case 'balance': {
      const edges = [-30, -20, -12, -6, -2, 2, 8, 20, 40];
      return {
        value: offset(100),
        edges,
        fills: ramped(palette.balance, edges),
        step: 2,
        smooth: 2,
      };
    }
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

/** Each cell's value (NaN: no place there, or none). */
export function field(
  region: RegionGrid,
  bytes: Uint8Array,
  value: Bands['value']
): Float32Array {
  const { places, bounds, width, height } = region;
  const out = new Float32Array(width * height).fill(NaN);
  const perDegree = width / (bounds[2] - bounds[0]);
  const perRadian = (perDegree * 180) / Math.PI;
  const top = mercator(bounds[3]);
  for (let p = 0; p < bytes.length; p++) {
    const v = value(bytes[p]);
    if (Number.isNaN(v)) continue;
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
    for (let y = y0; y < y1; y++) out.fill(v, y * width + x0, y * width + x1);
  }
  // A seam the places skip (where two parts of their grid meet, rows can lie
  // further apart than a cell reaches, at any angle): an empty cell with
  // places in at least 6 of its 8 neighbours takes their mean, or it would
  // draw as a thin line through the map. Lakes and coasts have fewer.
  const seams: [number, number][] = [];
  for (let y = 1; y < height - 1; y++)
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      if (!Number.isNaN(out[i])) continue;
      let sum = 0,
        n = 0;
      for (const j of [
        i - width - 1,
        i - width,
        i - width + 1,
        i - 1,
        i + 1,
        i + width - 1,
        i + width,
        i + width + 1,
      ])
        if (!Number.isNaN(out[j])) {
          sum += out[j];
          n++;
        }
      if (n >= 6) seams.push([i, sum / n]);
    }
  for (const [i, v] of seams) out[i] = v;
  return out;
}

/** Each place's value averaged with its neighbours' (its own counted twice),
 *  places only: a lone place unlike all around it fades into them, and the
 *  forecast's limit stays where it is. */
export function smoothed(
  values: Float32Array,
  width: number,
  height: number,
  rounds: number
): Float32Array {
  let cur = values;
  for (let r = 0; r < rounds; r++) {
    const next = new Float32Array(cur.length).fill(NaN);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (Number.isNaN(cur[i])) continue;
        let sum = cur[i],
          weight = 1;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= height) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= width) continue;
            const v = cur[yy * width + xx];
            if (!Number.isNaN(v)) {
              sum += v;
              weight++;
            }
          }
        }
        next[i] = sum / weight;
      }
    cur = next;
  }
  return cur;
}

type Ring = number[][];
interface RingInfo {
  ring: Ring;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  area: number;
  /** Edges by row band, for rings too long to walk for every point. */
  rows?: number[][];
  rowHeight?: number;
}

function info(ring: Ring): RingInfo {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity,
    twice = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [ax, ay] = ring[i],
      [bx, by] = ring[i + 1];
    if (ax < x0) x0 = ax;
    if (ax > x1) x1 = ax;
    if (ay < y0) y0 = ay;
    if (ay > y1) y1 = ay;
    twice += ax * by - bx * ay;
  }
  return { ring, x0, y0, x1, y1, area: Math.abs(twice) / 2 };
}

/** Whether a point is inside a ring (crossings to its right). */
function inside(r: RingInfo, x: number, y: number) {
  if (x < r.x0 || x > r.x1 || y < r.y0 || y > r.y1) return false;
  const pts = r.ring;
  if (pts.length > 256 && !r.rows) {
    const n = Math.ceil(pts.length / 32);
    r.rowHeight = (r.y1 - r.y0) / n || 1;
    r.rows = Array.from({ length: n }, () => []);
    for (let i = 0; i < pts.length - 1; i++) {
      const lo = Math.min(pts[i][1], pts[i + 1][1]),
        hi = Math.max(pts[i][1], pts[i + 1][1]);
      const b0 = Math.min(n - 1, Math.floor((lo - r.y0) / r.rowHeight));
      const b1 = Math.min(n - 1, Math.floor((hi - r.y0) / r.rowHeight));
      for (let b = b0; b <= b1; b++) r.rows[b].push(i);
    }
  }
  const edges = r.rows
    ? r.rows[Math.min(r.rows.length - 1, Math.floor((y - r.y0) / r.rowHeight!))]
    : null;
  let crossings = false;
  const count = edges ? edges.length : pts.length - 1;
  for (let k = 0; k < count; k++) {
    const i = edges ? edges[k] : k;
    const [ax, ay] = pts[i],
      [bx, by] = pts[i + 1];
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax)
      crossings = !crossings;
  }
  return crossings;
}

/** A point just inside a ring, beside one of its edges. */
function within(r: RingInfo): [number, number] {
  const pts = r.ring;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i],
      [bx, by] = pts[i + 1];
    const length = Math.hypot(bx - ax, by - ay);
    if (length < 1e-9) continue;
    const mx = (ax + bx) / 2,
      my = (ay + by) / 2,
      nx = (-(by - ay) / length) * 1e-4,
      ny = ((bx - ax) / length) * 1e-4;
    if (inside(r, mx + nx, my + ny)) return [mx + nx, my + ny];
    if (inside(r, mx - nx, my - ny)) return [mx - nx, my - ny];
  }
  return [pts[0][0], pts[0][1]];
}

type Polygons = number[][][][];

/** The area inside `outer` but not `inner` (inner within outer, both traced
 *  on the same field) as polygons: their rings, each hole under the smallest
 *  outer ring around it. */
function between(
  outer: Polygons,
  inner: Polygons,
  width: number,
  height: number
) {
  const shells = [
    ...outer.map(p => p[0]),
    ...inner.flatMap(p => p.slice(1)),
  ].map(info);
  const holes = [
    ...outer.flatMap(p => p.slice(1)),
    ...inner.map(p => p[0]),
  ].map(info);
  // The shells by the grid squares they cross, to look up few for each hole.
  const N = 32,
    sw = width / N || 1,
    sh = height / N || 1;
  const square = (v: number, s: number) =>
    Math.max(0, Math.min(N - 1, Math.floor(v / s)));
  const index: number[][] = Array.from({ length: N * N }, () => []);
  shells.forEach((s, i) => {
    for (let y = square(s.y0, sh); y <= square(s.y1, sh); y++)
      for (let x = square(s.x0, sw); x <= square(s.x1, sw); x++)
        index[y * N + x].push(i);
  });
  // A ring traced the same in both cuts (a lake with no places, or an
  // island above both edges) bounds nothing between them: as a shell with
  // itself for a hole it would be an empty polygon, which MapLibre fills
  // wrongly across a whole tile. Such pairs go.
  const key = (r: RingInfo) =>
    `${r.ring.length}|${r.area.toFixed(4)}|${r.x0.toFixed(4)}|${r.y0.toFixed(4)}|${r.x1.toFixed(4)}|${r.y1.toFixed(4)}`;
  const same = new Map<string, number[]>();
  shells.forEach((s, i) => same.set(key(s), [...(same.get(key(s)) ?? []), i]));
  const gone = new Set<number>();
  const out: Ring[][] = shells.map(s => [s.ring]);
  for (const hole of holes) {
    if (hole.area === 0) continue;
    const twin = same.get(key(hole))?.find(i => !gone.has(i));
    if (twin !== undefined) {
      gone.add(twin);
      continue;
    }
    const [x, y] = within(hole);
    let best = -1;
    for (const i of index[square(y, sh) * N + square(x, sw)])
      if (
        (best < 0 || shells[i].area < shells[best].area) &&
        inside(shells[i], x, y)
      )
        best = i;
    if (best >= 0) out[best].push(hole.ring);
  }
  return out.filter((_, i) => !gone.has(i));
}

export type Shapes = FeatureCollection<
  MultiPolygon | MultiLineString,
  { fill?: string; opacity?: number; hatch?: boolean; edge?: boolean }
>;

/** One layer of a region as shapes: each band between its two cuts, and the
 *  line around every place the forecast covers, in longitude and latitude. */
export function shapes(
  region: RegionGrid,
  source: MapSource,
  bytes: Uint8Array,
  dark = false
): Shapes {
  const spec = bands(source, dark);
  const { bounds, width, height } = region;
  const values = smoothed(
    field(region, bytes, spec.value),
    width,
    height,
    spec.smooth
  );
  const perDegree = width / (bounds[2] - bounds[0]);
  const perRadian = (perDegree * 180) / Math.PI;
  const top = mercator(bounds[3]);
  const lonLat = ([x, y]: number[]) => [
    bounds[0] + x / perDegree,
    ((2 * Math.atan(Math.exp(top - y / perRadian)) - Math.PI / 2) * 180) /
      Math.PI,
  ];
  // Each cut: inside where the value reaches the edge, within the forecast
  // (outside it, half a band below anything); the first cut is the limit.
  const trace = contours().size([width, height]).smooth(true).thresholds([0]);
  const levels = [-Infinity, ...spec.edges];
  const cut = new Float64Array(width * height);
  const cuts: Polygons[] = levels.map(t => {
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      cut[i] = Number.isNaN(v)
        ? -spec.step
        : t === -Infinity
          ? spec.step
          : Math.min(v - t, spec.step);
    }
    return trace(cut)[0].coordinates;
  });
  // In longitude and latitude, once per ring (a ring bounds two bands), and
  // wound the way MapLibre reads it: outer rings counter-clockwise, holes
  // clockwise. A cut's hole is a band's outer ring (and the other way
  // round), so it is turned to match. The cuts are smooth already, from the
  // smoothed field; corner cutting on top made close nested rings cross.
  const converted = new Map<Ring, number[][]>();
  const oriented = (ring: Ring, outer: boolean) => {
    let out = converted.get(ring);
    if (!out) {
      out = ring.map(lonLat);
      converted.set(ring, out);
    }
    let twice = 0;
    for (let i = 0; i < out.length - 1; i++)
      twice += out[i][0] * out[i + 1][1] - out[i + 1][0] * out[i][1];
    return twice > 0 === outer ? out : [...out].reverse();
  };
  const wash = PALETTES[dark ? 'dark' : 'light'].wash;
  const features: Shapes['features'] = [];
  spec.fills.forEach((fill, k) => {
    if (fill === null) return;
    const polygons = between(cuts[k], cuts[k + 1] ?? [], width, height);
    if (!polygons.length) return;
    const look = fill === 'over' ? wash : fill;
    features.push({
      type: 'Feature',
      properties: {
        fill: `rgb(${look[0]},${look[1]},${look[2]})`,
        opacity: look[3] / 255,
        ...(fill === 'over' ? { hatch: true } : {}),
      },
      geometry: {
        type: 'MultiPolygon',
        coordinates: polygons.map(rings =>
          rings.map((ring, i) => oriented(ring, i === 0))
        ),
      },
    });
  });
  features.push({
    type: 'Feature',
    properties: { edge: true },
    geometry: {
      type: 'MultiLineString',
      coordinates: cuts[0].flat().map(ring => oriented(ring, true)),
    },
  });
  return { type: 'FeatureCollection', features };
}
