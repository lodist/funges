/**
 * Pests whose danger the weather tells: late blight from warm, humid days in
 * a row (worked out by the night run: the advice's `blight`), slugs on mild,
 * wet nights, and three flies from the warmth since 1 January. Rules and
 * sources: funges-lab superpowers/huerta-pests.md.
 */
import { daily, type Warm } from '@/lib/growth';
import type { PlaceAdvice } from '@/lib/huerta';
import type { Plan } from '@/lib/planner';

export type PestId =
  'blight' | 'slugs' | 'carrot_fly' | 'cabbage_root_fly' | 'onion_fly';

export interface PestTask {
  kind: 'pest';
  pest: PestId;
  /** In danger now, or from `day`. */
  phase: 'soon' | 'now';
  /** The first blight day or slug night, or the fly's first flies. */
  day: string;
  crops: string[];
}

/** A fly's spring flight in degree days above `base` °C (daily mean air)
 *  from 1 January: its first flies at `from`, the end of its warning at
 *  `until`. The sources count from the thaw, 1 March where they were built;
 *  in cold winters that is the same, and in mild ones it ran up to four
 *  weeks late against published first catches in France and England
 *  (funges-lab qa/huerta-pests-2026-11-01). */
export interface Flight {
  base: number;
  from: number;
  until: number;
}

export const PESTS: Record<PestId, { crops: string[]; flight?: Flight }> = {
  // Hutton criteria (AHDB, 2017).
  blight: { crops: ['potato', 'tomato'] },
  // RHS: soft, leafy plants and maincrop potatoes at any age (and every crop
  // while young: YOUNG_DAYS).
  slugs: {
    crops: [
      'lettuce',
      'lambs_lettuce',
      'rocket',
      'spinach',
      'chard',
      'chicory',
      'cabbage',
      'kale',
      'basil',
      'strawberry',
      'potato',
    ],
  },
  // VIPS PSILARTEMP (NIBIO): flies from 260, first generation over at 560.
  carrot_fly: {
    crops: ['carrot', 'parsnip', 'parsley'],
    flight: { base: 5, from: 260, until: 560 },
  },
  // Wisconsin extension (first flies, 300 °F·d) and Michigan State (peak egg
  // laying, 565 °F·d), base 43 °F.
  cabbage_root_fly: {
    crops: [
      'cabbage',
      'cauliflower',
      'broccoli',
      'brussels_sprouts',
      'kale',
      'kohlrabi',
      'turnip',
      'radish',
    ],
    flight: { base: 6.1, from: 167, until: 314 },
  },
  // NEWA onion maggot, base 40 °F: first flies 390, peak 735 °F·d.
  onion_fly: {
    crops: ['onion', 'onion_sets'],
    flight: { base: 4.4, from: 217, until: 408 },
  },
};

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const between = (from: string, to: string) =>
  Math.round(
    (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 864e5
  );

/** The days `fly`'s spring flight begins and its warning ends in `today`'s
 *  year, from the degree days since 1 January: the place's daily mean air as
 *  observed and forecast (`warm`), then its typical days (monthly `temps`).
 *  Null where the year never warms enough. */
export function flight(
  fly: Flight,
  today: string,
  temps: number[],
  warm?: Warm | null
) {
  const year = today.slice(0, 4);
  const start = `${year}-01-01`;
  const normal = daily(temps);
  const offset = warm ? between(warm.start, start) : 0;
  let sum = 0;
  let from: string | null = null;
  for (let i = 0; i < normal.length; i++) {
    sum += Math.max(0, (warm?.t[offset + i] ?? normal[i]) - fly.base);
    if (!from && sum >= fly.from) from = addDays(start, i);
    if (from && sum >= fly.until) return { from, until: addDays(start, i) };
  }
  return from ? { from, until: `${year}-12-31` } : null;
}

/** How far ahead a fly's first flies are worth covering for. */
const SOON_DAYS = 14;
/** °C: fly warnings only where the coldest month is no warmer, as far as
 *  the rules were checked against trap catches (7.4 °C in the Cotentin).
 *  Warmer winters give first flies from February, with nothing to check
 *  them against. */
const WINTER_MAX = 7.5;
const FLIES = ['carrot_fly', 'cabbage_root_fly', 'onion_fly'] as const;

/** °C and mm: a slug night is no colder than SLUG_LOW after a day with
 *  SLUG_RAIN of rain. Slugs were photographed 1.3-1.5 times as often on such
 *  days as on other days of the month (funges-lab qa/huerta-slugs-2026-11-03). */
const SLUG_LOW = 5;
const SLUG_RAIN = 5;
/** Days a crop counts as young after it went in: what slugs eat first. */
const YOUNG_DAYS = 28;

/** The first slug night of the coming week (the advice's lows and rains),
 *  or null. */
export function slugNight(advice: PlaceAdvice, today: string) {
  const at = (series: Warm | undefined, day: string) =>
    series?.t[between(series.start, day)] ?? null;
  for (let k = 0; k < 7; k++) {
    const day = addDays(today, k);
    const low = at(advice.lows, day);
    const rain = at(advice.rains, day);
    if (low !== null && low >= SLUG_LOW && rain !== null && rain >= SLUG_RAIN)
      return day;
  }
  return null;
}

/** This week's pest warnings: blight weather for potatoes and tomatoes in the
 *  ground; slug nights for young crops and the ones slugs eat at any age; a
 *  fly from two weeks before its first flies to the end of its warning, for
 *  its crops in the ground or going in by then. */
export function pestTasks(
  plan: Plan,
  advice: PlaceAdvice,
  temps: number[] | undefined,
  today: string
): PestTask[] {
  const crops = (pest: PestId, by: string | null) => [
    ...new Set(
      plan.sections
        .filter(
          s =>
            s.crop &&
            PESTS[pest].crops.includes(s.crop) &&
            (s.planted || (by !== null && (s.sow ?? today) <= by))
        )
        .map(s => s.crop!)
    ),
  ];
  const tasks: PestTask[] = [];
  const bits = advice.blight ?? 0;
  const blighted = crops('blight', null);
  if (bits && blighted.length) {
    // The first blight day: bit 0 is the day before the advice's day.
    const day = addDays(advice.day, Math.log2(bits & -bits) - 1);
    tasks.push({
      kind: 'pest',
      pest: 'blight',
      phase: day <= today ? 'now' : 'soon',
      day,
      crops: blighted,
    });
  }
  const slugDay = slugNight(advice, today);
  const slugged = [
    ...new Set(
      plan.sections
        .filter(
          s =>
            s.crop &&
            s.planted &&
            (PESTS.slugs.crops.includes(s.crop) ||
              between(s.planted, today) < YOUNG_DAYS)
        )
        .map(s => s.crop!)
    ),
  ];
  if (slugDay && slugged.length)
    tasks.push({
      kind: 'pest',
      pest: 'slugs',
      phase: slugDay === today ? 'now' : 'soon',
      day: slugDay,
      crops: slugged,
    });
  if (!temps || Math.min(...temps) > WINTER_MAX) return tasks;
  for (const pest of FLIES) {
    const f = flight(PESTS[pest].flight!, today, temps, advice.warm);
    if (!f || today >= f.until || between(today, f.from) > SOON_DAYS) continue;
    const at = crops(pest, f.until);
    if (at.length)
      tasks.push({
        kind: 'pest',
        pest,
        phase: today >= f.from ? 'now' : 'soon',
        day: f.from,
        crops: at,
      });
  }
  return tasks;
}
