/**
 * The sun a garden's sections get, from what stands along the plot's sides
 * (Garden.sides): each kind is taken as a wall at the plot's edge, as long as
 * the side and as high as the kind (a fence or hedge 2 m, a house or wall
 * 6 m, tall trees 10 m, solid); in an L, a box filling the cut corner. For
 * each section's middle and each month (its 15th, a clear day), the hours the
 * sun stands at least 10° up and no side blocks it.
 *
 * Crops' needs are hours at midsummer (RHS: full sun is more than 6), so a
 * month's hours are compared as at midsummer: the spot's share of an open
 * spot's hours that month, times an open spot's hours in June. A winter
 * month, short of sun everywhere, so shows only the garden's own shade.
 * Months where an open spot gets under an hour (far north in winter) are
 * left out.
 */
import { L_CUT, type Garden, type Section, type Side } from '@/lib/planner';

type Box = Pick<Section, 'x0' | 'x1' | 'y0' | 'y1'>;
type Edge = keyof NonNullable<Garden['sides']>;

/** How high each kind stands, metres. */
export const HEIGHT: Record<Side, number> = { fence: 2, house: 6, trees: 10 };

/** A wall's face on the plot, metres in the plot's own frame (x across, y
 *  down, the top facing `north`). */
export interface Wall {
  side: Edge;
  kind: Side;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** A month's sun at a spot: its hours, the morning's of them (before solar
 *  noon), and whether it is in the sun at noon. */
export interface SunMonth {
  hours: number;
  am: number;
  noon: boolean;
}

export interface Light {
  /** A spot's sun each month, January first (by its middle; kept). */
  months: (s: Box) => SunMonth[];
  /** An open spot's hours each month. */
  open: number[];
}

export type SunLevel = 'full' | 'part' | 'little';
export type SunWhen =
  'allDay' | 'morning' | 'afternoon' | 'midday' | 'morningEvening' | 'none';

const DEG = Math.PI / 180;
/** The sun counts from this high above the horizon, degrees: lower, it
 *  gives little light (RHS: midday sun counts for much more). */
const LOW = 10;
/** Hours between two looks at the sun. */
const STEP = 1 / 6;
/** The 15th of each month, the day of the year (0 = 1 January). */
const MID = [14, 45, 73, 104, 134, 165, 195, 226, 257, 287, 318, 348];
const JUNE = 5;

/** The walls a garden's sides make: each side's edge (the L's right and
 *  bottom sides are as long as its wide and narrow parts), and the two faces
 *  of the L's cut corner. */
export function wallsOf(g: Garden): Wall[] {
  const { width: W, length: L } = g;
  const L_ = g.shape === 'L';
  const cx = W * L_CUT.width,
    cy = L * L_CUT.length;
  const edges: [Edge, number, number, number, number][] = [
    ['top', 0, 0, W, 0],
    ['bottom', 0, L, L_ ? cx : W, L],
    ['left', 0, 0, 0, L],
    ['right', W, 0, W, L_ ? cy : L],
    ...(L_
      ? ([
          ['corner', cx, cy, W, cy],
          ['corner', cx, cy, cx, L],
        ] as [Edge, number, number, number, number][])
      : []),
  ];
  return edges.flatMap(([side, x0, y0, x1, y1]) => {
    const kind = g.sides?.[side];
    return kind ? [{ side, kind, x0, y0, x1, y1 }] : [];
  });
}

/** The sun's height and compass bearing (radians, clockwise from north) at
 *  latitude `lat`, on day `day` of the year, `hour` hours of solar time. */
export function sunPosition(lat: number, day: number, hour: number) {
  const decl = 23.44 * DEG * Math.sin((2 * Math.PI * (284 + day + 1)) / 365);
  const ha = (hour - 12) * 15 * DEG,
    phi = lat * DEG;
  const height = Math.asin(
    Math.sin(phi) * Math.sin(decl) +
      Math.cos(phi) * Math.cos(decl) * Math.cos(ha)
  );
  const bearing = Math.atan2(
    -Math.sin(ha) * Math.cos(decl),
    Math.cos(phi) * Math.sin(decl) -
      Math.sin(phi) * Math.cos(decl) * Math.cos(ha)
  );
  return { height, bearing };
}

interface Look {
  hour: number;
  /** The way to the sun on the plot, and how steeply it stands. */
  dx: number;
  dy: number;
  tan: number;
}

/** Whether `w` stands between the spot (px, py) and the sun: the ray to it
 *  crosses the wall's face lower than the wall's top. */
function blocks(w: Wall, px: number, py: number, k: Look) {
  const ex = w.x1 - w.x0,
    ey = w.y1 - w.y0;
  const den = k.dx * ey - k.dy * ex;
  if (Math.abs(den) < 1e-12) return false;
  const qx = w.x0 - px,
    qy = w.y0 - py;
  const t = (qx * ey - qy * ex) / den;
  const u = (qx * k.dy - qy * k.dx) / den;
  return t > 1e-9 && u >= 0 && u <= 1 && t * k.tan < HEIGHT[w.kind];
}

/** The garden's sun, or null when nothing stands along its sides. */
export function sunlight(g: Garden, lat: number): Light | null {
  const walls = wallsOf(g);
  if (!walls.length) return null;
  const north = (g.north ?? 0) * DEG;
  const looks = MID.map(day => {
    const out: Look[] = [];
    for (let hour = STEP / 2; hour < 24; hour += STEP) {
      const { height, bearing } = sunPosition(lat, day, hour);
      if (height < LOW * DEG) continue;
      out.push({
        hour,
        dx: Math.sin(bearing - north),
        dy: -Math.cos(bearing - north),
        tan: Math.tan(height),
      });
    }
    return out;
  });
  const kept = new Map<string, SunMonth[]>();
  return {
    open: looks.map(l => l.length * STEP),
    months: s => {
      const key = `${s.x0}|${s.y0}|${s.x1}|${s.y1}`;
      let got = kept.get(key);
      if (!got) {
        const px = (s.x0 + s.x1) / 2,
          py = (s.y0 + s.y1) / 2;
        got = looks.map(month => {
          let hours = 0,
            am = 0,
            noon = false;
          for (const k of month) {
            if (walls.some(w => blocks(w, px, py, k))) continue;
            hours += STEP;
            if (k.hour < 12) am += STEP;
            if (Math.abs(k.hour - 12) < STEP) noon = true;
          }
          return { hours, am, noon };
        });
        kept.set(key, got);
      }
      return got;
    },
  };
}

/** A month's hours as at midsummer (see above); null in a month an open
 *  spot gets under an hour. */
export function asMidsummer(light: Light, hours: number, month: number) {
  const open = light.open[month];
  return open < 1 ? null : (hours / open) * light.open[JUNE];
}

/** How much sun a spot gets in `month`, for the drawing: full (6 hours or
 *  more as at midsummer), part (3 or more) or little; undefined in a month
 *  left out. */
export function level(light: Light, s: Box, month: number) {
  const h = asMidsummer(light, light.months(s)[month].hours, month);
  if (h === null) return undefined;
  return (h >= 6 ? 'full' : h >= 3 ? 'part' : 'little') as SunLevel;
}

/** A spot's hours as at midsummer over the three months from `day`'s (those
 *  a crop going in then grows through), their mean; null when every one is
 *  left out. */
export function season(light: Light, s: Box, day: string) {
  const first = Number(day.slice(5, 7)) - 1;
  const each = [0, 1, 2].flatMap(k => {
    const m = (first + k) % 12;
    const h = asMidsummer(light, light.months(s)[m].hours, m);
    return h === null ? [] : [h];
  });
  return each.length ? each.reduce((a, b) => a + b, 0) / each.length : null;
}

/** When in the day a spot has its sun, in words a gardener uses. */
export function when(light: Light, m: SunMonth, month: number): SunWhen {
  if (m.hours < 0.5) return 'none';
  if (m.hours >= 0.75 * light.open[month]) return 'allDay';
  const pm = m.hours - m.am;
  if (m.am >= 2 * pm) return 'morning';
  if (pm >= 2 * m.am) return 'afternoon';
  return m.noon ? 'midday' : 'morningEvening';
}
