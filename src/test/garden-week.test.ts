import { describe, expect, it } from 'vitest';

import {
  comingUp,
  frostDay,
  frostUntil,
  gardenWeek,
  growth,
  jobKey,
  pruneDone,
  readyDay,
  stageOn,
  toSow,
} from '@/lib/garden-week';
import { SAMPLE_ADVICE, type CropNeeds } from '@/lib/huerta';
import { layout, type Plan, type Section } from '@/lib/planner';
import { soilTemps } from '@/lib/soil';

const need = (frost: CropNeeds['frost']): CropNeeds => ({
  frost,
  soil: [null, null],
  night: null,
  days: 60,
});
const NEEDS = {
  tomato: need('tender'),
  courgette: need('tender'),
  lettuce: need('half_hardy'),
  garlic: need('hardy'),
  carrot: need('half_hardy'),
};
const beds = layout({ width: 6, length: 4.5, shape: 'rect' });
const plan = (...crops: [string, string?][]): Plan => ({
  garden: { width: 6, length: 4.5, shape: 'rect' },
  sections: crops.map(([crop, planted], i) => ({ ...beds[i], crop, planted })),
});
const advice = { ...SAMPLE_ADVICE, water: 0, rain: 0 };

describe("this week's to-do list", () => {
  it('says nothing without a planted crop or a plan to follow', () => {
    expect(gardenWeek(plan(), advice, NEEDS, '2026-10-21')).toEqual([]);
  });

  it('warns of frost only for the planted crops it would hurt', () => {
    const p = plan(
      ['tomato', '2026-05-01'],
      ['lettuce', '2026-05-01'],
      ['garlic', '2026-05-01'],
      ['courgette']
    );
    expect(
      gardenWeek(
        p,
        { ...advice, frost: 'ground_frost' },
        NEEDS,
        '2026-05-10'
      )[0]
    ).toEqual({
      kind: 'frost',
      level: 'ground_frost',
      crops: ['tomato'],
    });
    expect(
      gardenWeek(p, { ...advice, frost: 'frost' }, NEEDS, '2026-05-10')[0]
    ).toMatchObject({
      crops: ['tomato', 'lettuce'],
    });
    expect(
      gardenWeek(
        p,
        { ...advice, laterFrost: 'frost', laterNight: '2026-05-16' },
        NEEDS,
        '2026-05-10'
      )[0]
    ).toEqual({ kind: 'laterFrost', night: '2026-05-16', crops: ['tomato'] });
  });

  it('says how much to water, or that the rain covers it', () => {
    const p = plan(['garlic', '2026-10-01']);
    expect(
      gardenWeek(p, { ...advice, water: 16.4 }, NEEDS, '2026-10-21')
    ).toEqual([{ kind: 'water', mm: 16, soil: 'loam' }]);
    expect(gardenWeek(p, { ...advice, rain: 24 }, NEEDS, '2026-10-21')).toEqual(
      [{ kind: 'rain', mm: 24 }]
    );
  });

  it('reads the soil: how to water, and what it asks of crops going in', () => {
    const on = (acidity: 'acid' | 'alkaline'): Plan => ({
      ...plan(['garlic', '2026-10-01'], ['cabbage'], ['potato'], ['carrot']),
      garden: {
        width: 6,
        length: 4.5,
        shape: 'rect',
        ground: 'ground',
        soil: 'clay',
        acidity,
      },
    });
    const now = {
      ...advice,
      water: 12,
      crops: {
        ...advice.crops,
        cabbage: 'now' as const,
        potato: 'now' as const,
        carrot: 'now' as const,
      },
    };
    expect(gardenWeek(on('acid'), now, NEEDS, '2026-10-21')).toEqual([
      { kind: 'water', mm: 12, soil: 'clay' },
      { kind: 'plantNow', crops: ['cabbage', 'potato', 'carrot'] },
      { kind: 'soil', note: 'lime', crops: ['cabbage'] },
      { kind: 'soil', note: 'forking', crops: ['carrot'] },
    ]);
    expect(
      gardenWeek(on('alkaline'), now, NEEDS, '2026-10-21').filter(
        t => t.kind === 'soil'
      )
    ).toEqual([
      { kind: 'soil', note: 'scab', crops: ['potato'] },
      { kind: 'soil', note: 'forking', crops: ['carrot'] },
    ]);
  });

  it('lists planned crops that can go in now, and quick crops to sow again', () => {
    const p = plan(['lettuce', '2026-09-28'], ['garlic'], ['kale']);
    const now = {
      ...advice,
      crops: {
        ...advice.crops,
        lettuce: 'now' as const,
        garlic: 'now' as const,
        kale: 'too_late' as const,
      },
    };
    expect(gardenWeek(p, now, NEEDS, '2026-10-21')).toEqual([
      { kind: 'plantNow', crops: ['garlic'] },
      { kind: 'tooLate', crops: ['kale'] },
      { kind: 'sowAgain', crop: 'lettuce', weeks: 3 },
    ]);
  });

  it("gives each planted crop this week's step, from the warmth since it went in", () => {
    // Monthly means like Madrid's; tomatoes are picked July to October.
    const year = {
      place: 'Madrid',
      temps: [6, 7, 10, 13, 17, 22, 26, 25, 21, 15, 10, 7],
      crops: {
        tomato: { sow: 0b10000, harvest: 0b1111000000 },
        garlic: { sow: 0b111000000000, harvest: 0b11100000 },
        carrot: { sow: 0b1100, harvest: 0b110000 },
      },
    };
    const step = (crop: string, planted: string, today: string) =>
      gardenWeek(plan([crop, planted]), advice, NEEDS, today, year).filter(
        task => task.kind === 'stage'
      );
    expect(step('carrot', '2026-04-01', '2026-04-20')).toEqual([
      { kind: 'stage', crop: 'carrot', step: 'thin', cm: 5 },
    ]);
    expect(step('tomato', '2026-05-15', '2026-06-15')[0]).toMatchObject({
      step: 'tieTomato',
    });
    expect(step('tomato', '2026-05-15', '2026-06-25')[0]).toMatchObject({
      step: 'feed',
    });
    expect(step('tomato', '2026-05-15', '2026-07-15')[0]).toMatchObject({
      step: 'harvest',
    });
    expect(step('tomato', '2026-05-15', '2026-11-20')).toEqual([]);
    expect(step('garlic', '2025-10-20', '2026-06-01')).toEqual([
      { kind: 'stage', crop: 'garlic', step: 'ripen', weeks: 1 },
    ]);
    // Without the place's temperatures, no steps.
    expect(
      gardenWeek(plan(['carrot', '2026-04-01']), advice, NEEDS, '2026-04-20')
    ).toEqual([]);
  });
});

describe('the dated plan', () => {
  const dated = (
    ...rows: [string, { planted?: string; sow?: string }][]
  ): Plan => ({
    garden: { width: 6, length: 4.5, shape: 'rect' },
    sections: rows.map(([crop, day], i) => ({ ...beds[i], crop, ...day })),
  });
  const now = {
    ...advice,
    crops: {
      ...advice.crops,
      lettuce: 'now' as const,
      garlic: 'now' as const,
      tomato: 'too_late' as const,
    },
  };

  it('lists a crop to sow only once its day has come', () => {
    const p = dated(
      ['lettuce', { sow: '2026-10-20' }],
      ['garlic', { sow: '2026-11-01' }]
    );
    expect(gardenWeek(p, now, NEEDS, '2026-10-24')).toContainEqual({
      kind: 'plantNow',
      crops: ['lettuce'],
    });
  });

  it('asks about a sowing planned a week ago or more', () => {
    const p = dated(
      ['lettuce', { sow: '2026-10-10' }],
      ['lettuce', { sow: '2026-10-12' }]
    );
    expect(toSow(p, 'lettuce', '2026-10-24')).toEqual({
      at: [0, 1],
      since: '2026-10-10',
    });
    expect(toSow(p, 'lettuce', '2026-10-15').since).toBeUndefined();
  });

  it('says when a planned crop missed its time', () => {
    const p = dated(['tomato', { sow: '2026-06-01' }]);
    expect(gardenWeek(p, now, NEEDS, '2026-10-24')).toContainEqual({
      kind: 'tooLate',
      crops: ['tomato'],
    });
    // Planned for next spring: not late, just not yet.
    expect(
      gardenWeek(
        dated(['tomato', { sow: '2027-04-01' }]),
        now,
        NEEDS,
        '2026-10-24'
      )
    ).toEqual([]);
  });

  it('a ticked job stays off until its key changes', () => {
    const p = {
      ...dated(['lettuce', { planted: '2026-10-01' }]),
      done: { 'water:2026-W43': '2026-10-24' },
    };
    const dry = { ...now, water: 12 };
    const water = (day: string) =>
      gardenWeek(p, dry, NEEDS, day).some(task => task.kind === 'water');
    expect(water('2026-10-24')).toBe(false);
    expect(water('2026-10-27')).toBe(true);
    expect(
      jobKey({ kind: 'water', mm: 12, soil: 'loam' }, p, '2026-10-24')
    ).toBe('water:2026-W43');
    expect(
      jobKey({ kind: 'stage', crop: 'lettuce', step: 'thin' }, p, '2026-10-24')
    ).toBe('stage:lettuce:thin:2026-10-01');
    expect(
      jobKey({ kind: 'plantNow', crops: ['lettuce'] }, p, '2026-10-24')
    ).toBeNull();
  });

  it('a row sown again counts as the last sowing', () => {
    const p = {
      ...dated(['lettuce', { planted: '2026-09-01' }]),
      done: { 'sowAgain:lettuce': '2026-10-20' },
    };
    const again = (day: string) =>
      gardenWeek(p, now, NEEDS, day).some(task => task.kind === 'sowAgain');
    expect(again('2026-10-24')).toBe(false);
    expect(again('2026-11-12')).toBe(true);
  });

  it('keeps ticks for 180 days', () => {
    expect(
      pruneDone({ old: '2026-01-01', recent: '2026-10-01' }, '2026-10-24')
    ).toEqual({ recent: '2026-10-01' });
  });
});

describe('ready days and the weeks ahead', () => {
  const temps = [8, 9, 12, 14, 18, 22, 25, 25, 22, 17, 12, 9];
  const year = { place: 'Valencia', crops: {}, temps };

  it('the ready day is the first day its warmth reaches what it needs', () => {
    const day = readyDay('lettuce', NEEDS.lettuce, temps, '2026-09-01')!;
    const before = new Date(`${day}T12:00:00`);
    before.setDate(before.getDate() - 1);
    expect(
      growth('lettuce', NEEDS.lettuce, temps, '2026-09-01', day)
    ).toBeGreaterThanOrEqual(1);
    expect(
      growth(
        'lettuce',
        NEEDS.lettuce,
        temps,
        '2026-09-01',
        before.toLocaleDateString('sv')
      )
    ).toBeLessThan(1);
  });

  it('coming up: sowings soon, crops coming ready, crops waiting for the weather', () => {
    const p: Plan = {
      garden: { width: 6, length: 4.5, shape: 'rect' },
      sections: [
        { ...beds[0], crop: 'lettuce', planted: '2026-09-25' }, // ready ~19 Nov
        { ...beds[1], crop: 'garlic', sow: '2026-11-01' },
        { ...beds[2], crop: 'carrot', sow: '2026-10-01' },
        { ...beds[3], crop: 'tomato', sow: '2027-04-01' }, // too far ahead
      ],
    };
    const wait = {
      ...advice,
      crops: { ...advice.crops, carrot: 'wait_soil' as const },
    };
    const items = comingUp(p, wait, NEEDS, '2026-10-24', year);
    expect(items.map(c => c.kind)).toEqual(['sow', 'ready', 'wait']);
    expect(items[0]).toEqual({
      kind: 'sow',
      crop: 'garlic',
      day: '2026-11-01',
      at: [1],
    });
    expect(items[1]).toMatchObject({ kind: 'ready', crop: 'lettuce', at: [0] });
    expect(items[2]).toEqual({
      kind: 'wait',
      crop: 'carrot',
      status: 'wait_soil',
      at: [2],
    });
  });
});

describe('a bed on the timeline', () => {
  const temps = [8, 9, 12, 14, 18, 22, 25, 25, 22, 17, 12, 9];
  const lettuce = { ...beds[0], crop: 'lettuce', planted: '2026-09-01' };
  const all = 0b111111111111;
  const on = (s: Section, day: string, harvest = all) =>
    stageOn(s, NEEDS, temps, harvest, day, '2026-09-01');

  it('is bare before it goes in, then grows', () => {
    const planned = { ...beds[1], crop: 'lettuce', sow: '2026-11-01' };
    expect(on(planned, '2026-10-30')).toBe('bare');
    expect(on(planned, '2026-11-03')).toBe('seedling');
    expect(on(lettuce, '2026-09-05')).toBe('seedling');
    expect(on(lettuce, '2026-09-25')).toBe('young');
  });

  it('is ready once its warmth is in, and bare again when its harvest is over', () => {
    const ready = readyDay('lettuce', NEEDS.lettuce, temps, '2026-09-01')!;
    expect(on(lettuce, ready)).toBe('ready');
    expect(on(lettuce, '2027-08-01', 0)).toBe('bare');
  });

  it('a quick crop is picked within weeks, even where its harvest goes on all year', () => {
    const carrot = { ...beds[1], crop: 'carrot', planted: '2026-09-01' };
    expect(on(lettuce, '2027-01-15')).toBe('bare');
    expect(on(carrot, '2027-01-15')).toBe('ready');
  });

  it('a planned bed with no date goes in today', () => {
    const now = { ...beds[2], crop: 'lettuce' };
    expect(stageOn(now, NEEDS, temps, all, '2026-09-05', '2026-09-01')).toBe(
      'seedling'
    );
  });
});

describe('frost and the soil', () => {
  // A typical first frost on 20 October (day 293), the last on 20 April (110).
  const zurich = { firstFrost: 293, lastFrost: 110 };
  const temps = [8, 9, 12, 14, 18, 22, 25, 25, 22, 17, 12, 9];
  const all = 0b111111111111;
  const tomato = (planted: string): Section => ({
    ...beds[0],
    crop: 'tomato',
    planted,
  });

  it('frost ends a tender crop at once in autumn, else at the next first frost', () => {
    expect(frostDay('2026-11-10', zurich)).toBe('2026-11-10');
    expect(frostDay('2026-04-01', zurich)).toBe('2026-10-20');
    expect(frostDay('2026-06-01', zurich)).toBe('2026-10-20');
    expect(frostDay('2026-06-01', { firstFrost: null, lastFrost: null })).toBe(
      null
    );
    expect(frostDay('2026-06-01', {})).toBeNull();
    // Put in before the last spring frost: cover it on cold nights till then.
    expect(frostUntil('2026-04-01', zurich)).toBe('2026-04-20');
    expect(frostUntil('2026-11-10', zurich)).toBeNull();
    expect(frostUntil('2026-06-01', zurich)).toBeNull();
  });

  it('on the timeline a tender crop is lost to frost, or over if it was ready by then', () => {
    const on = (s: Section, day: string, frost?: typeof zurich) =>
      stageOn(s, NEEDS, temps, all, day, s.planted!, frost);
    expect(on(tomato('2026-11-10'), '2026-11-20', zurich)).toBe('lost');
    expect(on(tomato('2026-05-15'), '2026-10-25', zurich)).toBe('bare');
    expect(
      on(
        { ...beds[1], crop: 'garlic', planted: '2026-11-10' },
        '2026-12-01',
        zurich
      )
    ).not.toBe('lost');
    // Without the place's frost dates, as before.
    expect(on(tomato('2026-11-10'), '2026-11-20')).toBe('seedling');
    expect(readyDay('tomato', NEEDS.tomato, temps, '2026-11-10', zurich)).toBe(
      null
    );
    expect(
      readyDay('tomato', NEEDS.tomato, temps, '2026-05-15', zurich)
    ).not.toBeNull();
  });

  it('coming up: the first frost for tender crops still in the ground', () => {
    const p: Plan = {
      garden: { width: 6, length: 4.5, shape: 'rect' },
      sections: [
        tomato('2026-05-15'),
        { ...beds[1], crop: 'courgette', planted: '2026-09-20' },
      ],
    };
    const year = {
      place: 'Zurich',
      crops: {
        tomato: { sow: 0, harvest: all },
        courgette: { sow: 0, harvest: all },
      },
      temps,
    };
    const items = comingUp(
      p,
      { ...advice, ...zurich },
      NEEDS,
      '2026-10-01',
      year
    );
    expect(items).toEqual([
      {
        kind: 'frost',
        crop: 'tomato',
        day: '2026-10-20',
        lost: false,
        at: [0],
      },
      {
        kind: 'frost',
        crop: 'courgette',
        day: '2026-10-20',
        lost: true,
        at: [1],
      },
    ]);
  });

  it("the garden's soil: sand brings spring crops on sooner and needs water sooner, clay later", () => {
    const sand = soilTemps(temps, 'sandy');
    expect(sand[3]).toBe(temps[3] + 1.5);
    expect(sand[8]).toBe(temps[8]);
    expect(soilTemps(temps, 'loam')).toBe(temps);
    const ready = (t: number[]) =>
      readyDay('lettuce', NEEDS.lettuce, t, '2026-03-01')!;
    expect(ready(sand) < ready(temps)).toBe(true);
    expect(ready(soilTemps(temps, 'clay')) > ready(temps)).toBe(true);
    const on = (soil: 'sandy' | 'loam'): Plan => ({
      ...plan(['garlic', '2026-10-01']),
      garden: { width: 6, length: 4.5, shape: 'rect', soil },
    });
    const dry = { ...advice, water: 4 };
    expect(gardenWeek(on('sandy'), dry, NEEDS, '2026-10-21')).toEqual([
      { kind: 'water', mm: 4, soil: 'sandy' },
    ]);
    expect(gardenWeek(on('loam'), dry, NEEDS, '2026-10-21')).toEqual([]);
  });
});
