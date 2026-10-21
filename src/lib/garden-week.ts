/**
 * "To do this week" on the garden page: what the visitor's own planted crops
 * need, from this week's forecast at their place and their plan. Weather
 * reminders only for now; crop stages (tie up, earth up, harvest) follow
 * with the per-place calendar.
 */
import type { CropNeeds, PlaceAdvice } from '@/lib/huerta';
import type { Plan } from '@/lib/planner';

export type Task =
  | { kind: 'frost'; level: 'frost' | 'ground_frost'; crops: string[] }
  | { kind: 'laterFrost'; night: string; crops: string[] }
  | { kind: 'water'; mm: number }
  | { kind: 'rain'; mm: number }
  | { kind: 'plantNow'; crops: string[] }
  | { kind: 'sowAgain'; crop: string; weeks: number };

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

const days = (from: string, to: string) =>
  Math.round(
    (new Date(`${to}T12:00:00`).getTime() -
      new Date(`${from}T12:00:00`).getTime()) /
      864e5
  );
const unique = (ids: string[]) => [...new Set(ids)];

export function gardenWeek(
  plan: Plan,
  advice: PlaceAdvice,
  needs: Record<string, CropNeeds>,
  today: string
): Task[] {
  const planted = plan.sections.filter(s => s.crop && s.planted);
  const growing = unique(planted.map(s => s.crop!));
  const frost = (id: string) => needs[id]?.frost;
  const tasks: Task[] = [];

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
      tasks.push({ kind: 'water', mm: Math.round(advice.water!) });
    else if ((advice.rain ?? 0) >= RAIN_MM)
      tasks.push({ kind: 'rain', mm: Math.round(advice.rain!) });
  }

  // What the plan holds and can go in now.
  const ready = unique(
    plan.sections
      .filter(s => s.crop && !s.planted && advice.crops[s.crop] === 'now')
      .map(s => s.crop!)
  );
  if (ready.length) tasks.push({ kind: 'plantNow', crops: ready });

  // Sow quick crops again, a few weeks after the last sowing.
  for (const crop of growing) {
    const every = SUCCESSION[crop];
    if (!every || advice.crops[crop] !== 'now') continue;
    const sown = planted.filter(s => s.crop === crop).map(s => s.planted!);
    const last = sown.sort()[sown.length - 1];
    const weeks = Math.floor(days(last, today) / 7);
    if (weeks >= every) tasks.push({ kind: 'sowAgain', crop, weeks });
  }
  return tasks;
}
