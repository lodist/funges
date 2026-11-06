/**
 * The garden by crop: the list beside the drawing (CropList). A crop's line
 * is its sections that go in, or went in, on one day. A line grows into the
 * free section touching it, and gives up the one farthest from its middle.
 * Arranging puts each crop's sections side by side: the free ground taken
 * from the north, families together, tallest first, each family off the
 * ground it grew on in the last three years (the garden's history,
 * Plan.past).
 */
import {
  adjacent,
  familyOf,
  northness,
  pastAt,
  type Grown,
  type Section,
} from '@/lib/planner';
import { PLANT_LOOK } from '@/lib/planner-data';

export interface CropLine {
  crop: string;
  /** The day it goes in, or went in when planted; null: as soon as it can. */
  day: string | null;
  planted: boolean;
  ids: number[];
}

/** The garden's crops, one line per crop and day; a crop's lines by day. */
export function cropLines(sections: Section[]): CropLine[] {
  const lines = new Map<string, CropLine>();
  sections.forEach((s, i) => {
    if (!s.crop) return;
    const day = s.planted ?? s.sow ?? null;
    const key = `${s.crop}|${Boolean(s.planted)}|${day}`;
    const line = lines.get(key) ?? {
      crop: s.crop,
      day,
      planted: Boolean(s.planted),
      ids: [],
    };
    line.ids.push(i);
    lines.set(key, line);
  });
  return [...lines.values()].sort(
    (a, z) =>
      a.crop.localeCompare(z.crop) || (a.day ?? '').localeCompare(z.day ?? '')
  );
}

const free = (s: Section) => !s.crop && !s.planted;
const centre = (s: Section) => [(s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2];
const middle = (sections: Section[], ids: number[]) => {
  const points = ids.map(i => centre(sections[i]));
  return [0, 1].map(k => points.reduce((sum, p) => sum + p[k], 0) / ids.length);
};
const away = (sections: Section[], i: number, [x, y]: number[]) => {
  const [cx, cy] = centre(sections[i]);
  return Math.hypot(cx - x, cy - y);
};

/** The free section a line grows into: one touching it, nearest its middle;
 *  else the free one nearest; null when none is free. */
export function nextFree(sections: Section[], ids: number[]): number | null {
  const open = sections.flatMap((s, i) => (free(s) ? [i] : []));
  if (!open.length) return null;
  if (!ids.length) return open[0];
  const at = middle(sections, ids);
  const touching = open.filter(i =>
    ids.some(j => adjacent(sections[i], sections[j]))
  );
  const pool = touching.length ? touching : open;
  return pool.reduce((best, i) =>
    away(sections, i, at) < away(sections, best, at) ? i : best
  );
}

/** The section a line gives up first: its planned one farthest from its
 *  middle; null when all of it is in the ground. */
export function lastOf(sections: Section[], ids: number[]): number | null {
  const planned = ids.filter(i => !sections[i].planted);
  if (!planned.length) return null;
  const at = middle(sections, ids);
  return planned.reduce((far, i) =>
    away(sections, i, at) > away(sections, far, at) ? i : far
  );
}

const put = (
  sections: Section[],
  i: number,
  crop: string | null,
  sow?: string | null
) =>
  sections.map((s, k) =>
    k === i
      ? {
          ...s,
          crop,
          planted: undefined,
          sow: crop ? (sow ?? undefined) : undefined,
        }
      : s
  );

/** A planned line one section bigger; the same when nothing is free. */
export function growLine(sections: Section[], line: CropLine): Section[] {
  const i = nextFree(sections, line.ids);
  return i === null ? sections : put(sections, i, line.crop, line.day);
}

/** A planned line one section smaller. */
export function shrinkLine(sections: Section[], line: CropLine): Section[] {
  const i = lastOf(sections, line.ids);
  return i === null ? sections : put(sections, i, null);
}

/** A planned line made `n` sections (at least one): grown into the free
 *  sections touching it, or shrunk from its far end; as far as there is
 *  room. */
// ponytail: a section at a time, each looking at every free one (quadratic);
// fine at the planner's 60 x 60 m, a frontier if gardens grow past it.
export function resizeLine(
  sections: Section[],
  line: CropLine,
  n: number
): Section[] {
  let out = sections;
  let ids = [...line.ids];
  const want = Math.max(1, Math.round(n));
  while (ids.length < want) {
    const i = nextFree(out, ids);
    if (i === null) break;
    out = put(out, i, line.crop, line.day);
    ids.push(i);
  }
  while (ids.length > want) {
    const i = lastOf(out, ids);
    if (i === null) break;
    out = put(out, i, null);
    ids = ids.filter(k => k !== i);
  }
  return out;
}

/** How many free sections the garden has left. */
export const freeSections = (sections: Section[]) =>
  sections.filter(free).length;

/** A planned line taken out of the plan (what is in the ground stays). */
export const dropLine = (sections: Section[], line: CropLine) =>
  sections.map((s, i) =>
    line.ids.includes(i) && !s.planted
      ? { ...s, crop: null, sow: undefined }
      : s
  );

/** The ground from the north: the beds by how far north they lie, each from
 *  its north end. */
function fromNorth(sections: Section[], north: number) {
  const n = (s: Section) =>
    northness({ north }, ...(centre(s) as [number, number]));
  const beds = new Map<number, number>();
  sections.forEach(s =>
    beds.set(s.bed, Math.max(beds.get(s.bed) ?? -Infinity, n(s)))
  );
  return sections
    .map((_, i) => i)
    .sort(
      (a, b) =>
        beds.get(sections[b].bed)! - beds.get(sections[a].bed)! ||
        sections[a].bed - sections[b].bed ||
        n(sections[b]) - n(sections[a])
    );
}

/** A new crop's first section: next to its family's, else the free one
 *  farthest north; null when nothing is free. */
export function addLine(
  sections: Section[],
  crop: string,
  sow: string | null,
  north = 0
): { sections: Section[]; index: number } | null {
  const family = familyOf(crop);
  const kin = sections.flatMap((s, i) =>
    s.crop && family && familyOf(s.crop) === family ? [i] : []
  );
  const index = kin.length
    ? nextFree(sections, kin)
    : (fromNorth(sections, north).find(i => free(sections[i])) ?? null);
  return index === null
    ? null
    : { sections: put(sections, index, crop, sow), index };
}

const addDays = (day: string, n: number) =>
  new Date(Date.parse(`${day}T12:00:00Z`) + n * 864e5)
    .toISOString()
    .slice(0, 10);

/** A planned line sown again in rounds: up to `times - 1` more rounds,
 *  `every` weeks apart, each as many sections as the line, next to the round
 *  before; as many rounds as there is room for (`rounds` counts the line). */
export function addRounds(
  sections: Section[],
  line: CropLine,
  every: number,
  times: number,
  today: string
): { sections: Section[]; rounds: number } {
  const first = line.day ?? today;
  let out = sections;
  let before = line.ids;
  let rounds = 1;
  for (let r = 1; r < times; r++) {
    const day = addDays(first, 7 * every * r);
    let next = out;
    const ids: number[] = [];
    for (let k = 0; k < line.ids.length; k++) {
      const i = nextFree(next, ids.length ? ids : before);
      if (i === null) break;
      next = put(next, i, line.crop, day);
      ids.push(i);
    }
    if (ids.length < line.ids.length) break; // no room for the whole round
    out = next;
    before = ids;
    rounds++;
  }
  return { sections: out, rounds };
}

const YEARS = 3;
// ponytail: every order of the families is tried; past 7 (5040 orders) they
// just go tallest first, without the rotation.
const MAX_SEARCH = 7;

const permutations = <T>(items: T[]): T[][] =>
  items.length <= 1
    ? [items]
    : items.flatMap((item, k) =>
        permutations([...items.slice(0, k), ...items.slice(k + 1)]).map(
          rest => [item, ...rest]
        )
      );

/** Each crop's sections side by side. The planned crops are laid on the
 *  ground not planted, from the north: families together, each where it
 *  did not grow in the last three years (last year weighs most), then the
 *  taller families first; in a family the tallest crop first and a crop's
 *  rounds in order. What is in the ground stays where it is. */
export function arrange(
  sections: Section[],
  { north = 0, past, today }: { north?: number; past?: Grown[]; today: string }
): Section[] {
  const order = fromNorth(sections, north).filter(i => !sections[i].planted);
  const crops = order
    .map(i => sections[i])
    .filter(s => s.crop)
    .map(s => ({ crop: s.crop!, sow: s.sow }));
  const family = (crop: string) => familyOf(crop) ?? crop;
  const height = (crop: string) => PLANT_LOOK[crop]?.height ?? 0;
  const families = [...new Set(crops.map(c => family(c.crop)))];
  const of = new Map(
    families.map(f => [
      f,
      crops
        .filter(c => family(c.crop) === f)
        .sort(
          (a, z) =>
            height(z.crop) - height(a.crop) ||
            a.crop.localeCompare(z.crop) ||
            (a.sow ?? '').localeCompare(z.sow ?? '')
        ),
    ])
  );
  const tallest = (f: string) =>
    Math.max(...of.get(f)!.map(c => height(c.crop)));
  // What each family would cost on each spot: 3 where it grew last year, 2
  // the year before, 1 the year before that.
  const years = (ended: string) =>
    Math.floor((Date.parse(today) - Date.parse(ended)) / (365.25 * 864e5));
  const grew = order.map(i => pastAt(past, sections[i]));
  const cost = new Map(
    families.map(f => [
      f,
      grew.map(gs =>
        gs.reduce(
          (sum, g) =>
            family(g.crop) === f && years(g.ended) < YEARS
              ? sum + YEARS - years(g.ended)
              : sum,
          0
        )
      ),
    ])
  );
  const score = (perm: string[]) => {
    let p = 0,
      rotation = 0,
      inversions = 0;
    perm.forEach((f, k) => {
      const spots = cost.get(f)!;
      for (let n = of.get(f)!.length; n > 0; n--) rotation += spots[p++];
      for (const g of perm.slice(k + 1))
        if (tallest(g) > tallest(f)) inversions++;
    });
    return rotation * 1000 + inversions;
  };
  const byHeight = [...families].sort((a, z) => tallest(z) - tallest(a));
  const best =
    families.length > MAX_SEARCH
      ? byHeight
      : permutations(byHeight)
          .map(perm => ({ perm, at: score(perm) }))
          .reduce((b, c) => (c.at < b.at ? c : b)).perm;
  const laid = best.flatMap(f => of.get(f)!);
  const out = sections.map(s => ({ ...s }));
  order.forEach((i, p) => {
    const c = laid[p];
    out[i] = { ...out[i], crop: c?.crop ?? null, sow: c ? c.sow : undefined };
  });
  return out;
}
