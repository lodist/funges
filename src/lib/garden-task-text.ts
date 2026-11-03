/**
 * What a "To do this week" task says: its title, its line of explanation, and
 * where it comes from. The garden page and the morning alert both say it this
 * way (the alert, through the Huerta Worker's cron).
 */
import type { Task } from '@/lib/garden-week';
import { weekday } from '@/lib/huerta';
import { FORECAST_PESTS } from '@/lib/pests';

/** A translate function on the huerta namespace: i18next's, or the Worker's. */
export type T = (key: string, options?: Record<string, unknown>) => string;
export type From = 'forecast' | 'weather' | 'plan' | 'soil' | 'climate';

const dayMonth = (day: string, lang: string) =>
  new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long' }).format(
    new Date(`${day}T12:00:00`)
  );

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
    case 'frostCheck':
      // The night before its morning, by its evening's name.
      return {
        title: task.lastNight
          ? t('week.todo.frostCheck.lastNight', {
              crop: t(`crops.${task.crop}`),
            })
          : t('week.todo.frostCheck.night', {
              crop: t(`crops.${task.crop}`),
              night: weekday(
                new Date(Date.parse(`${task.day}T12:00:00Z`) - 864e5)
                  .toISOString()
                  .slice(0, 10),
                lang
              ),
            }),
        text: t(`week.todo.frostCheck.${task.signs}`, {
          low: t('units.celsius', { value: Math.round(task.low) }),
        }),
        from: 'weather',
      };
    case 'storm':
    case 'stormCheck': {
      // Wind, rain or both; the day by its name.
      const day = weekday(task.day, lang);
      const what =
        task.gust === null ? 'rain' : task.rain === null ? 'wind' : 'both';
      if (task.kind === 'stormCheck')
        return {
          title: t(
            `week.todo.stormCheck.${what === 'rain' ? 'rain' : 'wind'}`,
            {
              day,
            }
          ),
          text: t('week.todo.stormCheck.text'),
          from: 'weather',
        };
      return {
        title: t(`week.todo.storm.${what}`, {
          day,
          gust: t('units.kmh', { value: Math.round(task.gust ?? 0) }),
          mm: t('units.mm', { value: Math.round(task.rain ?? 0) }),
        }),
        text: t(`week.todo.storm.${what}Text`),
        from: 'forecast',
      };
    }
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
    case 'tooLate':
      return {
        title: t('week.todo.tooLate.title', { crops: names(task.crops) }),
        text: t('week.todo.tooLate.text'),
        from: 'plan',
      };
    case 'fate': {
      // Lost already, lost by a day to come, or the last to pick before it.
      const { now } = task;
      const date = dayMonth(task.day, lang);
      const crops = names(task.crops);
      return {
        title: task.ready
          ? t('week.todo.fate.last', { crops, date })
          : now
            ? t('week.todo.fate.lost', { crops })
            : t('week.todo.fate.soon', { crops, date }),
        text: `${t(`week.todo.fate.${task.by}${now ? 'Now' : ''}`)} ${t(
          `week.todo.fate.${task.ready ? 'pick' : now ? 'clear' : 'replace'}`
        )}`,
        from: 'climate',
      };
    }
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
    case 'over':
      return {
        title: t('week.todo.over.title', { crops: names(task.crops) }),
        text: t('week.todo.over.text'),
        from: 'plan',
      };
    case 'sowAgain':
      return {
        title: t('week.todo.sowAgain.title', { crop: t(`crops.${task.crop}`) }),
        text: t('week.todo.sowAgain.text', { weeks: task.weeks }),
        from: 'plan',
      };
    case 'pest':
      return {
        title: t(`week.todo.pest.${task.pest}.${task.phase}`, {
          day: weekday(task.day, lang),
          date: dayMonth(task.day, lang),
        }),
        text: t(`week.todo.pest.${task.pest}.text`, {
          crops: names(task.crops),
        }),
        from: FORECAST_PESTS.includes(task.pest) ? 'forecast' : 'climate',
      };
  }
}
