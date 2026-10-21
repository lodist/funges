import { describe, expect, it } from 'vitest';

import type { CropStatus } from '@/lib/huerta';
import {
  adjacent,
  autoPlan,
  fit,
  layout,
  nextYear,
  notes,
  ready,
  split,
  summary,
  type Section,
} from '@/lib/planner';

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
    const [s] = layout({ width: 2, length: 2.2, shape: 'rect' }); // a 1.2 x 1.5 m bed
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
});
