/**
 * "To do this week" on the garden page: what the visitor's own planted crops
 * need, from this week's forecast at their place, their plan, and how far
 * each crop has grown since it went in.
 */
import {
  CROPS,
  type CropNeeds,
  type CropStatus,
  type PlaceAdvice,
} from '@/lib/huerta';
import type { PlaceYear } from '@/lib/huerta-wire';
import type { Plan, Section } from '@/lib/planner';
import { PLANT_LOOK } from '@/lib/planner-data';
import { forSoil, gardenSoil, type Texture } from '@/lib/soil';

/** What the garden's soil asks of a crop as it goes in: lime for the cabbage
 *  family on acid soil (clubroot), care with potatoes on alkaline soil (scab),
 *  room for carrots and parsnips in heavy clay (forked roots). */
export type SoilNote = 'lime' | 'scab' | 'forking';
const FORKING = new Set(['carrot', 'parsnip']);

export type Step =
  | 'thin'
  | 'support'
  | 'tieTomato'
  | 'earthUp'
  | 'blanch'
  | 'net'
  | 'pinchBeans'
  | 'pinchSweetPea'
  | 'feed'
  | 'stake'
  | 'harvestSoon'
  | 'ripen'
  | 'harvest';

export type Task =
  | { kind: 'frost'; level: 'frost' | 'ground_frost'; crops: string[] }
  | { kind: 'laterFrost'; night: string; crops: string[] }
  | { kind: 'water'; mm: number; soil: Texture }
  | { kind: 'soil'; note: SoilNote; crops: string[] }
  | { kind: 'rain'; mm: number }
  | { kind: 'plantNow'; crops: string[] }
  | { kind: 'tooLate'; crops: string[] }
  | { kind: 'sowAgain'; crop: string; weeks: number }
  | { kind: 'stage'; crop: string; step: Step; weeks?: number; cm?: number };

/** Quick crops worth sowing again, and after how many weeks. */
const SUCCESSION: Record<string, number> = {
  radish: 2,
  rocket: 3,
  lettuce: 3,
  spinach: 3,
  lambs_lettuce: 3,
  coriander: 3,
  chervil: 3,
  green_beans: 4,
};
const WATER_MM = 5; // less than this over the week: not worth a reminder
const RAIN_MM = 10;

const fruiting: [Step, number, number] = ['feed', 0.5, 1];
const netted: [Step, number, number] = ['net', 0, 0.2];
/** Care through a crop's growth, as windows of the warmth it needs to be
 *  ready (0 = it went in, 1 = ready); the first that fits is this week's.
 *  From the RHS grow-your-own guides (rhs.org.uk/vegetables). */
const STAGES: Record<string, [Step, number, number][]> = {
  carrot: [['thin', 0.2, 0.4]],
  parsnip: [['thin', 0.15, 0.3]],
  beetroot: [['thin', 0.25, 0.45]],
  turnip: [['thin', 0.25, 0.45]],
  radish: [['thin', 0.3, 0.55]],
  lettuce: [['thin', 0.25, 0.45]],
  spinach: [['thin', 0.25, 0.45]],
  chard: [['thin', 0.25, 0.45]],
  fennel: [['thin', 0.2, 0.4]],
  kohlrabi: [netted, ['thin', 0.25, 0.45]],
  peas: [['support', 0.1, 0.3]],
  green_beans: [['support', 0.1, 0.3]],
  sweet_pea: [
    ['pinchSweetPea', 0.15, 0.3],
    ['support', 0.3, 0.45],
  ],
  broad_beans: [
    ['support', 0.35, 0.55],
    ['pinchBeans', 0.55, 0.75],
  ],
  cucumber: [['support', 0.2, 0.45], fruiting],
  tomato: [fruiting, ['tieTomato', 0.1, 0.85]],
  pepper: [fruiting],
  chilli: [fruiting],
  aubergine: [fruiting],
  courgette: [fruiting],
  pumpkin: [fruiting],
  winter_squash: [fruiting],
  melon: [fruiting],
  watermelon: [fruiting],
  potato: [['earthUp', 0.2, 0.45]],
  leek: [['blanch', 0.45, 0.9]],
  cabbage: [netted],
  broccoli: [netted],
  cauliflower: [netted],
  kale: [netted],
  brussels_sprouts: [netted, ['stake', 0.55, 0.85]],
};
/** Bulbs ripen before they are lifted: water less, not "pick soon". */
const BULBS = new Set(['garlic', 'onion', 'onion_sets']);
const SPACING = Object.fromEntries(CROPS.map(c => [c.id, c.spacing]));

/** The warmth a crop needs to be ready, and the temperature it counts from:
 *  degree days above 5 C (10 C for tender crops), about 10 a day over its
 *  days to harvest; garlic's days count its winter, so it has its own sum.
 *  The same as the year calendar's harvest months. */
function warmth(id: string, needs: CropNeeds) {
  return {
    base: needs.frost === 'tender' ? 10 : 5,
    need: id === 'garlic' ? 1300 : needs.days! * 10,
  };
}

/** How far a crop has grown, 1 = ready: the warmth gathered since it went in,
 *  from the place's monthly mean temperatures, over the warmth it needs. */
export function growth(
  id: string,
  needs: CropNeeds,
  temps: number[],
  planted: string,
  today: string
) {
  const { base, need } = warmth(id, needs);
  // ponytail: a month's mean for each of its days; blend mid-months if a
  // week either side of a month's end ever matters.
  let gained = 0;
  const end = new Date(`${today}T12:00:00`);
  for (
    const d = new Date(`${planted}T12:00:00`);
    d < end;
    d.setDate(d.getDate() + 1)
  )
    gained += Math.max(0, temps[d.getMonth()] - base);
  return gained / need;
}

/** This week's care step for one planted crop, if any; `harvest` is its
 *  harvest months at the place (none for perennials and green manures). */
function stage(
  id: string,
  needs: CropNeeds,
  temps: number[],
  harvest: number,
  planted: string,
  today: string
): Task | null {
  const done = growth(id, needs, temps, planted, today);
  const month = new Date(`${today}T12:00:00`).getMonth();
  if (harvest && done >= 1)
    // Picked through the place's harvest months, or a few weeks past ready.
    return (harvest >> month) & 1 || done < 1.2
      ? { kind: 'stage', crop: id, step: 'harvest' }
      : null;
  if (harvest && done >= 0.85) {
    const { base, need } = warmth(id, needs);
    const perDay = Math.max(1, temps[month] - base);
    const weeks = Math.max(1, Math.round(((1 - done) * need) / perDay / 7));
    return {
      kind: 'stage',
      crop: id,
      step: BULBS.has(id) ? 'ripen' : 'harvestSoon',
      weeks,
    };
  }
  const step = STAGES[id]?.find(([, from, to]) => done >= from && done < to);
  if (!step) return null;
  return step[0] === 'thin'
    ? { kind: 'stage', crop: id, step: 'thin', cm: SPACING[id] ?? undefined }
    : { kind: 'stage', crop: id, step: step[0] };
}

const days = (from: string, to: string) =>
  Math.round(
    (new Date(`${to}T12:00:00`).getTime() -
      new Date(`${from}T12:00:00`).getTime()) /
      864e5
  );
const unique = (ids: string[]) => [...new Set(ids)];

/** The ISO week of a YYYY-MM-DD day, as 2026-W43. */
export function isoWeek(day: string) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7)); // that week's Thursday
  const jan4 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      ((d.getTime() - jan4.getTime()) / 864e5 -
        3 +
        ((jan4.getUTCDay() + 6) % 7)) /
        7
    );
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** A planned crop's day has come: the day it was planned for, or none. */
export const due = (s: Section, today: string) => !s.sow || s.sow <= today;

export function gardenWeek(
  plan: Plan,
  advice: PlaceAdvice,
  needs: Record<string, CropNeeds>,
  today: string,
  year?: PlaceYear | null
): Task[] {
  const planted = plan.sections.filter(s => s.crop && s.planted);
  const growing = unique(planted.map(s => s.crop!));
  const frost = (id: string) => needs[id]?.frost;
  const tasks: Task[] = [];
  const done = plan.done ?? {};
  const soil = gardenSoil(plan.garden, year?.soil);
  // The place's statuses, sooner or later in spring for the garden's soil.
  const week = forSoil(advice, needs, soil.texture, today);

  // Frost: a frost (<= 0 C) hurts tender and half-hardy crops, a ground
  // frost (<= 2 C) tender ones; later in the week, only a frost, as a warning.
  if (advice.frost !== 'none') {
    const hurt = growing.filter(id =>
      advice.frost === 'frost'
        ? frost(id) === 'tender' || frost(id) === 'half_hardy'
        : frost(id) === 'tender'
    );
    if (hurt.length)
      tasks.push({ kind: 'frost', level: advice.frost, crops: hurt });
  } else if (advice.laterFrost === 'frost' && advice.laterNight) {
    const hurt = growing.filter(id => frost(id) === 'tender');
    if (hurt.length)
      tasks.push({ kind: 'laterFrost', night: advice.laterNight, crops: hurt });
  }

  // Water, when something is in the ground.
  if (growing.length) {
    if ((advice.water ?? 0) >= WATER_MM)
      tasks.push({
        kind: 'water',
        mm: Math.round(advice.water!),
        soil: soil.texture,
      });
    else if ((advice.rain ?? 0) >= RAIN_MM)
      tasks.push({ kind: 'rain', mm: Math.round(advice.rain!) });
  }

  // What the plan holds whose day has come: in now, or too late for it.
  const waiting = plan.sections.filter(
    s => s.crop && !s.planted && due(s, today)
  );
  const going = (status: CropStatus) =>
    unique(
      waiting.filter(s => week.crops[s.crop!] === status).map(s => s.crop!)
    );
  const ready = going('now');
  if (ready.length) tasks.push({ kind: 'plantNow', crops: ready });
  const notes: [SoilNote, string[]][] = [
    [
      'lime',
      soil.acidity === 'acid'
        ? ready.filter(id => PLANT_LOOK[id]?.family === 'brassica')
        : [],
    ],
    [
      'scab',
      soil.acidity === 'alkaline' ? ready.filter(id => id === 'potato') : [],
    ],
    [
      'forking',
      soil.texture === 'clay' ? ready.filter(id => FORKING.has(id)) : [],
    ],
  ];
  for (const [note, crops] of notes)
    if (crops.length) tasks.push({ kind: 'soil', note, crops });
  const late = going('too_late');
  if (late.length) tasks.push({ kind: 'tooLate', crops: late });

  // Sow quick crops again, a few weeks after the last sowing.
  for (const crop of growing) {
    const every = SUCCESSION[crop];
    if (!every || week.crops[crop] !== 'now') continue;
    // The last sowing: a section's, or a row ticked off as sown again.
    const last = [
      ...planted.filter(s => s.crop === crop).map(s => s.planted),
      done[`sowAgain:${crop}`],
    ]
      .filter((day): day is string => Boolean(day))
      .sort()
      .pop()!;
    const weeks = Math.floor(days(last, today) / 7);
    if (weeks >= every) tasks.push({ kind: 'sowAgain', crop, weeks });
  }

  // Each planted crop's care for where it has got to.
  // ponytail: one step per crop, from its first sowing; per sowing if
  // succession rows ever need their own thinning reminder.
  const temps = year?.temps;
  if (year && temps)
    for (const crop of growing) {
      if (!needs[crop]?.days) continue;
      const first = planted
        .filter(s => s.crop === crop)
        .map(s => s.planted!)
        .sort()[0];
      const harvest = year.crops[crop]?.harvest ?? 0;
      const task = stage(crop, needs[crop], temps, harvest, first, today);
      if (task) tasks.push(task);
    }
  // A job ticked off stays off until it comes round again (a new key); a row
  // sown again moved its own last sowing instead.
  return tasks.filter(task => {
    const key = jobKey(task, plan, today);
    return task.kind === 'sowAgain' || !key || !(key in done);
  });
}

/** What a ticked-off job is remembered by: the weather by its week, care by
 *  the crop's first sowing, a soil note for good; null for sowing and
 *  planting, whose tick is the planting itself. */
export function jobKey(task: Task, plan: Plan, today: string): string | null {
  switch (task.kind) {
    case 'frost':
      return `frost:${task.level}:${isoWeek(today)}`;
    case 'laterFrost':
      return `laterFrost:${task.night}`;
    case 'water':
    case 'rain':
      return `${task.kind}:${isoWeek(today)}`;
    case 'soil':
      return `soil:${task.note}`;
    case 'stage': {
      const first = plan.sections
        .filter(s => s.crop === task.crop && s.planted)
        .map(s => s.planted!)
        .sort()[0];
      return `stage:${task.crop}:${task.step}:${first}`;
    }
    case 'sowAgain':
      return `sowAgain:${task.crop}`;
    default:
      return null;
  }
}

const KEEP_DAYS = 180;
/** The ticks worth keeping on `today`: the last 180 days'. */
export const pruneDone = (done: Record<string, string>, today: string) =>
  Object.fromEntries(
    Object.entries(done).filter(([, day]) => days(day, today) <= KEEP_DAYS)
  );

/** The day a crop that went in on `planted` is ready: when the warmth since
 *  reaches what it needs (as `growth`), from the place's monthly means; null
 *  if not within two years. */
export function readyDay(
  id: string,
  needs: CropNeeds,
  temps: number[],
  planted: string
) {
  const { base, need } = warmth(id, needs);
  let gained = 0;
  const d = new Date(`${planted}T12:00:00`);
  for (let k = 0; k < 730; k++) {
    gained += Math.max(0, temps[d.getMonth()] - base);
    d.setDate(d.getDate() + 1);
    if (gained >= need) return d.toLocaleDateString('sv');
  }
  return null;
}

/** Where a crop of the plan waits to go in: its sections whose day has come,
 *  and the day it was first planned for when that was a week or more ago
 *  (the list then asks whether it went in). */
export function toSow(plan: Plan, crop: string, today: string) {
  const at = plan.sections.flatMap((s, i) =>
    s.crop === crop && !s.planted && due(s, today) ? [i] : []
  );
  const planned = at.map(i => plan.sections[i].sow);
  const late = planned.every(day => day && days(day, today) >= 7);
  return { at, since: late ? planned.sort()[0] : undefined };
}

export type Coming =
  | { kind: 'ready'; crop: string; day: string; at: number[] }
  | { kind: 'sow'; crop: string; day: string; at: number[] }
  | { kind: 'wait'; crop: string; status: CropStatus; at: number[] };
const AHEAD_DAYS = 28;
/** Crops whose first harvest is not a matter of weeks (perennials, flowers
 *  next spring): no ready day. */
const NOTED = new Set(CROPS.filter(c => c.note).map(c => c.id));

/** The next four weeks in the garden: planted crops coming ready, planned
 *  sowings coming up, and crops whose day has come but which wait for the
 *  weather (with the reason). Soonest first, waits last; one entry per crop
 *  and day, with its sections. */
export function comingUp(
  plan: Plan,
  advice: PlaceAdvice,
  needs: Record<string, CropNeeds>,
  today: string,
  year?: PlaceYear | null
): Coming[] {
  const soil = gardenSoil(plan.garden, year?.soil);
  const week = forSoil(advice, needs, soil.texture, today);
  const temps = year?.temps;
  const byKey = new Map<string, Coming>();
  const add = (key: string, make: () => Coming, i: number) => {
    const item = byKey.get(key) ?? make();
    item.at.push(i);
    byKey.set(key, item);
  };
  plan.sections.forEach((s, i) => {
    const crop = s.crop;
    if (!crop) return;
    if (s.planted) {
      const need = needs[crop];
      if (!temps || !need?.days || NOTED.has(crop)) return;
      const day = readyDay(crop, need, temps, s.planted);
      if (day && day > today && days(today, day) <= AHEAD_DAYS)
        add(
          `ready:${crop}:${day}`,
          () => ({ kind: 'ready', crop, day, at: [] }),
          i
        );
    } else if (!due(s, today)) {
      const day = s.sow!;
      if (days(today, day) <= AHEAD_DAYS)
        add(`sow:${crop}:${day}`, () => ({ kind: 'sow', crop, day, at: [] }), i);
    } else {
      const status = week.crops[crop];
      if (status && (status.startsWith('wait') || status === 'too_warm'))
        add(`wait:${crop}`, () => ({ kind: 'wait', crop, status, at: [] }), i);
    }
  });
  const when = (c: Coming) => (c.kind === 'wait' ? '9999' : c.day);
  return [...byKey.values()].sort((a, z) => when(a).localeCompare(when(z)));
}
