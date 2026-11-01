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

  it('warns of no fly where there is no winter for it to rest through', () => {
    const p = plan(['carrot', '2027-03-01']);
    const advice = { ...SAMPLE_ADVICE, day: '2027-03-12', warm: undefined };
    // Coldest month 11 °C (South Florida is 20): no spring flight to time.
    const mild = [11, 12, 15, 18, 22, 25, 27, 27, 25, 21, 16, 12];
    expect(pestTasks(p, advice, mild, '2027-03-25')).toEqual([]);
    // Two degrees cooler (coldest month 9 °C): first flies about 2 April.
    expect(
      pestTasks(
        p,
        advice,
        mild.map(t => t - 2),
        '2027-03-25'
      )
    ).toHaveLength(1);
  });
});

describe("a fly's spring flight", () => {
  it('starts and ends at its degree days since 1 March', () => {
    // 15 °C every day: 10 a day above 5 °C; 260 on 26 March, 560 on 25 April.
    expect(flight(carrotFly, '2027-04-10', flat(15))).toEqual({
      from: '2027-03-26',
      until: '2027-04-25',
    });
  });

  it('counts the observed and forecast days first, the typical ones after', () => {
    // 25 °C for 1-10 March (200), then 15 °C: 260 on 16 March.
    const warm = {
      start: '2027-02-20',
      t: [...Array<number>(9).fill(0), ...Array<number>(10).fill(25), null],
    };
    expect(flight(carrotFly, '2027-03-15', flat(15), warm)?.from).toBe(
      '2027-03-16'
    );
  });

  it('says nothing before 1 March, or where the year never warms enough', () => {
    expect(flight(carrotFly, '2027-02-28', flat(15))).toBeNull();
    expect(flight(carrotFly, '2027-06-01', flat(5))).toBeNull();
  });
});
