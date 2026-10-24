import { describe, expect, it } from 'vitest';
import en from '@/i18n/locales/en/huerta.json';
import {
  miniT,
  morningMessage,
  newTasks,
  type AlertKind,
} from '@/lib/garden-alerts';
import { isoWeek, type Task } from '@/lib/garden-week';

const ALL = new Set<AlertKind>(['frost', 'care', 'water', 'sow']);
const frost: Task = { kind: 'frost', level: 'frost', crops: ['tomato'] };
const feed: Task = { kind: 'stage', crop: 'tomato', step: 'feed' };
const plant: Task = { kind: 'plantNow', crops: ['garlic'] };
const t = miniT(en, 'en');

describe('what is news in a garden', () => {
  it('tells a task once, and again after 14 days', () => {
    const one = newTasks([feed], {}, '2026-10-01', ALL);
    expect(one.fresh).toEqual([feed]);
    expect(newTasks([feed], one.memory, '2026-10-14', ALL).fresh).toEqual([]);
    expect(newTasks([feed], one.memory, '2026-10-15', ALL).fresh).toEqual([
      feed,
    ]);
  });

  it('tells a cold spell once, and the next one again', () => {
    const a = newTasks([frost], {}, '2026-10-20', ALL);
    const b = newTasks([frost], a.memory, '2026-10-21', ALL);
    expect(b.fresh).toEqual([]);
    const thaw = newTasks([], b.memory, '2026-10-22', ALL);
    expect(newTasks([frost], thaw.memory, '2026-10-23', ALL).fresh).toEqual([
      frost,
    ]);
  });

  it('tells only the crops newly ready to plant', () => {
    const a = newTasks([plant], {}, '2026-10-20', ALL);
    const b = newTasks(
      [{ kind: 'plantNow', crops: ['garlic', 'onion'] }],
      a.memory,
      '2026-10-21',
      ALL
    );
    expect(b.fresh).toEqual([{ kind: 'plantNow', crops: ['onion'] }]);
  });

  it('says to water once a week', () => {
    const water: Task = { kind: 'water', mm: 12, soil: 'loam' };
    const a = newTasks([water], {}, '2026-10-19', ALL);
    expect(newTasks([water], a.memory, '2026-10-25', ALL).fresh).toEqual([]);
    expect(newTasks([water], a.memory, '2026-10-26', ALL).fresh).toEqual([
      water,
    ]);
  });

  it('skips the kinds switched off, and soil notes', () => {
    const soil: Task = { kind: 'soil', note: 'lime', crops: ['cabbage'] };
    const careOnly = new Set<AlertKind>(['care']);
    expect(
      newTasks([frost, feed, soil], {}, '2026-10-20', careOnly).fresh
    ).toEqual([feed]);
  });

  it('puts frost first', () => {
    expect(
      newTasks([plant, feed, frost], {}, '2026-10-20', ALL).fresh.map(
        x => x.kind
      )
    ).toEqual(['frost', 'stage', 'plantNow']);
  });

  it('numbers ISO weeks', () => {
    expect(isoWeek('2026-10-19')).toBe('2026-W43');
    expect(isoWeek('2026-10-25')).toBe('2026-W43');
    expect(isoWeek('2027-01-01')).toBe('2026-W53');
    expect(isoWeek('2027-01-04')).toBe('2027-W01');
  });
});

describe('the morning notification', () => {
  it('one item: its title and its text', () => {
    expect(
      morningMessage(
        [{ id: 'g', garden: 'Home', tasks: [frost] }],
        t,
        'en',
        false
      )
    ).toEqual({
      title: 'Frost in the next 3 days',
      body: `Cover ${en.crops.tomato} on the cold nights.`,
      url: '/huerta/planner?garden=g',
    });
  });

  it('several: the rest as lines, then "and N more", gardens named', () => {
    const message = morningMessage(
      [
        { id: 'a', garden: 'Home', tasks: [frost, feed, plant] },
        {
          id: 'b',
          garden: 'Plot',
          tasks: [
            { kind: 'sowAgain', crop: 'radish', weeks: 3 },
            { kind: 'rain', mm: 14 },
          ],
        },
      ],
      t,
      'en',
      true
    )!;
    expect(message.title).toBe('Home: Frost in the next 3 days');
    expect(message.body.split('\n')).toEqual([
      'Plot: Rain this week, about 14 mm',
      `Home: ${en.crops.tomato}: feed every week or two`,
      `Home: From your plan, ready to go in: ${en.crops.garlic}`,
      'and 1 more',
    ]);
    expect(message.url).toBe('/huerta/planner?garden=a');
  });

  it('nothing new: no notification', () => {
    expect(morningMessage([], t, 'en', false)).toBeNull();
  });
});

describe("the Worker's translate function", () => {
  it('fills in values and picks plurals', () => {
    expect(
      t('week.todo.stage.harvestSoon.title', { crop: 'Kale', count: 1 })
    ).toBe('Kale: ready in about a week');
    expect(
      t('week.todo.stage.harvestSoon.title', { crop: 'Kale', count: 3 })
    ).toBe('Kale: ready in about 3 weeks');
  });

  it('answers the key itself when there is no text', () => {
    expect(t('no.such.key')).toBe('no.such.key');
  });
});
