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
import type { Climate, PlaceYear } from '@/lib/huerta-wire';
import type { Plan, Section } from '@/lib/planner';
import { PLANT_LOOK } from '@/lib/planner-data';
import { forSoil, gardenSoil, soilTemps, type Texture } from '@/lib/soil';

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
  | {
      kind: 'fate';
      by: Killer;
      day: string;
      /** Its day has come. */
      now: boolean;
      ready: boolean;
      crops: string[];
    }
  | { kind: 'sowAgain'; crop: string; weeks: number }
  | { kind: 'stage'; crop: string; step: Step; weeks?: number; cm?: number }
  /** Its harvest over, or its season ended after it was ready: still in the
   *  plan, to take out so the bed is free. */
  | { kind: 'over'; crops: string[] };

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
// Less than this over the week is not worth a reminder: sand runs dry
// sooner than loam, clay holds out longer.
const WATER_MM: Record<Texture, number> = { sandy: 3, loam: 5, clay: 8 };
/** How far ahead To do says to pick the last of a crop before its season
 *  ends; one that dies before it is ready is warned of from the day it goes
 *  in. */
const LAST_PICK_DAYS = 21;
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
const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('sv');
};
const dayOfYear = (day: string) => {
  const d = new Date(`${day}T12:00:00`);
  return Math.round(
    (d.getTime() - new Date(d.getFullYear(), 0, 0, 12).getTime()) / 864e5
  );
};

/** A place's typical frost season, as its advice carries it: the first
 *  autumn and last spring frost, day of the year (null: none in a typical
 *  year, absent: not known). */
export type FrostDates = Pick<PlaceAdvice, 'firstFrost' | 'lastFrost'>;

/** What ends a crop in the ground: a frost (0 C) for tender crops, nights too
 *  cold for one that needs warm ones, or a winter colder than a hardier crop
 *  lives through. */
export type Killer = 'frost' | 'cold' | 'winter';
/** The day a crop likely dies at the place, and of what. */
export interface Fate {
  day: string;
  by: Killer;
}
/** Where the simulator reads the place: its year (climate, hardiness,
 *  monthly means) and, before the year files carry a climate, the advice's
 *  frost dates. */
export interface Place {
  year?: PlaceYear | null;
  frost?: FrostDates;
}

// As the nightly run: a tender crop may go out two weeks before its warm
// nights begin; as the year calendar, it lasts a month after they end.
const EARLY_DAYS = 14;
const WARM_AFTER_DAYS = 30;
/** Longer than this in nights colder than it needs, a tender crop dies. */
const CHILL_DAYS = 21;
/** A hard frost (C): the frost table's second season. */
const HARD_FROST = -3;

/** The day a season of cold nights (from its first autumn night to its last
 *  spring one, days of the year) ends a crop that goes in on `from`, `after`
 *  days into the season: still to come this season; at once deep in it (its
 *  first half, that day gone); else the next season's. */
function seasonKill(
  from: string,
  [first, last]: [number, number],
  after = 0
): string {
  const doy = dayOfYear(from);
  const into = (doy - first + 365) % 365;
  if (into <= after) return addDays(from, after - into);
  if (into <= ((last - first + 365) % 365) / 2) return from;
  return addDays(from, ((first - doy + 365) % 365) + after);
}

/** Put in in a cold season's second half: its last night's day, until when
 *  the crop needs covering on cold nights; else null. */
function seasonCover(
  from: string,
  [first, last]: [number, number]
): string | null {
  const doy = dayOfYear(from);
  const into = (doy - first + 365) % 365;
  const length = (last - first + 365) % 365;
  return into > length / 2 && into <= length
    ? addDays(from, (last - doy + 365) % 365)
    : null;
}

/** The day nights too cold for a tender crop end it: a month after its warm
 *  nights (`warm`, days of the year) end when it goes in in time for them (up
 *  to two weeks early); three weeks on when it goes in out of their season
 *  and they do not begin within that, or never begin here; null where they
 *  last all year. */
function warmKill(from: string, warm: [number, number] | null): string | null {
  if (!warm) return addDays(from, CHILL_DAYS);
  const open = warm[0] - EARLY_DAYS;
  const length = warm[1] + WARM_AFTER_DAYS - open;
  if (length >= 365) return null;
  const into = (dayOfYear(from) - open + 365) % 365;
  if (into <= length) return addDays(from, length - into);
  const wait = 365 - into;
  return addDays(from, wait <= CHILL_DAYS ? wait + length : CHILL_DAYS);
}

/** The day a winter colder than `hardy` (C) ends a hardier crop: none where
 *  the place's winter low stays above it; at a hard frost's first night for a
 *  crop that takes no more; for a hardier one, as far on towards the middle
 *  of the coldest month as its limit is towards the winter low. */
function winterKill(
  from: string,
  hardy: number,
  climate: Climate,
  temps: number[]
): string | null {
  if (climate.low === null || climate.low >= hardy) return null;
  const coldest = temps.indexOf(Math.min(...temps));
  const mid = dayOfYear(`2026-${String(coldest + 1).padStart(2, '0')}-15`);
  if (!climate.hard) {
    const d = new Date(`${from}T12:00:00`);
    const at = new Date(d.getFullYear(), coldest, 15, 12);
    if (at < d) at.setFullYear(at.getFullYear() + 1);
    return at.toLocaleDateString('sv');
  }
  const gap = (mid - climate.hard[0] + 365) % 365;
  const share =
    hardy >= HARD_FROST ? 0 : (HARD_FROST - hardy) / (HARD_FROST - climate.low);
  return seasonKill(from, climate.hard, Math.round(share * gap));
}

/** When and why a crop that goes in on `from` likely dies at the place,
 *  from the place's climate as the nightly's own rules read it: a tender
 *  crop at a frost or when the nights get too cold for it, whichever comes
 *  first; a hardier one in a winter colder than it lives through (its
 *  hardiness, else a half-hardy crop's hard frost or a hardy one's -10 C).
 *  Null when it lives on, or the place's climate is not known (the advice's
 *  frost dates still end a tender crop). */
export function fate(
  id: string,
  need: CropNeeds | undefined,
  from: string,
  place: Place
): Fate | null {
  if (!need) return null;
  const climate = place.year?.climate;
  const kills: Fate[] = [];
  if (need.frost === 'tender') {
    const frost = climate
      ? climate.frost
      : place.frost?.firstFrost && place.frost.lastFrost
        ? ([place.frost.firstFrost, place.frost.lastFrost] as [number, number])
        : null;
    if (frost) kills.push({ day: seasonKill(from, frost), by: 'frost' });
    if (climate && need.night) {
      const day = warmKill(
        from,
        need.night >= 13 ? climate.warm13 : climate.warm10
      );
      if (day) kills.push({ day, by: 'cold' });
    }
  } else if (climate && place.year?.temps) {
    const hardy =
      place.year.hardy?.[id] ??
      (need.frost === 'half_hardy' ? HARD_FROST : -10);
    const day = winterKill(from, hardy, climate, place.year.temps);
    if (day) kills.push({ day, by: 'winter' });
  }
  return kills.sort((a, z) => a.day.localeCompare(z.day))[0] ?? null;
}

/** Put in late in its cold season, a crop that lives through it needs
 *  covering on cold nights until it ends: that day, and of what; else null. */
export function coverUntil(
  id: string,
  need: CropNeeds | undefined,
  from: string,
  place: Place
): Fate | null {
  if (!need) return null;
  const climate = place.year?.climate;
  if (need.frost === 'tender') {
    const frost = climate
      ? climate.frost
      : place.frost?.firstFrost && place.frost.lastFrost
        ? ([place.frost.firstFrost, place.frost.lastFrost] as [number, number])
        : null;
    const day = frost && seasonCover(from, frost);
    return day ? { day, by: 'frost' } : null;
  }
  const hardy =
    place.year?.hardy?.[id] ?? (need.frost === 'half_hardy' ? HARD_FROST : -10);
  if (!climate?.hard || climate.low === null || climate.low >= hardy)
    return null;
  const day = seasonCover(from, climate.hard);
  return day ? { day, by: 'winter' } : null;
}

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

  // What the place's climate kills: a crop that dies before it is ready
  // (put in out of its season), from the day it goes in; one whose season
  // ends, three weeks ahead (the last to pick). One task per cause, day and
  // outcome.
  const grow = year?.temps && soilTemps(year.temps, soil.texture);
  const fates = new Map<string, Extract<Task, { kind: 'fate' }>>();
  for (const s of planted) {
    const crop = s.crop!;
    const need = needs[crop];
    const dies = fate(crop, need, s.planted!, { year, frost: advice });
    if (!dies) continue;
    const ready = Boolean(
      grow && need?.days && growth(crop, need, grow, s.planted!, dies.day) >= 1
    );
    // Ready by then: worth a word only near its end, while still picked.
    const harvest = year?.crops[crop]?.harvest ?? 0;
    if (
      ready &&
      (dies.day < today ||
        days(today, dies.day) > LAST_PICK_DAYS ||
        stageOn(s, needs, grow!, harvest, addDays(dies.day, -1), today) ===
          'bare')
    )
      continue;
    const key = `${dies.by}:${dies.day}:${ready}`;
    const task = fates.get(key) ?? {
      kind: 'fate' as const,
      by: dies.by,
      day: dies.day,
      now: dies.day <= today,
      ready,
      crops: [],
    };
    if (!task.crops.includes(crop)) task.crops.push(crop);
    fates.set(key, task);
  }
  tasks.push(...fates.values());

  // Done for the year (perennials stay): its harvest over, or what ends it
  // here came once it was ready.
  if (grow) {
    const over = planted.filter(
      s =>
        needs[s.crop!]?.days &&
        !NOTED.has(s.crop!) &&
        stageOn(
          s,
          needs,
          grow,
          year?.crops[s.crop!]?.harvest ?? 0,
          today,
          today,
          { year, frost: advice }
        ) === 'bare'
    );
    if (over.length)
      tasks.push({ kind: 'over', crops: unique(over.map(s => s.crop!)) });
  }

  // Water, when something is in the ground.
  if (growing.length) {
    if ((advice.water ?? 0) >= WATER_MM[soil.texture])
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
  const temps = year?.temps && soilTemps(year.temps, soil.texture);
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
    case 'fate':
      return `fate:${task.by}:${task.day}:${task.crops.join(',')}`;
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
 *  if not within two years, or if it dies first (`dies`: its fate's day). */
export function readyDay(
  id: string,
  needs: CropNeeds,
  temps: number[],
  planted: string,
  dies?: string | null
) {
  const { base, need } = warmth(id, needs);
  const limit = dies ? days(planted, dies) : 730;
  let gained = 0;
  const d = new Date(`${planted}T12:00:00`);
  for (let k = 0; k < Math.min(limit, 730); k++) {
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

/** The next four weeks in the garden: planted crops coming ready (unless
 *  they die first: To do warns of that), planned sowings coming up, and
 *  crops whose day has come but which wait for the weather (with the
 *  reason). Soonest first, waits last; one entry per crop and day, with its
 *  sections. */
export function comingUp(
  plan: Plan,
  advice: PlaceAdvice,
  needs: Record<string, CropNeeds>,
  today: string,
  year?: PlaceYear | null
): Coming[] {
  const soil = gardenSoil(plan.garden, year?.soil);
  const week = forSoil(advice, needs, soil.texture, today);
  const temps = year?.temps && soilTemps(year.temps, soil.texture);
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
      const dies = fate(crop, need, s.planted, { year, frost: advice });
      const day = readyDay(crop, need, temps, s.planted, dies?.day);
      if (day && day > today && days(today, day) <= AHEAD_DAYS)
        add(
          `ready:${crop}:${day}`,
          () => ({ kind: 'ready', crop, day, at: [] }),
          i
        );
    } else if (!due(s, today)) {
      const day = s.sow!;
      if (days(today, day) <= AHEAD_DAYS)
        add(
          `sow:${crop}:${day}`,
          () => ({ kind: 'sow', crop, day, at: [] }),
          i
        );
    } else {
      const status = week.crops[crop];
      if (status && (status.startsWith('wait') || status === 'too_warm'))
        add(`wait:${crop}`, () => ({ kind: 'wait', crop, status, at: [] }), i);
    }
  });
  const when = (c: Coming) => (c.kind === 'wait' ? '9999' : c.day);
  return [...byKey.values()].sort((a, z) => when(a).localeCompare(when(z)));
}

export type GrowthStage =
  'bare' | 'seedling' | 'young' | 'grown' | 'ready' | 'lost';

/** Where a section's crop has got to on `day`: bare before it goes in (its
 *  planted day, else its planned day, else today) and again once its harvest
 *  is over (the place's harvest months, `harvest`, or a few weeks past
 *  ready; a quick crop, sown again for more, is picked within weeks
 *  wherever its season goes on); between, its stage from the warmth since,
 *  as the drawing's plants. Perennials and next-year crops stay grown. With
 *  the place, its fate ends a crop: lost if it was not ready by then, over if
 *  it was. */
export function stageOn(
  s: Section,
  needs: Record<string, CropNeeds>,
  temps: number[],
  harvest: number,
  day: string,
  today: string,
  place?: Place
): GrowthStage {
  if (!s.crop) return 'bare';
  const start = s.planted ?? (s.sow && s.sow > today ? s.sow : today);
  if (day < start) return 'bare';
  const need = needs[s.crop];
  const dies = place && fate(s.crop, need, start, place);
  if (dies && day >= dies.day)
    return need?.days && growth(s.crop, need, temps, start, dies.day) >= 1
      ? 'bare'
      : 'lost';
  if (!need?.days || NOTED.has(s.crop)) return 'grown';
  const done = growth(s.crop, need, temps, start, day);
  if (done < 0.3) return 'seedling';
  if (done < 0.75) return 'young';
  if (done < 1) return 'grown';
  if (s.crop in SUCCESSION) return done < 1.3 ? 'ready' : 'bare';
  const month = new Date(`${day}T12:00:00`).getMonth();
  return (harvest >> month) & 1 || done < 1.2 ? 'ready' : 'bare';
}
