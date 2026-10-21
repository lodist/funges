import { describe, expect, it } from 'vitest';

import { gardenWeek } from '@/lib/garden-week';
import { SAMPLE_ADVICE, type CropNeeds } from '@/lib/huerta';
import { layout, type Plan } from '@/lib/planner';

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
    ).toEqual([{ kind: 'water', mm: 16 }]);
    expect(gardenWeek(p, { ...advice, rain: 24 }, NEEDS, '2026-10-21')).toEqual(
      [{ kind: 'rain', mm: 24 }]
    );
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
