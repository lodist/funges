import { describe, expect, it } from 'vitest';
import {
  type Bio,
  type GrowthPlace,
  daily,
  dayIndex,
  growthPlace,
  plantedGrowth,
} from '@/lib/growth';
import type { PlaceYear } from '@/lib/huerta-wire';

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

  it('picks a tender crop for its weeks where the nights are warm all year, over New Year', () => {
    // Warm all year reads 1 to 365, and 365 is no end: put in in December in
    // Miami, a tomato is picked for its 16 weeks, not until late January.
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
    const miami: PlaceYear = {
      place: 'Somewhere warm',
      lat: 25.8,
      crops: {},
      temps: flat(24),
      sun: flat(20),
      climate: {
        frost: [0, 0],
        hard: [0, 0],
        warm10: [1, 365],
        warm13: [1, 365],
        low: 12,
        light: 0,
      },
    };
    const g = plantedGrowth(
      'tomato',
      tomato,
      growthPlace(miami)!,
      '2027-12-01'
    );
    const weeks = (Date.parse(g.end!) - Date.parse(g.ready!)) / (7 * 864e5);
    expect(weeks).toBe(16);
  });

  it('ends a tender crop where no frost comes when the air cools out of its season', () => {
    // Porto's normals, no frost, warm nights all year: nothing else ends a
    // tomato before the winter. Its field minimum (65 F = 18.3 C) less 2 C:
    // picked until the day before the typical air first falls under 16.3 C.
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
      tmin: 18.3333,
    };
    const temps = [
      9.8, 10.8, 11.7, 13.9, 16.7, 18.9, 21.5, 21.8, 19.8, 17.3, 13.1, 10.9,
    ];
    const porto = place({ lat: 41.2, temps, light: 0, warmEnd: 0, low: 2 });
    const g = plantedGrowth('tomato', tomato, porto, '2027-05-01');
    const air = daily(temps);
    const ready = dayIndex(g.ready!);
    let cool = ready;
    while (air[cool % 365] >= 18.3333 - 2) cool++;
    expect(dayIndex(g.end!)).toBe(cool - 1);
    // Year files from before the field minimum: picked as before, for longer.
    const { tmin: _, ...before } = tomato;
    const old = plantedGrowth('tomato', before, porto, '2027-05-01');
    expect(old.end! > g.end!).toBe(true);
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

  it('ends melons when the air cools out of their season, frost or not', () => {
    // Zug: the first light frost on 7 November, the warm nights end on 28
    // September. A melon planted on 1 July is picked from late August until
    // the typical air first falls under its season air (its field minimum,
    // 15.6 C, less 2 C), early in October.
    const melon: Bio = {
      tb: 10,
      tlo: 18.3333,
      thi: 23.8889,
      tmax: 32.2222,
      days: 64,
      kill: 't',
      end: 'frost',
      pick: 6.2857,
      strict: false,
      hardy: null,
      night: true,
      tmin: 15.5556,
    };
    const temps = [
      1.96, 3.71, 6.05, 9.56, 13.31, 18.62, 20.08, 20.23, 16.25, 12.04, 6.37,
      3.39,
    ];
    const sun = [
      4.29, 7.15, 12.19, 17.15, 18.18, 19.92, 19.51, 17.11, 12.17, 7.85, 4.78,
      3.48,
    ];
    const zug = place({
      lat: 47.16,
      temps,
      sun,
      light: 311,
      first0: 322,
      firstm3: 334,
      warmEnd: 271,
      low: -6.8,
    });
    const g = plantedGrowth('melon', melon, zug, '2027-07-01');
    const air = daily(temps);
    let cool = dayIndex(g.ready!);
    while (air[cool % 365] >= 15.5556 - 2) cool++;
    expect(dayIndex(g.end!)).toBe(cool - 1);
    // A courgette with the same needs is picked for its weeks (44 days), on
    // into the cool of October: the air does not end it.
    const courgette = plantedGrowth('courgette', melon, zug, '2027-07-01');
    expect(dayIndex(courgette.end!)).toBe(dayIndex(courgette.ready!) + 44);
    expect(courgette.end! > g.end!).toBe(true);
  });

  it('lifts onions once their type bulbs: after a mild winter in spring, after a cold one at midsummer', () => {
    const onion: Bio = {
      tb: 4.4,
      tlo: 12.7778,
      thi: 23.8889,
      tmax: 29.4444,
      days: 120,
      kill: 'h',
      end: 'bulb',
      pick: 4,
      strict: false,
      hardy: -12,
      night: false,
      tmin: 7.2222,
    };
    // Lisbon: the days never reach a long-day onion's 15 h and no day's normal
    // is under 5 C, so the intermediate type is grown (13.5 h on 24 April).
    // Sown on 1 September, it is lifted six weeks after that, not in its first
    // winter by its warmth alone.
    const temps = [
      12, 12.6, 13.3, 15.1, 17.4, 19.5, 21.4, 21.8, 20.6, 18.7, 15, 13,
    ];
    const lisbon = place({ lat: 38.76, temps, light: 0, warmEnd: 0, low: 4.8 });
    expect(plantedGrowth('onion', onion, lisbon, '2026-09-01').ready).toBe(
      '2027-06-05'
    );
    // The same days with a cold winter keep the long-day type, which never
    // gets its 15 h there and bulbs at midsummer: 21 June and six weeks.
    const cold = place({
      lat: 38.76,
      temps: [2, 2, ...temps.slice(2, 11), 2],
      light: 0,
      warmEnd: 0,
      low: -10,
    });
    expect(plantedGrowth('onion', onion, cold, '2027-03-01').ready).toBe(
      '2027-08-02'
    );
  });

  it('comes on sooner after a warmer spell than the typical year', () => {
    const cool = place({ temps: flat(10) });
    const typical = plantedGrowth('lettuce', lettuce, cool, '2027-05-01');
    const warm = { start: '2027-05-01', t: Array(30).fill(20) };
    const warmer = plantedGrowth('lettuce', lettuce, cool, '2027-05-01', warm);
    expect(warmer.ready! < typical.ready!).toBe(true);
  });

  it("keeps the typical year's seasons through a cold snap and a hot day", () => {
    // Kale put in in April. Three days at 2 C in May once read as its winter
    // (ready at once, gone to seed three weeks on) and a day at 30 C in July
    // as heat that ends it; they only slow its warmth.
    const kale: Bio = {
      ...lettuce,
      days: 55,
      kill: 'h',
      end: 'winter',
      pick: 30,
      strict: false,
      hardy: -15,
    };
    const zug = place({
      temps: [0, 1, 5, 9, 13, 17, 19, 19, 15, 10, 5, 1],
      sun: [4, 7, 12, 17, 18, 20, 19, 17, 12, 8, 5, 3],
      light: 306,
      first0: 319,
      firstm3: 329,
      low: -8,
    });
    const t = Array<number | null>(100).fill(null);
    t[20] = t[21] = t[22] = 2; // 5-7 May
    t[96] = 30; // 20 July
    const typical = plantedGrowth('kale', kale, zug, '2027-04-15');
    const real = plantedGrowth('kale', kale, zug, '2027-04-15', {
      start: '2027-04-15',
      t,
    });
    expect(typical.end! > '2028-03-01').toBe(true); // picked through the winter
    expect(real.end).toBe(typical.end);
    expect(real.ready! > typical.ready!).toBe(true);
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

describe('a planted crop south of the equator', () => {
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
  const temps = [5, 6, 10, 14, 18, 22, 24, 24, 20, 14, 9, 6];
  const year = (lat: number, months: number[], half: number): PlaceYear => {
    const day = (d: number) => (d > 0 ? ((d - 1 + half) % 365) + 1 : d);
    return {
      place: 'Somewhere',
      lat,
      crops: {},
      temps: months,
      sun: months.map(t => t / 2 + 5),
      climate: {
        frost: [day(290), day(110)],
        hard: [day(310), day(90)],
        warm10: [day(150), day(250)],
        warm13: null,
        low: -6,
        light: day(280),
      },
    };
  };

  it('grows as its northern twin does, half a year on', () => {
    // The south's months are the north's half a year on, and so are its days.
    const north = growthPlace(year(47, temps, 0))!;
    const south = growthPlace(
      year(-47, [...temps.slice(6), ...temps.slice(0, 6)], 181)
    )!;
    const n = plantedGrowth('tomato', tomato, north, '2027-05-20');
    const s = plantedGrowth('tomato', tomato, south, '2027-11-19');
    const gap = (a: string, b: string) =>
      Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
    expect(south.south).toBe(true);
    expect(Math.abs(gap(n.ready!, s.ready!) - 183)).toBeLessThanOrEqual(3);
    expect(Math.abs(gap(n.end!, s.end!) - 183)).toBeLessThanOrEqual(3);
    expect(s.progress('2028-01-15')).toBeCloseTo(n.progress('2027-07-16'), 1);
  });

  it('picks a tender crop for its weeks where the nights are warm all year, over the turn of the year', () => {
    // Warm all year reads 1 to 365: neither the south's turn (30 June, in
    // Darwin's dry season) nor New Year (Miami's winter crop) ends it.
    const tropics = (lat: number): PlaceYear => ({
      place: 'Somewhere warm',
      lat,
      crops: {},
      temps: flat(24),
      sun: flat(20),
      climate: {
        frost: [0, 0],
        hard: [0, 0],
        warm10: [1, 365],
        warm13: [1, 365],
        low: 12,
        light: 0,
      },
    });
    const gap = (a: string, b: string) =>
      Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
    for (const [lat, planted] of [
      [-12.5, '2027-05-15'],
      [25.8, '2027-12-01'],
    ] as const) {
      const g = plantedGrowth(
        'tomato',
        tomato,
        growthPlace(tropics(lat))!,
        planted
      );
      expect(gap(g.ready!, g.end!)).toBe(16 * 7);
    }
  });

  it('ends a tender crop where no frost comes when the autumn air cools out of its season', () => {
    // Auckland: no frost, and ERA5-Land reads its nights as warm all year, so
    // only the cooling air ends a tomato: before May, not through the winter.
    const auckland: PlaceYear = {
      place: 'Parnell',
      lat: -36.9,
      crops: {},
      temps: [
        19.6, 20.1, 18.6, 16.8, 14.5, 12.7, 11.8, 11.6, 12.7, 14.2, 16.3, 18.4,
      ],
      sun: [24, 21, 17, 12, 9, 7, 8, 10, 14, 18, 22, 24],
      climate: {
        frost: [0, 0],
        hard: [0, 0],
        warm10: [1, 365],
        warm13: [126, 311],
        low: 5,
        light: 0,
      },
    };
    const where = growthPlace(auckland)!;
    const g = plantedGrowth(
      'tomato',
      { ...tomato, tmin: 18.3333 },
      where,
      '2027-12-15'
    );
    const old = plantedGrowth('tomato', tomato, where, '2027-12-15');
    expect(g.end! < '2028-05-01').toBe(true);
    expect(old.end! > g.end!).toBe(true);
  });
});
