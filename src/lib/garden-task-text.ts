/**
 * What a "To do this week" task says: its title, its line of explanation, and
 * where it comes from. The garden page and the morning alert both say it this
 * way (the alert, through the Huerta Worker's cron).
 */
import type { Task } from '@/lib/garden-week';
import { weekday } from '@/lib/huerta';

/** A translate function on the huerta namespace: i18next's, or the Worker's. */
export type T = (key: string, options?: Record<string, unknown>) => string;
export type From = 'forecast' | 'plan' | 'soil';

export function taskText(
  task: Task,
  t: T,
  lang: string
): { title: string; text: string; from: From } {
  const names = (ids: string[]) => ids.map(id => t(`crops.${id}`)).join(', ');
  switch (task.kind) {
    case 'frost':
      return {
        title: t(`week.todo.frost.${task.level}`),
        text: t('week.todo.frost.text', { crops: names(task.crops) }),
        from: 'forecast',
      };
    case 'laterFrost':
      return {
        title: t('week.todo.laterFrost.title', {
          night: weekday(task.night, lang),
        }),
        text: t('week.todo.laterFrost.text', { crops: names(task.crops) }),
        from: 'forecast',
      };
    case 'water':
      return {
        title: t('week.todo.water.title', { mm: task.mm }),
        // Loam's two soakings; sand and clay their own way.
        text: t(
          task.soil === 'loam'
            ? 'week.todo.water.text'
            : `week.todo.water.${task.soil}`
        ),
        from: 'forecast',
      };
    case 'rain':
      return {
        title: t('week.todo.rain.title', { mm: task.mm }),
        text: t('week.todo.rain.text'),
        from: 'forecast',
      };
    case 'plantNow':
      return {
        title: t('week.todo.plantNow.title'),
        text: names(task.crops),
        from: 'plan',
      };
    case 'soil':
      return {
        title: t(`week.todo.soil.${task.note}.title`, {
          crops: names(task.crops),
        }),
        text: t(`week.todo.soil.${task.note}.text`),
        from: 'soil',
      };
    case 'stage':
      return {
        title: t(`week.todo.stage.${task.step}.title`, {
          crop: t(`crops.${task.crop}`),
          count: task.weeks,
        }),
        text: t(`week.todo.stage.${task.step}.text`, {
          count: task.weeks,
          cm: task.cm,
        }),
        from: 'plan',
      };
    case 'sowAgain':
      return {
        title: t('week.todo.sowAgain.title', { crop: t(`crops.${task.crop}`) }),
        text: t('week.todo.sowAgain.text', { weeks: task.weeks }),
        from: 'plan',
      };
  }
}
