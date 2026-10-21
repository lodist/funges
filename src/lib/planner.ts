/**
 * The garden planner: a plot of a chosen size and shape, laid out in raised
 * beds and paths, each bed in sections that hold one crop. The plan is filled
 * from what goes in at the visitor's place this week, checked for neighbours,
 * and kept on the device. Distances in metres; y runs north to south.
 */
import { CROPS, type CropStatus } from '@/lib/huerta';
import { PLANT_LOOK } from '@/lib/planner-data';

export const BED_WIDTH = 1.2;
export const PATH = 0.4;
export const BORDER = 0.35;
export const BED_HEIGHT = 0.22;

export interface Garden {
  width: number;
  length: number;
  shape: 'rect' | 'L';
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
}

const CROP = Object.fromEntries(CROPS.map(crop => [crop.id, crop]));

/** The plot's rectangles: one, or two for the L (its south-east corner cut away). */
export function regions(g: Garden): [number, number, number, number][] {
  const all: [number, number, number, number][] =
    g.shape === 'L'
      ? [
          [0, 0, g.width, g.length * 0.5],
          [0, g.length * 0.5, g.width * 0.55, g.length],
        ]
      : [[0, 0, g.width, g.length]];
  return all.filter(
    ([x0, y0, x1, y1]) =>
      x1 - x0 - 2 * BORDER >= 0.8 && y1 - y0 - 2 * BORDER >= 0.5
  );
}

/** Beds running north to south, side by side, each in sections of about 1.8 m. */
export function layout(g: Garden): Section[] {
  const out: Section[] = [];
  let bed = 0;
  for (const [x0, y0, x1, y1] of regions(g)) {
    const width = Math.min(BED_WIDTH, x1 - x0 - 2 * BORDER);
    const n = Math.max(
      1,
      Math.floor((x1 - x0 - 2 * BORDER + PATH) / (width + PATH))
    );
    const used = n * width + (n - 1) * PATH;
    const ya = y0 + BORDER,
      yb = y1 - BORDER;
    const k = Math.max(1, Math.round((yb - ya) / 1.8));
    let x = x0 + (x1 - x0 - used) / 2;
    for (let i = 0; i < n; i++, x += width + PATH, bed++)
      for (let j = 0; j < k; j++)
        out.push({
          bed,
          part: j,
          parts: k,
          x0: x,
          x1: x + width,
          y0: ya + ((yb - ya) * j) / k,
          y1: ya + ((yb - ya) * (j + 1)) / k,
          crop: null,
        });
  }
  return out;
}

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
const WAITING = new Set<CropStatus>([
  'wait_frost',
  'wait_soil',
  'wait_warm',
  'too_warm',
  'wait_autumn',
  'wait_spring',
]);

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

/** Fill every section from this week's statuses at the visitor's place: one
 *  family per bed, onions and garlic never beside peas and beans, the tallest
 *  crop of a bed at its north end. Planted sections keep their crop. */
export function autoPlan(
  sections: Section[],
  status: (crop: string) => CropStatus | undefined
): Section[] {
  const rank = (id: string) => {
    const s = status(id);
    return s === 'now' ? 0 : s && WAITING.has(s) ? 1 : 2;
  };
  const out = sections.map(s => ({ ...s }));
  const beds = [...new Set(out.map(s => s.bed))];
  const groups = arrange(
    out,
    beds,
    ORDER[beds.length] ?? beds.map((_, i) => CYCLE[i % CYCLE.length])
  );
  const used = new Set<string>();
  beds.forEach((bed, i) => {
    let group = groups[i];
    if (!GROUPS[group].some(id => rank(id) < 2))
      group =
        (['leaves', 'brassicas', 'flowers', 'fruiting'] as Group[]).find(k =>
          GROUPS[k].some(id => rank(id) === 0)
        ) ?? group;
    const pick = [...GROUPS[group]].sort(
      (a, z) => rank(a) - rank(z) || Number(used.has(a)) - Number(used.has(z))
    );
    const parts = out
      .filter(s => s.bed === bed && !s.planted)
      .sort((a, z) => a.y0 - z.y0);
    const crops = parts
      .map((_, j) => pick[j % pick.length])
      .sort((a, z) => PLANT_LOOK[z].height - PLANT_LOOK[a].height);
    parts.forEach((s, j) => {
      s.crop = crops[j];
      used.add(crops[j]);
    });
  });
  return out;
}

/** A section cut in two along the bed, both halves with its crop. */
export function split(sections: Section[], index: number): Section[] {
  const s = sections[index];
  const mid = (s.y0 + s.y1) / 2;
  const out = [
    ...sections.slice(0, index),
    { ...s, y1: mid },
    { ...s, y0: mid },
    ...sections.slice(index + 1),
  ];
  const bed = out.filter(t => t.bed === s.bed).sort((a, z) => a.y0 - z.y0);
  bed.forEach((t, j) => {
    t.part = j;
    t.parts = bed.length;
  });
  return out;
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
 *  tall crop south of a low one in the same bed. */
export function notes(sections: Section[], index: number): Note[] {
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
      const [north, south] = s.y0 < t.y0 ? [s, t] : [t, s];
      if (
        PLANT_LOOK[south.crop!].height >= 1 &&
        PLANT_LOOK[north.crop!].height < 0.6
      )
        add({
          bad: true,
          with: t.crop,
          key: 'shade',
          basis: 'sun',
          tall: south.crop!,
          short: north.crop!,
        });
    }
  }
  return out;
}

/** Good pairs and notes to fix over the whole garden, each pair once. */
export function summary(sections: Section[]) {
  let good = 0;
  const bad: Note[] = [];
  const seen = new Set<string>();
  sections.forEach((s, i) =>
    notes(sections, i).forEach(n => {
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
 *  spacing, rows at least that far apart (half the field row gap in a bed).
 *  Null for a scattered green manure. */
export function fit(s: Section): Fit | null {
  const crop = s.crop ? CROP[s.crop] : null;
  if (!crop || crop.spacing === null) return null;
  const sp = crop.spacing / 100;
  const across = Math.max(sp, (crop.rows ?? crop.spacing) / 200);
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
