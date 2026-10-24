/**
 * The morning alert: which of this morning's "To do this week" tasks are news
 * in a garden, and the one notification that tells them. Pure, so the Huerta
 * Worker's cron runs it on the night's files with the same garden-week code
 * the garden page runs.
 */
import { isoWeek, type Task } from '@/lib/garden-week';
import { taskText, type T } from '@/lib/garden-task-text';

export type AlertKind = 'frost' | 'care' | 'water' | 'sow';
export const ALERT_KINDS: AlertKind[] = ['frost', 'care', 'water', 'sow'];

/** What each task is, as an alert a gardener can switch off; soil notes ride
 *  with planting on the page and are never alerts of their own. */
const KIND: Partial<Record<Task['kind'], AlertKind>> = {
  frost: 'frost',
  laterFrost: 'frost',
  stage: 'care',
  water: 'water',
  rain: 'water',
  plantNow: 'sow',
  sowAgain: 'sow',
};
/** Most urgent first. */
const RANK: Task['kind'][] = [
  'frost',
  'laterFrost',
  'water',
  'rain',
  'stage',
  'plantNow',
  'sowAgain',
];
const MEMORY_DAYS = 14;
const LINES = 3;

const dayNumber = (day: string) => Date.parse(`${day}T12:00:00Z`) / 864e5;
const byRank = (a: Task, b: Task) =>
  RANK.indexOf(a.kind) - RANK.indexOf(b.kind);

/** What a task is remembered by. A frost by its level (forgotten on a morning
 *  without one, so the next cold spell is news); planting by crop, so a crop
 *  newly ready is news; watering once a week. */
function keys(task: Task, today: string): string[] {
  switch (task.kind) {
    case 'frost':
      return [`frost:${task.level}`];
    case 'laterFrost':
      return [`laterFrost:${task.night}`];
    case 'water':
    case 'rain':
      return [`${task.kind}:${isoWeek(today)}`];
    case 'stage':
      return [`stage:${task.crop}:${task.step}`];
    case 'plantNow':
      return task.crops.map(crop => `plantNow:${crop}`);
    case 'sowAgain':
      return [`sowAgain:${task.crop}`];
    default:
      return [];
  }
}

/** This morning's news in one garden, most urgent first, and what to
 *  remember: what was told in the last 14 days. */
export function newTasks(
  tasks: Task[],
  sent: Record<string, string>,
  today: string,
  kinds: ReadonlySet<AlertKind>
) {
  const frostNow = tasks.some(task => task.kind === 'frost');
  const memory: Record<string, string> = Object.fromEntries(
    Object.entries(sent).filter(
      ([key, day]) =>
        dayNumber(today) - dayNumber(day) < MEMORY_DAYS &&
        (frostNow || !key.startsWith('frost:'))
    )
  );
  const fresh: Task[] = [];
  for (const task of tasks) {
    const kind = KIND[task.kind];
    if (!kind || !kinds.has(kind)) continue;
    if (task.kind === 'plantNow') {
      const crops = task.crops.filter(crop => !(`plantNow:${crop}` in memory));
      if (crops.length) fresh.push({ ...task, crops });
    } else if (!keys(task, today).some(key => key in memory)) fresh.push(task);
  }
  for (const task of fresh)
    for (const key of keys(task, today)) memory[key] = today;
  return { fresh: fresh.sort(byRank), memory };
}

export interface GardenNews {
  id: string;
  garden: string;
  tasks: Task[];
}

/** One notification for everything new across the gardens, or null when
 *  nothing is: the most urgent as the title, up to three more as lines. */
export function morningMessage(
  news: GardenNews[],
  t: T,
  lang: string,
  named: boolean
) {
  const items = news
    .flatMap(({ id, garden, tasks }) =>
      tasks.map(task => ({ id, garden, task }))
    )
    .sort((a, b) => byRank(a.task, b.task));
  if (!items.length) return null;
  const line = ({ garden, task }: (typeof items)[number]) => {
    const { title, text } = taskText(task, t, lang);
    const said = task.kind === 'plantNow' ? `${title}: ${text}` : title;
    return named ? `${garden}: ${said}` : said;
  };
  const [first, ...rest] = items;
  const lines = rest.slice(0, LINES).map(line);
  if (rest.length > LINES)
    lines.push(t('alerts.more', { count: rest.length - LINES }));
  return {
    title: line(first),
    body: lines.length ? lines.join('\n') : taskText(first.task, t, lang).text,
    url: `/huerta/planner?garden=${encodeURIComponent(first.id)}`,
  };
}

/** i18next's lookups for the Worker, which has no i18next: dotted keys,
 *  {{values}} and _one/_other plurals, on one language's huerta strings. */
export function miniT(strings: object, lang: string): T {
  const get = (key: string): unknown =>
    key
      .split('.')
      .reduce<unknown>(
        (node, part) => (node as Record<string, unknown> | undefined)?.[part],
        strings
      );
  const plural = new Intl.PluralRules(lang);
  return (key, options = {}) => {
    const count = options.count;
    const text =
      (typeof count === 'number'
        ? (get(`${key}_${plural.select(count)}`) ?? get(`${key}_other`))
        : undefined) ?? get(key);
    return typeof text === 'string'
      ? text.replace(/{{(\w+)}}/g, (_, name: string) =>
          String(options[name] ?? '')
        )
      : key;
  };
}
