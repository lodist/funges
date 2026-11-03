import { describe, expect, it } from 'vitest';
import { SAMPLE_ADVICE } from '@/lib/huerta';
import { flight, PESTS, pestTasks } from '@/lib/pests';
import { layout, type Plan } from '@/lib/planner';

const flat = (t: number) => Array<number>(12).fill(t);
const carrotFly = PESTS.carrot_fly.flight!;
const beds = layout({ width: 6, length: 4.5, shape: 'rect' });
/** Crops in beds: [crop, planted, planned day]. */
const plan = (...crops: [string, string?, string?][]): Plan => ({
  garden: { width: 6, length: 4.5, shape: 'rect' },
  sections: crops.map(([crop, planted, sow], i) => ({
    ...beds[i],
    crop,
    planted,
    sow,
  })),
});

describe('pest warnings', () => {
  it('warns of blight weather for potatoes and tomatoes in the ground', () => {
    // Bit 3 of the advice for 10 July: 12 July.
    const advice = { ...SAMPLE_ADVICE, day: '2027-07-10', blight: 0b1000 };
    const p = plan(
      ['potato', '2027-04-01'],
      ['tomato'],
      ['carrot', '2027-04-01']
    );
    expect(pestTasks(p, advice, undefined, '2027-07-10')).toEqual([
      {
        kind: 'pest',
        pest: 'blight',
        phase: 'soon',
        day: '2027-07-12',
        crops: ['potato'],
      },
    ]);
    expect(
      pestTasks(p, { ...advice, blight: 0b1 }, undefined, '2027-07-10')[0]
    ).toMatchObject({ phase: 'now', day: '2027-07-09' });
    expect(
      pestTasks(p, { ...advice, blight: 0 }, undefined, '2027-07-10')
    ).toEqual([]);
  });

  it('warns of slug nights for young crops and the ones slugs eat at any age', () => {
    // 1-7 November: lows 3, 6, 6, 8, 2, 7, 7 °C; rain 9, 2, 6, 0, 8 mm.
    const lows = { start: '2027-11-01', t: [3, 6, 6, 8, 2, 7, 7] };
    const rains = { start: '2027-11-01', t: [9, 2, 6, 0, 8, 0, 0] };
    const advice = { ...SAMPLE_ADVICE, day: '2027-11-01', lows, rains };
    const p = plan(
      ['lettuce', '2027-09-01'],
      ['carrot', '2027-08-01'],
      ['broad_beans', '2027-10-20'],
      ['kale', undefined, '2027-11-10']
    );
    // The 3rd: mild and wet. Not the 1st (cold), the 2nd (2 mm), the 4th (dry)
    // nor the 5th (cold). Old carrots and kale not yet in: no.
    expect(pestTasks(p, advice, undefined, '2027-11-01')).toEqual([
      {
        kind: 'pest',
        pest: 'slugs',
        phase: 'soon',
        day: '2027-11-03',
        crops: ['lettuce', 'broad_beans'],
      },
    ]);
    expect(pestTasks(p, advice, undefined, '2027-11-03')[0]).toMatchObject({
      phase: 'now',
      day: '2027-11-03',
    });
    // After the 3rd no mild night is wet: nothing, as without the weather.
    expect(pestTasks(p, advice, undefined, '2027-11-05')).toEqual([]);
    expect(
      pestTasks(p, { ...advice, rains: undefined }, undefined, '2027-11-01')
    ).toEqual([]);
  });

  it('warns of a fly two weeks before its first flies, until its warning ends', () => {
    const p = plan(
      ['carrot', '2027-03-01'],
      ['parsnip', undefined, '2027-04-10'],
      ['parsley', undefined, '2027-07-01']
    );
    // A spring of 15 °C days after a cold winter: carrot fly flies from 26
    // March, its warning ends 25 April.
    const warm = { start: '2027-03-01', t: Array<number>(90).fill(15) };
    const advice = { ...SAMPLE_ADVICE, day: '2027-03-12', warm };
    const temps = [1, 2, 6, 10, 14, 17, 19, 19, 15, 10, 5, 2];
    expect(pestTasks(p, advice, temps, '2027-03-10')).toEqual([]);
    expect(pestTasks(p, advice, temps, '2027-03-12')).toEqual([
      {
        kind: 'pest',
        pest: 'carrot_fly',
        phase: 'soon',
        day: '2027-03-26',
        crops: ['carrot', 'parsnip'],
      },
    ]);
    expect(pestTasks(p, advice, temps, '2027-04-20')[0]).toMatchObject({
      phase: 'now',
      crops: ['carrot', 'parsnip'],
    });
    expect(pestTasks(p, advice, temps, '2027-04-25')).toEqual([]);
  });

  it('warns of no fly where winters are warmer than the rules were checked in', () => {
    const p = plan(['carrot', '2027-03-01']);
    const advice = { ...SAMPLE_ADVICE, day: '2027-03-12', warm: undefined };
    // Coldest month 8 °C (the trap data go up to 7.4 °C): no warning.
    const mild = [8, 9, 12, 15, 19, 22, 24, 24, 22, 18, 13, 9];
    expect(pestTasks(p, advice, mild, '2027-03-10')).toEqual([]);
    // One degree cooler (coldest month 7 °C): first flies in mid-March.
    expect(
      pestTasks(
        p,
        advice,
        mild.map(t => t - 1),
        '2027-03-10'
      )
    ).toHaveLength(1);
  });
});

describe("a fly's spring flight", () => {
  it('starts and ends at its degree days since 1 January', () => {
    // 15 °C every day: 10 a day above 5 °C; 260 on 26 January, 560 on 25
    // February.
    expect(flight(carrotFly, '2027-04-10', flat(15))).toEqual({
      from: '2027-01-26',
      until: '2027-02-25',
    });
  });

  it('counts the observed and forecast days first, the typical ones after', () => {
    // 25 °C for 1-13 January (20 a day): 260 on 13 January; the typical
    // 5 °C after it adds nothing, so the warning never ends before the year.
    const warm = {
      start: '2026-12-20',
      t: [...Array<number>(12).fill(0), ...Array<number>(13).fill(25), null],
    };
    expect(flight(carrotFly, '2027-01-10', flat(5), warm)).toEqual({
      from: '2027-01-13',
      until: '2027-12-31',
    });
  });

  it('says nothing where the year never warms enough', () => {
    expect(flight(carrotFly, '2027-06-01', flat(5))).toBeNull();
  });
});
