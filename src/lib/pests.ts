/**
 * Pests whose danger the weather tells: late blight from warm, humid days in
 * a row (worked out by the night run: the advice's `blight`), and three flies
 * from the warmth since 1 March. Rules and sources: funges-lab
 * superpowers/huerta-pests.md.
 */
import { daily, dayIndex, type Warm } from '@/lib/growth';
import type { PlaceAdvice } from '@/lib/huerta';
import type { Plan } from '@/lib/planner';

export type PestId = 'blight' | 'carrot_fly' | 'cabbage_root_fly' | 'onion_fly';

export interface PestTask {
  kind: 'pest';
  pest: PestId;
  /** In danger now, or from `day`. */
  phase: 'soon' | 'now';
  /** The first blight day, or the fly's first flies. */
  day: string;
  crops: string[];
}

/** A fly's spring flight in degree days above `base` °C (daily mean air)
 *  from 1 March: its first flies at `from`, the end of its warning at
 *  `until`. */
export interface Flight {
  base: number;
  from: number;
  until: number;
}

export const PESTS: Record<PestId, { crops: string[]; flight?: Flight }> = {
  // Hutton criteria (AHDB, 2017).
  blight: { crops: ['potato', 'tomato'] },
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
 *  year, from the degree days since 1 March: the place's daily mean air as
 *  observed and forecast (`warm`), then its typical days (monthly `temps`).
 *  Null before 1 March, or where the year never warms enough. */
export function flight(
  fly: Flight,
  today: string,
  temps: number[],
  warm?: Warm | null
) {
  const march = `${today.slice(0, 4)}-03-01`;
  if (today < march) return null;
  const normal = daily(temps);
  const first = dayIndex(march);
  const offset = warm ? between(warm.start, march) : 0;
  let sum = 0;
  let from: string | null = null;
  for (let i = 0; first + i < normal.length; i++) {
    sum += Math.max(0, (warm?.t[offset + i] ?? normal[first + i]) - fly.base);
    if (!from && sum >= fly.from) from = addDays(march, i);
    if (from && sum >= fly.until) return { from, until: addDays(march, i) };
  }
  return from ? { from, until: `${today.slice(0, 4)}-12-31` } : null;
}

/** How far ahead a fly's first flies are worth covering for. */
const SOON_DAYS = 14;
/** °C: where even the coldest month is warmer, there is no winter rest for
 *  a spring flight to start from; the rules come from cold-winter places
 *  (Norway, Wisconsin, Michigan). */
const NO_WINTER = 10;
const FLIES = ['carrot_fly', 'cabbage_root_fly', 'onion_fly'] as const;

/** This week's pest warnings: blight weather for potatoes and tomatoes in the
 *  ground; a fly from two weeks before its first flies to the end of its
 *  warning, for its crops in the ground or going in by then. */
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
  if (!temps || Math.min(...temps) > NO_WINTER) return tasks;
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
