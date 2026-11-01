import { describe, expect, it } from 'vitest';
import {
  type Bio,
  type GrowthPlace,
  daily,
  dayIndex,
  plantedGrowth,
} from '@/lib/growth';

const flat = (t: number) => Array(12).fill(t);
const place = (over: Partial<GrowthPlace>): GrowthPlace => ({
  lat: 47,
  temps: flat(20),
  sun: flat(20),
  light: 0,
  first0: 0,
  firstm3: 0,
  warmEnd: 0,
  low: 5,
  ...over,
});
// Lettuce's class (60-65 F optimum, 75 F maximum), half-hardy, picked while it grows.
const lettuce: Bio = {
  tb: 4.4,
  tlo: 15.5556,
  thi: 18.3333,
  tmax: 23.8889,
  days: 45,
  kill: 's',
  end: 'growth',
  pick: 4,
  strict: true,
  hardy: -5,
  night: false,
};

describe("a planted crop's growth (the calendar's model)", () => {
  it('counts days as the calendar does', () => {
    expect(dayIndex('2027-01-01')).toBe(0);
    expect(dayIndex('2028-02-29')).toBe(58);
    expect(dayIndex('2027-12-31')).toBe(364);
    expect(daily(flat(7)).every(t => Math.abs(t - 7) < 1e-9)).toBe(true);
  });

  it('is ready when it has its days of warmth, then picked for its weeks', () => {
    // 13.93 degree days a day (18.33 - 4.4: warmth counts to the optimum's
    // top) against 45 x 12.54 = 564.5: ready on the 41st day.
    const g = plantedGrowth('lettuce', lettuce, place({}), '2027-05-01');
    expect(g.ready).toBe('2027-06-11');
    expect(g.end).toBe('2027-07-09');
    expect(g.progress('2027-05-01')).toBe(0);
    expect(g.progress('2027-06-11')).toBeGreaterThanOrEqual(1);
  });

  it('stops in heat above its maximum', () => {
    // Picked from 11 June for four weeks, but July and August average 30 C.
    const hot = place({
      temps: [20, 20, 20, 20, 20, 20, 30, 30, 20, 20, 20, 20],
    });
    const g = plantedGrowth('lettuce', lettuce, hot, '2027-05-01');
    expect(g.end! < '2027-07-09').toBe(true);
  });

  it('picks a crop the winter catches before it is ready once it grows again', () => {
    const zug = place({
      temps: [0, 1, 5, 9, 13, 17, 19, 19, 15, 10, 5, 1],
      sun: [4, 7, 12, 17, 18, 20, 19, 17, 12, 8, 5, 3],
      light: 306,
      first0: 319,
      firstm3: 329,
      low: -8,
    });
    const spinach: Bio = {
      ...lettuce,
      days: 40,
      kill: 'h',
      pick: 6,
      hardy: -10,
    };
    const g = plantedGrowth('spinach', spinach, zug, '2027-10-01');
    expect(g.ready! > '2028-02-28' && g.ready! < '2028-06-01').toBe(true);
    expect(g.progress('2027-11-30')).toBeGreaterThan(0.1);
    expect(g.progress('2027-11-30')).toBeLessThan(1);
  });

  it("ends a winter crop at the first hard frost where the place's winter low is not known", () => {
    // Kale picked through the winter where the year files carry no low: it
    // must not fail (it once gave "Invalid time value").
    const kale: Bio = {
      ...lettuce,
      days: 55,
      kill: 'h',
      end: 'winter',
      pick: 10,
      strict: false,
      hardy: -15,
    };
    const somewhere = place({
      temps: [0, 1, 5, 9, 13, 17, 19, 19, 15, 10, 5, 1],
      sun: [4, 7, 12, 17, 18, 20, 19, 17, 12, 8, 5, 3],
      light: 306,
      first0: 319,
      firstm3: 329,
      low: null,
    });
    const g = plantedGrowth('kale', kale, somewhere, '2027-06-01');
    expect(g.ready).not.toBeNull();
    expect(g.end! >= g.ready!).toBe(true);
    // A hard frost (-3 C) is on 25 November there: picked until about then.
    expect(g.end! <= '2027-12-31').toBe(true);
  });

  it('ends a tender crop with the warm nights, a month on, before the first light frost', () => {
    const tomato: Bio = {
      tb: 10,
      tlo: 21.1111,
      thi: 23.8889,
      tmax: 26.6667,
      days: 70,
      kill: 't',
      end: 'frost',
      pick: 16,
      strict: false,
      hardy: null,
      night: true,
    };
    const summer = place({
      temps: [5, 6, 10, 14, 18, 22, 24, 24, 20, 14, 9, 6],
      light: 290,
      warmEnd: 250,
      low: -6,
    });
    const g = plantedGrowth('tomato', tomato, summer, '2027-06-01');
    // The warm nights end on day 250 (7 September): picked until 30 days on.
    expect(g.end).toBe('2027-10-07');
  });

  it('lifts garlic after 1400 degree days above 0 C from the spring equinox', () => {
    const garlic: Bio = {
      ...lettuce,
      days: 240,
      kill: 'h',
      end: 'bulb',
      pick: 6,
      strict: false,
      hardy: -35,
    };
    // Planted in autumn at a flat 10 C: from 20 March, 140 days, then six weeks.
    // (A year without 29 February: the model counts 365 days a year.)
    const g = plantedGrowth(
      'garlic',
      garlic,
      place({ temps: flat(10) }),
      '2026-10-15'
    );
    expect(g.ready).toBe('2027-08-07');
    expect(g.end).toBe('2027-09-18');
  });

  it('comes on sooner after a warmer spell than the typical year', () => {
    const cool = place({ temps: flat(10) });
    const typical = plantedGrowth('lettuce', lettuce, cool, '2027-05-01');
    const warm = { start: '2027-05-01', t: Array(30).fill(20) };
    const warmer = plantedGrowth('lettuce', lettuce, cool, '2027-05-01', warm);
    expect(warmer.ready! < typical.ready!).toBe(true);
  });
});

describe('a planted crop in a shaded bed', () => {
  const need = 0.54; // lettuce's: the share of an open spot's light for its full pace
  it('grows as in the open when its bed gets all the light', () => {
    const open = plantedGrowth('lettuce', lettuce, place({}), '2027-05-01');
    const lit = plantedGrowth(
      'lettuce',
      lettuce,
      place({}),
      '2027-05-01',
      null,
      0,
      {
        share: flat(1),
        need,
      }
    );
    expect(lit.ready).toBe(open.ready);
    expect(lit.end).toBe(open.end);
  });

  it('is ready later where the light it needs is short', () => {
    // In a bed with 30 % of an open spot's light lettuce grows at 30/54 of
    // its pace.
    const open = plantedGrowth('lettuce', lettuce, place({}), '2027-05-01');
    const shaded = plantedGrowth(
      'lettuce',
      lettuce,
      place({}),
      '2027-05-01',
      null,
      0,
      {
        share: flat(0.3),
        need,
      }
    );
    expect(shaded.ready! > open.ready!).toBe(true);
  });

  it('is not slowed where the shade leaves it the light it needs, even in a dim place', () => {
    // 60 % of the light, more than lettuce's 54 %, in a grey spring (9 MJ a
    // day) as in a bright one: how sunny a place is did not change how the
    // trials' crops took shade.
    const dim = place({ sun: flat(9) });
    const open = plantedGrowth('lettuce', lettuce, dim, '2027-05-01');
    const shaded = plantedGrowth(
      'lettuce',
      lettuce,
      dim,
      '2027-05-01',
      null,
      0,
      {
        share: flat(0.6),
        need,
      }
    );
    expect(shaded.ready).toBe(open.ready);
  });
});
