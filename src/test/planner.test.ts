import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import type { CropStatus } from '@/lib/huerta';
import {
  adjacent,
  autoPlan,
  axisOf,
  dueDate,
  fit,
  inMonth,
  layout,
  lengthen,
  merge,
  monthAhead,
  nextYear,
  northness,
  notes,
  ready,
  removeBed,
  reshape,
  restoreBed,
  split,
  summary,
  type Garden,
  type PlanStyle,
  type Section,
} from '@/lib/planner';
import { CROPS } from '@/lib/huerta';
import { PLANT_LOOK } from '@/lib/planner-data';

const NOW = new Set([
  'broad_beans',
  'peas',
  'cabbage',
  'kale',
  'lettuce',
  'spinach',
  'garlic',
  'onion_sets',
]);
const status = (id: string): CropStatus => (NOW.has(id) ? 'now' : 'too_late');

describe('the garden planner', () => {
  it('lays out beds with paths, in sections of about 1.8 m', () => {
    const beds = layout({ width: 6, length: 4.5, shape: 'rect' });
    expect(new Set(beds.map(s => s.bed)).size).toBe(3);
    expect(beds.filter(s => s.bed === 0)).toHaveLength(2);
    expect(beds[0].x1 - beds[0].x0).toBeCloseTo(1.2);
    expect(adjacent(beds[0], beds[1])).toBe(true); // along the bed
    expect(adjacent(beds[0], beds[2])).toBe(true); // across the path
    expect(adjacent(beds[0], beds[5])).toBe(false); // two beds away
  });

  it('never plans onions beside beans, even in an L', () => {
    for (const shape of ['rect', 'L'] as const) {
      const plan = autoPlan(layout({ width: 6, length: 4.5, shape }), status);
      expect(plan.every(s => s.crop)).toBe(true);
      expect(
        summary(plan).bad.filter(n => n.key === 'alliumLegume')
      ).toHaveLength(0);
    }
  });

  it('keeps planted sections and puts tall crops at the north end', () => {
    const beds = layout({ width: 6, length: 4.5, shape: 'rect' });
    beds[0] = { ...beds[0], crop: 'garlic', planted: '2026-10-21' };
    const plan = autoPlan(beds, status);
    expect(plan[0].crop).toBe('garlic');
    const bed1 = plan.filter(s => s.bed === 1).sort((a, z) => a.y0 - z.y0);
    expect(['kale', 'cabbage']).toContain(bed1[0].crop);
    expect(bed1.map(s => s.crop)).not.toContain(undefined);
  });

  it('flags pairs to keep apart and tall crops that shade', () => {
    const beds = layout({ width: 2, length: 4.5, shape: 'rect' }); // one bed, two sections
    const pair = (north: string, south: string): Section[] => [
      { ...beds[0], crop: north },
      { ...beds[1], crop: south },
    ];
    expect(notes(pair('potato', 'tomato'), 0).map(n => n.key)).toEqual([
      'blight',
    ]);
    expect(notes(pair('lettuce', 'sweetcorn'), 0).map(n => n.key)).toEqual([
      'shade',
    ]);
    expect(notes(pair('sweetcorn', 'lettuce'), 0)).toEqual([]);
    expect(notes(pair('tomato', 'calendula'), 1)).toMatchObject([
      { bad: false, key: 'flowers' },
    ]);
    // Tomatoes south of the calendula: a good pair, but they shade it.
    expect(notes(pair('calendula', 'tomato'), 1).map(n => n.key)).toEqual([
      'flowers',
      'shade',
    ]);
  });

  it('counts what fits at the crop spacing', () => {
    const [s] = layout({ width: 2, length: 1.9, shape: 'rect' }); // a 1.2 x 1.5 m bed
    expect(fit({ ...s, crop: 'garlic' })?.count).toBe(8 * 10); // 15 cm each way
    expect(fit({ ...s, crop: 'pumpkin' })?.count).toBe(1);
    expect(fit({ ...s, crop: 'winter_rye' })).toBeNull(); // scattered
  });

  it('splits a section and renumbers its bed', () => {
    const beds = layout({ width: 2, length: 2.2, shape: 'rect' });
    const out = split([{ ...beds[0], crop: 'lettuce' }], 0);
    expect(out.map(s => [s.part, s.parts, s.crop])).toEqual([
      [0, 2, 'lettuce'],
      [1, 2, 'lettuce'],
    ]);
  });

  it('times the harvest and the crop to follow', () => {
    const october = new Date('2026-10-21T12:00:00');
    expect(ready('now', 100, october)).toEqual({ key: 'readyNextSpring' });
    expect(ready('now', 45, october)).toEqual({
      key: 'readyAround',
      month: 11,
    });
    expect(nextYear('broad_beans')).toBe('cabbage');
    expect(nextYear('asparagus')).toBe('stays');
    expect(nextYear('tulip')).toBe('any');
  });

  it('lays out a 1 m plot as one bed and a 60 m plot in many', () => {
    const tiny = layout({ width: 1, length: 1, shape: 'rect' });
    expect(tiny).toHaveLength(1);
    expect(tiny[0].x1 - tiny[0].x0).toBeCloseTo(0.8);
    const big = layout({ width: 60, length: 60, shape: 'rect' });
    expect(new Set(big.map(s => s.bed)).size).toBe(37); // (60 - 0.7 + 0.4) / 1.6
  });

  it('runs beds across the plot, or lays an open plot in strips of rows', () => {
    const across = layout({
      width: 4.5,
      length: 6,
      shape: 'rect',
      across: true,
    });
    expect(new Set(across.map(s => s.bed)).size).toBe(3);
    expect(across[0].y1 - across[0].y0).toBeCloseTo(1.2);
    const rowsGarden: Garden = {
      width: 6,
      length: 4.5,
      shape: 'rect',
      ground: 'rows',
    };
    const rows = layout(rowsGarden);
    // Strips across the plot, cut into blocks of about 3 m.
    expect(rows.every(s => s.parts === 2)).toBe(true);
    expect(rows[0].x1 - rows[0].x0).toBeCloseTo((6 - 0.7) / 2);
    expect(rows[0].y1 - rows[0].y0).toBeCloseTo(1.5);
    // Open rows keep the field's full row gap; a bed halves it.
    const onions = { ...rows[0], crop: 'onion_sets' };
    expect(fit(onions, true)?.across).toBeCloseTo(0.3);
    expect(fit(onions)?.across).toBeCloseTo(0.15);
    expect(axisOf(rowsGarden)).toBe('x');
    expect(axisOf({ ...rowsGarden, ground: 'raised', across: true })).toBe('x');
    expect(axisOf({ ...rowsGarden, ground: 'raised' })).toBe('y');
    expect(axisOf({ ...rowsGarden, across: true })).toBe('y');
  });

  it('puts the tallest crop at the true north end, whichever way the plot faces', () => {
    expect(northness({}, 0, 1)).toBeCloseTo(-1);
    expect(northness({ north: 90 }, 1, 0)).toBeCloseTo(-1); // top faces east: north is left
    expect(northness({ north: 180 }, 0, 1)).toBeCloseTo(1); // top faces south
    const g: Garden = { width: 2, length: 4.5, shape: 'rect', north: 180 };
    const plan = autoPlan(layout(g), status, { north: g.north });
    const [south, north] = plan.sort((a, z) => a.y0 - z.y0);
    expect(PLANT_LOOK[north.crop!].height).toBeGreaterThanOrEqual(
      PLANT_LOOK[south.crop!].height
    );
    // The shade note follows true north too: with the top facing south, the
    // sweetcorn at the top is on the sunny side of the lettuce, and shades it.
    const pair: Section[] = [
      { ...plan[0], crop: 'sweetcorn' },
      { ...plan[1], crop: 'lettuce' },
    ];
    expect(notes(pair, 1, 180).map(n => n.key)).toEqual(['shade']);
    expect(notes(pair, 1, 0).map(n => n.key)).toEqual([]);
  });

  it('merges a section with its neighbour and changes its length', () => {
    const g: Garden = { width: 2, length: 4.5, shape: 'rect' };
    const beds = layout(g).map((s, i) => ({
      ...s,
      crop: i ? 'kale' : 'lettuce',
    }));
    const one = merge(beds, 0, 1, 'y');
    expect(one).toHaveLength(1);
    expect(one[0]).toMatchObject({
      crop: 'lettuce',
      part: 0,
      parts: 1,
      y0: beds[0].y0,
      y1: beds[1].y1,
    });
    const longer = lengthen(beds, 0, 0.3, 'y');
    expect(longer[0].y1 - longer[0].y0).toBeCloseTo(
      beds[0].y1 - beds[0].y0 + 0.3
    );
    expect(longer[1].y0).toBeCloseTo(longer[0].y1);
    const most = lengthen(beds, 0, 5, 'y');
    expect(most[1].y1 - most[1].y0).toBeCloseTo(0.3); // never shorter than 30 cm
    const last = lengthen(beds, 1, 0.2, 'y'); // the last section takes from the one before
    expect(last[1].y0).toBeCloseTo(beds[1].y0 - 0.2);
    const across = layout({
      width: 4.5,
      length: 2,
      shape: 'rect',
      across: true,
    });
    const halves = split(across, 0, 'x');
    expect(halves[0].x1).toBeCloseTo((across[0].x0 + across[0].x1) / 2);
    expect(halves[0].y0).toBeCloseTo(across[0].y0);
  });

  it('deletes a bed to plain earth, puts it back, and keeps the plan through a resize', () => {
    const g: Garden = { width: 6, length: 4.5, shape: 'rect' };
    const plan = { garden: g, sections: autoPlan(layout(g), status) };
    const cut = removeBed(plan, 1);
    expect(new Set(cut.sections.map(s => s.bed))).toEqual(new Set([0, 1]));
    expect(cut.bare).toHaveLength(1);
    const back = restoreBed(cut, 0);
    expect(back.bare).toHaveLength(0);
    expect(new Set(back.sections.map(s => s.bed)).size).toBe(3);
    const planted = {
      ...plan,
      sections: plan.sections.map((s, i) =>
        i === 0 ? { ...s, crop: 'asparagus', planted: '2026-10-01' } : s
      ),
    };
    expect(autoPlan(planted.sections, status)[0].crop).toBe('asparagus');
    const wider = reshape(planted, { ...g, width: 7.5 }, status);
    expect(wider.sections.find(s => s.planted)?.crop).toBe('asparagus');
    expect(wider.sections.every(s => s.crop)).toBe(true);
    // A crop chosen by hand is planned again; with `only`, the rest stay.
    const hand = plan.sections.map((s, i) =>
      i === 0 || i === 1 ? { ...s, crop: 'zinnia' } : s
    );
    expect(autoPlan(hand, status)[0].crop).not.toBe('zinnia');
    const just = autoPlan(hand, status, { only: [1] });
    expect(just[0].crop).toBe('zinnia');
    expect(just[1].crop).not.toBe('zinnia');
    expect(just.slice(2).map(s => s.crop)).toEqual(
      hand.slice(2).map(s => s.crop)
    );
    // A deleted bed stays deleted through a resize.
    const after = reshape(cut, { ...g, length: 5 }, status);
    expect(after.bare).toHaveLength(1);
    expect(new Set(after.sections.map(s => s.bed)).size).toBe(2);
  });

  it('plans the kind of garden asked for', () => {
    const KIND = Object.fromEntries(CROPS.map(c => [c.id, c.kind]));
    const all = (_: string): CropStatus => 'now';
    const g: Garden = { width: 10, length: 6, shape: 'rect' };
    const plan = (style: PlanStyle) =>
      autoPlan(layout(g), all, { style }).map(s => s.crop!);
    expect(plan('veg').every(id => KIND[id] === 'vegetable')).toBe(true);
    expect(
      plan('herbsFlowers').every(id => ['herb', 'flower'].includes(KIND[id]))
    ).toBe(true);
    const FRUIT = new Set(
      'strawberry melon watermelon tomato pepper chilli aubergine courgette cucumber pumpkin winter_squash'.split(
        ' '
      )
    );
    expect(plan('fruit').every(id => FRUIT.has(id))).toBe(true);
    // Vegetables with flowers: each bed's south end in flower, the rest vegetables.
    const mixed = autoPlan(layout(g), all, { style: 'vegFlowers' });
    for (const bed of new Set(mixed.map(s => s.bed))) {
      const parts = mixed
        .filter(s => s.bed === bed)
        .sort((a, z) => z.y0 - a.y0);
      expect(KIND[parts[0].crop!]).toBe('flower');
      expect(parts[0].y1 - parts[0].y0).toBeCloseTo(0.4); // a strip, not a section
      expect(parts.slice(1).every(s => KIND[s.crop!] === 'vegetable')).toBe(
        true
      );
    }
    // Planned again, the strip stays a strip.
    const again = autoPlan(mixed, all, { style: 'vegFlowers' });
    expect(again).toHaveLength(mixed.length);
  });

  it('plans only what goes in this week', () => {
    const g: Garden = { width: 4, length: 3, shape: 'rect', ground: 'ground' };
    // Fruit first in autumn: strawberries go in, melons are too late.
    const autumn = (id: string): CropStatus =>
      id === 'strawberry' ? 'now' : 'too_late';
    const fruit = autoPlan(layout(g), autumn, { style: 'fruit' });
    expect(fruit.every(s => s.crop === 'strawberry')).toBe(true);
    // Nothing goes in: the beds stay empty, also where a crop was planned.
    const none = (_: string): CropStatus => 'wait_spring';
    expect(autoPlan(fruit, none).every(s => s.crop === null)).toBe(true);
  });
});

describe('the garden model', () => {
  it('has every crop photographed at each stage', () => {
    // The model draws only photographs now: a crop added without its five
    // stage images would draw nothing (style/integrate.py lists them in STAGED).
    const source = readFileSync('src/components/GardenModel.tsx', 'utf8');
    const block = source.match(/const STAGED[^{]*\{([^}]*)\}/)?.[1] ?? '';
    const staged = new Set([...block.matchAll(/^\s*(\w+):/gm)].map(m => m[1]));
    expect(CROPS.filter(c => !staged.has(c.id)).map(c => c.id)).toEqual([]);
  });
});

describe('when a crop put in a bed goes in', () => {
  // Tomatoes go in April to June here; garlic in October and November.
  const TOMATO = 0b111000;
  const GARLIC = (1 << 9) | (1 << 10);

  it('today when it goes in now, or its month has come', () => {
    expect(dueDate('now', TOMATO, '2026-10-24')).toBe('2026-10-24');
    expect(dueDate('wait_soil', GARLIC, '2026-10-24')).toBe('2026-10-24');
  });

  it('else the 1st of its next month, next year if need be', () => {
    expect(dueDate('too_late', TOMATO, '2026-10-24')).toBe('2027-04-01');
    expect(dueDate('wait_frost', TOMATO, '2027-02-10')).toBe('2027-04-01');
  });

  it('unset without the calendar', () => {
    expect(dueDate('too_late', undefined, '2026-10-24')).toBeUndefined();
    expect(dueDate('too_late', 0, '2026-10-24')).toBeUndefined();
  });
});

describe('Plan it for me dates what it plans', () => {
  const garden: Garden = { width: 6, length: 4.5, shape: 'rect' };

  it('stamps the day on the sections it fills and clears it on emptied ones', () => {
    const out = autoPlan(layout(garden), status, { sow: '2026-10-24' });
    expect(out.some(s => s.crop)).toBe(true);
    expect(out.filter(s => s.crop).every(s => s.sow === '2026-10-24')).toBe(
      true
    );
    const none = autoPlan(out, () => 'too_late', { sow: '2026-10-24' });
    expect(none.every(s => s.crop === null && s.sow === undefined)).toBe(true);
  });

  it("a new size keeps each bed's date", () => {
    const sections = autoPlan(layout(garden), status, { sow: '2026-10-20' });
    const next = reshape(
      { garden, sections },
      { ...garden, width: 6.5 },
      status,
      '2026-10-24'
    );
    const kept = next.sections.filter(s => s.crop);
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.every(s => s.sow === '2026-10-20')).toBe(true);
  });
});

describe('planning for a later month', () => {
  it("names the month's 1st, into next year", () => {
    expect(monthAhead('2026-10-24', 0)).toBe('2026-10-01');
    expect(monthAhead('2026-10-24', 5)).toBe('2027-03-01');
    expect(monthAhead('2026-12-31', 1)).toBe('2027-01-01');
  });

  it("goes by the place's calendar for that month", () => {
    expect(inMonth(0b100, 2)).toBe('now');
    expect(inMonth(0b100, 3)).toBe('too_late');
    expect(inMonth(undefined, 3)).toBe('too_late');
  });

  it('Plan it for me for March plans what goes in in March, dated the 1st', () => {
    const march = (id: string) => inMonth(id === 'tomato' ? 0b100 : 0, 2);
    const out = autoPlan(
      layout({ width: 6, length: 4.5, shape: 'rect' }),
      march,
      { style: 'veg', sow: '2027-03-01' }
    );
    const planned = out.filter(s => s.crop);
    expect(planned.length).toBeGreaterThan(0);
    expect(planned.every(s => s.crop === 'tomato' && s.sow === '2027-03-01')).toBe(
      true
    );
  });
});
