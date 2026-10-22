/**
 * The garden planner: a plot of a chosen size and shape, laid out in beds
 * (raised, dug in the ground, or strips of an open plot) and paths, each bed
 * in sections that hold one crop. The plan is filled from what goes in at the
 * visitor's place this week, checked for neighbours, and kept on the device.
 * Distances in metres; x runs across the plot, y down it, and the plot's top
 * faces the bearing `north` (0, as before: north).
 */
import { CROPS, type CropStatus } from '@/lib/huerta';
import { PLANT_LOOK } from '@/lib/planner-data';

export const BED_WIDTH = 1.2;
export const PATH = 0.4;
export const BORDER = 0.35;
export const BED_HEIGHT = 0.22;
export const MIN_SIDE = 1;
export const MAX_SIDE = 60;
const ROW_STRIP = 1.5;
/** An open plot's strips are cut into blocks of about this length, metres. */
const ROW_BLOCK = 3;
const FOOTPATH = 0.3;
const SHORTEST = 0.3;

export type Rect = [number, number, number, number];
export type Ground = 'raised' | 'ground' | 'rows';
export type Axis = 'x' | 'y';
/** What "Plan it for me" grows: a mixed garden (vegetables, herbs and some
 *  flowers), vegetables only, vegetables with flowers at each bed's sunny
 *  end, fruit first, or herbs and flowers. */
export type PlanStyle =
  | 'mixed'
  | 'veg'
  | 'vegFlowers'
  | 'fruit'
  | 'herbsFlowers';

export interface Garden {
  width: number;
  length: number;
  shape: 'rect' | 'L';
  /** The compass bearing the plot's top edge faces, 0-315 by 45. */
  north?: number;
  /** Beds run across the plot (along its width) instead of along it. */
  across?: boolean;
  /** Raised beds (the default), beds dug in the ground, or an open plot in rows. */
  ground?: Ground;
  /** What "Plan it for me" grows; mixed by default. */
  style?: PlanStyle;
}

export interface Section {
  bed: number;
  /** Its place in the bed, north to south, of `parts`. */
  part: number;
  parts: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  crop: string | null;
  /** The day it went in, YYYY-MM-DD; absent while only planned. */
  planted?: string;
}

export interface Plan {
  garden: Garden;
  sections: Section[];
  /** Beds deleted: plain earth, which a bed can be put back on. */
  bare?: Rect[];
}

const CROP = Object.fromEntries(CROPS.map(crop => [crop.id, crop]));

/** The edge around the beds: 35 cm, less on a small plot. */
export const border = (g: Garden) =>
  Math.min(BORDER, 0.1 * Math.min(g.width, g.length));

/** The axis a bed runs along: down the plot, unless beds run across it or
 *  the plot is in rows (whose strips run across), but not both. */
export const axisOf = (g: Garden): Axis =>
  (g.ground === 'rows') !== Boolean(g.across) ? 'x' : 'y';

/** The plot's rectangles: one, or two for the L (its bottom-right corner cut away). */
export function regions(g: Garden): Rect[] {
  const b = border(g);
  const all: Rect[] =
    g.shape === 'L'
      ? [
          [0, 0, g.width, g.length * 0.5],
          [0, g.length * 0.5, g.width * 0.55, g.length],
        ]
      : [[0, 0, g.width, g.length]];
  return all.filter(
    ([x0, y0, x1, y1]) => x1 - x0 - 2 * b >= 0.5 && y1 - y0 - 2 * b >= 0.5
  );
}

const flip = (s: Section): Section => ({
  ...s,
  x0: s.y0,
  x1: s.y1,
  y0: s.x0,
  y1: s.x1,
});

/** Beds in one region, running down it side by side: 1.2 m wide with 40 cm
 *  paths, in sections of about 1.8 m; in rows, strips of 1.5 m with 30 cm
 *  footpaths, in blocks of about 3 m, one crop each. */
function bedsIn(
  [x0, y0, x1, y1]: Rect,
  b: number,
  rows: boolean,
  first: number
): Section[] {
  const out: Section[] = [];
  const room = x1 - x0 - 2 * b;
  const width = Math.min(rows ? ROW_STRIP : BED_WIDTH, room);
  const path = rows ? FOOTPATH : PATH;
  const n = Math.max(1, Math.floor((room + path) / (width + path)));
  const used = n * width + (n - 1) * path;
  const ya = y0 + b,
    yb = y1 - b;
  const k = Math.max(1, Math.round((yb - ya) / (rows ? ROW_BLOCK : 1.8)));
  let x = x0 + (x1 - x0 - used) / 2;
  for (let i = 0; i < n; i++, x += width + path)
    for (let j = 0; j < k; j++)
      out.push({
        bed: first + i,
        part: j,
        parts: k,
        x0: x,
        x1: x + width,
        y0: ya + ((yb - ya) * j) / k,
        y1: ya + ((yb - ya) * (j + 1)) / k,
        crop: null,
      });
  return out;
}

/** The plot in beds: a region whose beds run across is laid out turned a
 *  quarter (x and y swapped) and turned back. */
export function layout(g: Garden): Section[] {
  const b = border(g),
    rows = g.ground === 'rows',
    turned = axisOf(g) === 'x';
  let bed = 0;
  return regions(g).flatMap(r => {
    const out = bedsIn(turned ? [r[1], r[0], r[3], r[2]] : r, b, rows, bed);
    bed += new Set(out.map(s => s.bed)).size;
    return turned ? out.map(flip) : out;
  });
}

/** How far north a spot lies, metres along true north, for a plot whose top
 *  faces the bearing `north`. */
export function northness(g: Pick<Garden, 'north'>, x: number, y: number) {
  const r = ((g.north ?? 0) * Math.PI) / 180;
  return -(x * Math.sin(r) + y * Math.cos(r));
}
const northOf = (north: number, s: Section) =>
  northness({ north }, (s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2);

/** Two sections touch across a bed's length or a path (or the L's gap). */
export function adjacent(a: Section, b: Section) {
  const xo = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const yo = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  const xg = Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1);
  const yg = Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1);
  return (
    a !== b &&
    ((xo > 0.01 && yg <= 2 * BORDER + 0.01) || (yo > 0.01 && xg <= PATH + 0.01))
  );
}

// ---------- planning it ----------

const GROUPS = {
  legumes: ['broad_beans', 'peas', 'green_beans', 'field_beans'],
  brassicas: [
    'cabbage',
    'kale',
    'broccoli',
    'cauliflower',
    'brussels_sprouts',
    'kohlrabi',
    'turnip',
    'radish',
    'rocket',
  ],
  leaves: [
    'lettuce',
    'spinach',
    'lambs_lettuce',
    'chard',
    'beetroot',
    'carrot',
    'parsnip',
    'chicory',
    'parsley',
    'coriander',
    'celery',
  ],
  alliums: ['garlic', 'onion_sets', 'onion', 'leek'],
  fruiting: [
    'tomato',
    'courgette',
    'pepper',
    'aubergine',
    'cucumber',
    'chilli',
    'pumpkin',
    'sweetcorn',
    'melon',
    'winter_squash',
    'watermelon',
    'potato',
  ],
  flowers: [
    'calendula',
    'marigold',
    'cosmos',
    'zinnia',
    'nasturtium',
    'sunflower',
    'sweet_pea',
    'tulip',
    'daffodil',
    'lavender',
  ],
  herbs: [
    'basil',
    'parsley',
    'coriander',
    'dill',
    'chervil',
    'chives',
    'thyme',
    'rosemary',
    'oregano',
    'sage',
    'mint',
  ],
  fruit: ['strawberry', 'melon', 'watermelon'],
} as const;
type Group = keyof typeof GROUPS;

const ORDER: Record<number, Group[]> = {
  1: ['leaves'],
  2: ['brassicas', 'leaves'],
  3: ['legumes', 'brassicas', 'alliums'],
  4: ['legumes', 'brassicas', 'leaves', 'alliums'],
};
const CYCLE: Group[] = [
  'legumes',
  'brassicas',
  'flowers',
  'leaves',
  'alliums',
  'fruiting',
];
const VEG_CYCLE: Group[] = [
  'legumes',
  'brassicas',
  'leaves',
  'alliums',
  'fruiting',
];
const isVeg = (id: string) => CROP[id]?.kind === 'vegetable';
const FRUIT_FIRST = new Set(
  'strawberry melon watermelon tomato pepper chilli aubergine courgette cucumber pumpkin winter_squash'.split(
    ' '
  )
);
/** Low flowers that do their neighbours good, for a bed's sunny end, in a
 *  strip 40 cm deep. */
const COMPANIONS = ['calendula', 'marigold', 'nasturtium'];
const FLOWER_STRIP = 0.4;

/** Each style's beds: the families in turn (by number of beds for the first
 *  few), the families to fall back on, and which crops it allows. */
const STYLES: Record<
  PlanStyle,
  {
    order?: Record<number, Group[]>;
    cycle: Group[];
    fallback: Group[];
    allow: (id: string) => boolean;
  }
> = {
  mixed: {
    order: ORDER,
    cycle: CYCLE,
    fallback: ['leaves', 'brassicas', 'flowers', 'fruiting'],
    allow: () => true,
  },
  veg: {
    order: ORDER,
    cycle: VEG_CYCLE,
    fallback: ['leaves', 'brassicas', 'fruiting'],
    allow: isVeg,
  },
  vegFlowers: {
    order: ORDER,
    cycle: VEG_CYCLE,
    fallback: ['leaves', 'brassicas', 'fruiting'],
    allow: isVeg,
  },
  fruit: {
    cycle: ['fruiting', 'fruit'],
    fallback: ['fruit', 'fruiting'],
    allow: id => FRUIT_FIRST.has(id),
  },
  herbsFlowers: {
    cycle: ['herbs', 'flowers'],
    fallback: ['herbs', 'flowers'],
    allow: () => true,
  },
};

/** The order of bed groups in which onions and garlic never sit beside peas
 *  and beans: Heap's permutations, up to 7 beds. */
function arrange(sections: Section[], beds: number[], groups: Group[]) {
  if (beds.length > 7) return groups;
  const near = beds.map(a =>
    beds.map(
      b =>
        a !== b &&
        sections.some(
          s => s.bed === a && sections.some(t => t.bed === b && adjacent(s, t))
        )
    )
  );
  const pair = (x: Group, y: Group) =>
    (x === 'legumes' && y === 'alliums') ||
    (x === 'alliums' && y === 'legumes');
  const clash = (order: Group[]) =>
    order.some((x, i) => order.some((y, j) => near[i][j] && pair(x, y)));
  const a = [...groups];
  if (!clash(a)) return a;
  const c = new Array<number>(a.length).fill(0);
  for (let i = 0; i < a.length; ) {
    if (c[i] < i) {
      const j = i % 2 ? c[i] : 0;
      [a[j], a[i]] = [a[i], a[j]];
      if (!clash(a)) return [...a];
      c[i]++;
      i = 0;
    } else {
      c[i] = 0;
      i++;
    }
  }
  return groups;
}

/** Fill every section with crops that go in this week at the visitor's
 *  place (a bed with none stays empty): one
 *  family per bed (of those the style grows), onions and garlic never beside
 *  peas and beans, the tallest crop of a bed at its north end. Planted
 *  sections keep their crop, and with `keepChosen` every section that has one;
 *  with `only`, just those sections (by index) are planned. */
export function autoPlan(
  sections: Section[],
  status: (crop: string) => CropStatus | undefined,
  {
    north = 0,
    keepChosen = false,
    only,
    style = 'mixed',
    axis = 'y',
  }: {
    north?: number;
    keepChosen?: boolean;
    only?: number[];
    style?: PlanStyle;
    axis?: Axis;
  } = {}
): Section[] {
  // Only what goes in this week: a crop that must wait, or whose time is
  // over, is never planned.
  const how = STYLES[style];
  const now = (id: string) => how.allow(id) && status(id) === 'now';
  let out = sections.map(s => ({ ...s }));
  const open = new Set(only ? only.map(i => out[i]) : out);
  const beds = [...new Set(out.map(s => s.bed))];
  const groups = arrange(
    out,
    beds,
    how.order?.[beds.length] ??
      beds.map((_, i) => how.cycle[i % how.cycle.length])
  );
  const used = new Set<string>();
  beds.forEach((bed, i) => {
    // The bed's family, else the first of the style's with a crop going in
    // now; with none, the bed is left empty.
    const group = [groups[i], ...how.fallback, ...how.cycle].find(k =>
      GROUPS[k].some(now)
    );
    const pick = group
      ? GROUPS[group]
          .filter(now)
          .sort((a, z) => Number(used.has(a)) - Number(used.has(z)))
      : [];
    const parts = out
      .filter(
        s =>
          s.bed === bed && open.has(s) && !s.planted && !(keepChosen && s.crop)
      )
      .sort((a, z) => northOf(north, z) - northOf(north, a));
    // Vegetables with flowers: a strip of a low companion flower across the
    // bed's sunny end, cut from its last section (unless that is a strip).
    const flower = COMPANIONS.find(id => status(id) === 'now');
    if (style === 'vegFlowers' && parts.length && flower) {
      const last = parts[parts.length - 1];
      const [lo, hi] = span(last, axis);
      if (hi - lo < 2 * FLOWER_STRIP + 0.3) parts.pop()!.crop = flower;
      else {
        const atLo = along(last, axis, lo, lo + FLOWER_STRIP),
          atHi = along(last, axis, hi - FLOWER_STRIP, hi);
        const loSouth = northOf(north, atLo) < northOf(north, atHi);
        const rest = loSouth
          ? along(last, axis, lo + FLOWER_STRIP, hi)
          : along(last, axis, lo, hi - FLOWER_STRIP);
        out[out.indexOf(last)] = rest;
        parts[parts.length - 1] = rest;
        out.push({ ...(loSouth ? atLo : atHi), crop: flower });
      }
    }
    if (!pick.length) {
      parts.forEach(s => (s.crop = null)); // nothing goes in now
      return;
    }
    const crops = parts
      .map((_, j) => pick[j % pick.length])
      .sort((a, z) => PLANT_LOOK[z].height - PLANT_LOOK[a].height);
    parts.forEach((s, j) => {
      s.crop = crops[j];
      used.add(crops[j]);
    });
  });
  if (style === 'vegFlowers')
    for (const bed of beds) out = renumber(out, bed, axis);
  return out;
}

// ---------- editing ----------

const span = (s: Section, a: Axis) =>
  a === 'y' ? ([s.y0, s.y1] as const) : ([s.x0, s.x1] as const);
const along = (s: Section, a: Axis, lo: number, hi: number): Section =>
  a === 'y' ? { ...s, y0: lo, y1: hi } : { ...s, x0: lo, x1: hi };

/** A bed's sections numbered in order along it. */
function renumber(out: Section[], bed: number, a: Axis): Section[] {
  const order = out
    .filter(t => t.bed === bed)
    .sort((p, q) => span(p, a)[0] - span(q, a)[0]);
  return out.map(t =>
    t.bed === bed ? { ...t, part: order.indexOf(t), parts: order.length } : t
  );
}

/** A section cut in two along its bed, both halves with its crop. */
export function split(
  sections: Section[],
  index: number,
  a: Axis = 'y'
): Section[] {
  const s = sections[index];
  const [lo, hi] = span(s, a);
  const mid = (lo + hi) / 2;
  const out = [
    ...sections.slice(0, index),
    along(s, a, lo, mid),
    along(s, a, mid, hi),
    ...sections.slice(index + 1),
  ];
  return renumber(out, s.bed, a);
}

/** A section joined with the one before (-1) or after (1) it in its bed,
 *  keeping its own crop, planting and lock. */
export function merge(
  sections: Section[],
  index: number,
  dir: -1 | 1,
  a: Axis = 'y'
): Section[] {
  const s = sections[index];
  const other = sections.find(t => t.bed === s.bed && t.part === s.part + dir);
  if (!other) return sections;
  const [lo, hi] = span(s, a),
    [olo, ohi] = span(other, a);
  const joined = along(s, a, Math.min(lo, olo), Math.max(hi, ohi));
  return renumber(
    sections.filter(t => t !== other).map(t => (t === s ? joined : t)),
    s.bed,
    a
  );
}

/** A section made longer (or shorter) by `delta`, the space taken from (or
 *  given to) the next section in its bed, or the one before at the bed's end;
 *  neither shorter than 30 cm. */
export function lengthen(
  sections: Section[],
  index: number,
  delta: number,
  a: Axis = 'y'
): Section[] {
  const s = sections[index];
  const next = sections.find(t => t.bed === s.bed && t.part === s.part + 1);
  const other =
    next ?? sections.find(t => t.bed === s.bed && t.part === s.part - 1);
  if (!other) return sections;
  const [lo, hi] = span(s, a),
    [olo, ohi] = span(other, a);
  const d = Math.max(
    -(hi - lo - SHORTEST),
    Math.min(delta, ohi - olo - SHORTEST)
  );
  return sections.map(t =>
    t === s
      ? next
        ? along(s, a, lo, hi + d)
        : along(s, a, lo - d, hi)
      : t === other
        ? next
          ? along(t, a, olo + d, ohi)
          : along(t, a, olo, ohi - d)
        : t
  );
}

/** Beds numbered 0, 1, ... in their earlier order. */
function numberBeds(sections: Section[]): Section[] {
  const ids = [...new Set(sections.map(s => s.bed))].sort((p, q) => p - q);
  return sections.map(s => ({ ...s, bed: ids.indexOf(s.bed) }));
}

const rectOf = (s: Section): Rect => [s.x0, s.y0, s.x1, s.y1];
const area = (r: Rect) => (r[2] - r[0]) * (r[3] - r[1]);
const overlap = (p: Rect, q: Rect) =>
  Math.max(0, Math.min(p[2], q[2]) - Math.max(p[0], q[0])) *
  Math.max(0, Math.min(p[3], q[3]) - Math.max(p[1], q[1]));

/** A bed deleted: its sections leave the plan, its ground stays plain earth. */
export function removeBed(plan: Plan, bed: number): Plan {
  const parts = plan.sections.filter(s => s.bed === bed);
  if (!parts.length) return plan;
  const box: Rect = [
    Math.min(...parts.map(s => s.x0)),
    Math.min(...parts.map(s => s.y0)),
    Math.max(...parts.map(s => s.x1)),
    Math.max(...parts.map(s => s.y1)),
  ];
  return {
    ...plan,
    sections: numberBeds(plan.sections.filter(s => s.bed !== bed)),
    bare: [...(plan.bare ?? []), box],
  };
}

/** A bed put back on a patch of plain earth, in sections of about 1.8 m. */
export function restoreBed(plan: Plan, i: number): Plan {
  const r = plan.bare?.[i];
  if (!r) return plan;
  const a = axisOf(plan.garden);
  const [lo, hi] = a === 'y' ? [r[1], r[3]] : [r[0], r[2]];
  const k = Math.max(
    1,
    Math.round((hi - lo) / (plan.garden.ground === 'rows' ? ROW_BLOCK : 1.8))
  );
  const bed = plan.sections.reduce((m, s) => Math.max(m, s.bed), -1) + 1;
  const base: Section = {
    bed,
    part: 0,
    parts: k,
    x0: r[0],
    y0: r[1],
    x1: r[2],
    y1: r[3],
    crop: null,
  };
  const parts = Array.from({ length: k }, (_, j) =>
    along(
      { ...base, part: j },
      a,
      lo + ((hi - lo) * j) / k,
      lo + ((hi - lo) * (j + 1)) / k
    )
  );
  return {
    ...plan,
    sections: [...plan.sections, ...parts],
    bare: plan.bare!.filter((_, j) => j !== i),
  };
}

/** The plan on a new size, shape, north, bed direction or way of growing:
 *  each new section keeps the crop and planting of the old one it
 *  mostly lies on, deleted beds stay deleted, and the rest is planned. */
export function reshape(
  plan: Plan,
  garden: Garden,
  status: (crop: string) => CropStatus | undefined
): Plan {
  const plot = regions(garden);
  const bare = (plan.bare ?? []).filter(r =>
    plot.some(q => overlap(r, q) >= area(r) / 2)
  );
  const fresh = layout(garden).filter(
    s => !bare.some(r => overlap(rectOf(s), r) >= area(rectOf(s)) / 2)
  );
  const kept = fresh.map(s => {
    let best: Section | undefined,
      most = 0;
    for (const o of plan.sections) {
      const v = overlap(rectOf(s), rectOf(o));
      if (v > most) [best, most] = [o, v];
    }
    return best && most >= area(rectOf(s)) / 2
      ? { ...s, crop: best.crop, planted: best.planted }
      : s;
  });
  return {
    garden,
    sections: autoPlan(numberBeds(kept), status, {
      north: garden.north,
      keepChosen: true,
      style: garden.style,
      axis: axisOf(garden),
    }),
    bare,
  };
}

// ---------- neighbours ----------

const set = (ids: string) => new Set(ids.split(' '));
const ALLIUM = set('garlic onion_sets onion leek chives');
const LEGUME = set('broad_beans peas green_beans field_beans');
const BLIGHT = set('tomato aubergine pepper chilli');
const BRASSICA = set(
  'kale cabbage cauliflower broccoli brussels_sprouts kohlrabi turnip radish rocket'
);
const FRUITING = set(
  'tomato pepper chilli aubergine courgette cucumber pumpkin winter_squash melon watermelon strawberry green_beans broad_beans'
);
const FLOWERS = set(
  'calendula marigold cosmos phacelia nasturtium zinnia sunflower'
);
const VEG = new Set(
  CROPS.filter(
    c => (c.kind === 'vegetable' || c.kind === 'fruit') && c.id !== 'fennel'
  ).map(c => c.id)
);

/** What a pairing rests on: shown with each note, so it can be weighed. */
export type Basis =
  | 'tradition'
  | 'disease'
  | 'someTrials'
  | 'trials'
  | 'system'
  | 'sun';

const RULES: {
  bad: boolean;
  a: Set<string>;
  b: Set<string>;
  key: string;
  basis: Basis;
}[] = [
  { bad: true, a: ALLIUM, b: LEGUME, key: 'alliumLegume', basis: 'tradition' },
  { bad: true, a: set('potato'), b: BLIGHT, key: 'blight', basis: 'disease' },
  { bad: true, a: set('fennel'), b: VEG, key: 'fennel', basis: 'tradition' },
  {
    bad: false,
    a: set('carrot parsnip'),
    b: ALLIUM,
    key: 'carrotFly',
    basis: 'someTrials',
  },
  { bad: false, a: FLOWERS, b: FRUITING, key: 'flowers', basis: 'trials' },
  {
    bad: false,
    a: set('nasturtium'),
    b: new Set([...BRASSICA, ...LEGUME]),
    key: 'nasturtium',
    basis: 'someTrials',
  },
  {
    bad: false,
    a: set('sweetcorn'),
    b: set('green_beans pumpkin winter_squash'),
    key: 'threeSisters',
    basis: 'system',
  },
  {
    bad: false,
    a: set('basil'),
    b: set('tomato pepper'),
    key: 'basil',
    basis: 'tradition',
  },
];

export interface Note {
  bad: boolean;
  /** The neighbour's crop. */
  with: string;
  key: string;
  basis: Basis;
  /** For the shade note: the tall crop and the one it shades. */
  tall?: string;
  short?: string;
}

/** What to watch next to one section: good pairs, pairs to keep apart, and a
 *  tall crop south of a low one in the same bed (by true north). */
export function notes(sections: Section[], index: number, north = 0): Note[] {
  const s = sections[index];
  const out: Note[] = [];
  const seen = new Set<string>();
  const add = (n: Note) => {
    const k = n.with + n.key;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(n);
    }
  };
  if (!s.crop) return out;
  for (const t of sections) {
    if (!t.crop || !adjacent(s, t)) continue;
    for (const r of RULES)
      if (
        (r.a.has(s.crop) && r.b.has(t.crop)) ||
        (r.b.has(s.crop) && r.a.has(t.crop))
      )
        add({ bad: r.bad, with: t.crop, key: r.key, basis: r.basis });
    if (s.bed === t.bed && s.crop !== t.crop) {
      const [n, so] = northOf(north, s) > northOf(north, t) ? [s, t] : [t, s];
      if (PLANT_LOOK[so.crop!].height >= 1 && PLANT_LOOK[n.crop!].height < 0.6)
        add({
          bad: true,
          with: t.crop,
          key: 'shade',
          basis: 'sun',
          tall: so.crop!,
          short: n.crop!,
        });
    }
  }
  return out;
}

/** Good pairs and notes to fix over the whole garden, each pair once. */
export function summary(sections: Section[], north = 0) {
  let good = 0;
  const bad: Note[] = [];
  const seen = new Set<string>();
  sections.forEach((s, i) =>
    notes(sections, i, north).forEach(n => {
      const k = [s.crop, n.with].sort().join() + n.key;
      if (seen.has(k)) return;
      seen.add(k);
      if (n.bad) bad.push(n);
      else good++;
    })
  );
  return { good, bad };
}

// ---------- what fits ----------

export interface Fit {
  count: number;
  /** In the row and between rows, metres. */
  spacing: number;
  across: number;
  points: [number, number][];
}

/** The plants a section holds at the crop's spacing: in the row at its own
 *  spacing, rows at least that far apart (half the field row gap in a bed,
 *  the whole gap in an `open` plot). Null for a scattered green manure. */
export function fit(s: Section, open = false): Fit | null {
  const crop = s.crop ? CROP[s.crop] : null;
  if (!crop || crop.spacing === null) return null;
  const sp = crop.spacing / 100;
  const across = Math.max(sp, (crop.rows ?? crop.spacing) / (open ? 100 : 200));
  const w = s.x1 - s.x0,
    l = s.y1 - s.y0;
  const rows = Math.max(1, Math.floor(w / across + 1e-6));
  const perRow = Math.max(1, Math.floor(l / sp + 1e-6));
  const ox = s.x0 + (w - (rows - 1) * across) / 2;
  const oy = s.y0 + (l - (perRow - 1) * sp) / 2;
  const points: [number, number][] = [];
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < perRow; j++)
      points.push([ox + i * across, oy + j * sp]);
  return { count: rows * perRow, spacing: sp, across, points };
}

/** What a crop is counted in. */
export const UNIT: Record<string, string> = {
  garlic: 'cloves',
  onion_sets: 'sets',
  potato: 'seedPotatoes',
  tulip: 'bulbs',
  daffodil: 'bulbs',
  crocus: 'corms',
  asparagus: 'crowns',
  rhubarb: 'crowns',
};

/** When it is ready, from today: a month, or "next spring or early summer"
 *  for a long crop going in in autumn (it waits out the winter). */
export function ready(
  status: CropStatus | undefined,
  days: number | null,
  today: Date
): { key: 'readyNextSpring' } | { key: 'readyAround'; month: number } | null {
  if (days === null) return null;
  if (status === 'now' && today.getMonth() >= 8 && days >= 60)
    return { key: 'readyNextSpring' };
  return {
    key: 'readyAround',
    month: new Date(today.getTime() + days * 864e5).getMonth(),
  };
}

/** What should follow a crop in its bed next year: rotate the families. */
export function nextYear(id: string) {
  const crop = CROP[id];
  if (crop.note && crop.note !== 'spring_flowers') return 'stays';
  if (crop.kind === 'cover') return 'cover';
  if (crop.kind === 'flower') return 'any';
  const next: Partial<Record<string, string>> = {
    legume: 'cabbage',
    brassica: 'roots',
    umbellifer: 'alliums',
    beet: 'alliums',
    daisy: 'alliums',
    allium: 'legumes',
    nightshade: 'legumes',
    cucurbit: 'legumes',
    grass: 'legumes',
  };
  return next[PLANT_LOOK[id].family] ?? 'other';
}

// ---------- kept on the device ----------

const STORE = 'huerta-plan';

export function loadPlan(): Plan | null {
  try {
    const plan = JSON.parse(
      localStorage.getItem(STORE) ?? 'null'
    ) as Plan | null;
    return plan?.sections?.length &&
      plan.sections.every(s => !s.crop || s.crop in CROP)
      ? plan
      : null;
  } catch {
    return null;
  }
}

export function savePlan(plan: Plan) {
  try {
    localStorage.setItem(STORE, JSON.stringify(plan));
  } catch {
    // Private mode or blocked storage: the plan lasts this visit only.
  }
}
