import { describe, expect, it } from 'vitest';

import type { Garden } from '@/lib/planner';
import {
  leafOf,
  level,
  season,
  shadows,
  sunlight,
  THROUGH,
  wallsOf,
  when,
} from '@/lib/sun';

/** A spot: a small section around a point. */
const spot = (x: number, y: number) => ({
  x0: x - 0.1,
  y0: y - 0.1,
  x1: x + 0.1,
  y1: y + 0.1,
});
const plot = (sides: Garden['sides'], north = 0): Garden => ({
  width: 20,
  length: 20,
  shape: 'rect',
  north,
  sides,
});
const MAR = 2,
  JUN = 5,
  DEC = 11;

describe('the sun a garden gets', () => {
  it('works nothing out with nothing along the sides', () => {
    expect(sunlight(plot(undefined), 47)).toBeNull();
    expect(sunlight(plot({}), 47)).toBeNull();
  });

  it('gives an open spot every hour the sun stands 10° up', () => {
    const light = sunlight(plot({ top: 'fence' }), 47)!;
    expect(light.open[JUN]).toBeGreaterThan(13);
    expect(light.open[JUN]).toBeLessThan(15);
    expect(light.months(spot(10, 10))[JUN].hours).toBeCloseTo(
      light.open[JUN],
      5
    );
    expect(when(light, light.months(spot(10, 10))[JUN], JUN)).toBe('allDay');
  });

  it('shades a spot by a fence to its south in spring, not at midsummer', () => {
    // North up: the bottom side faces south. 1 m north of a 2 m fence.
    const light = sunlight(plot({ bottom: 'fence' }), 47)!;
    const by = light.months(spot(10, 19));
    expect(by[MAR].hours).toBeLessThan(1);
    expect(level(light, spot(10, 19), MAR)).toBe('little');
    expect(by[JUN].hours).toBeGreaterThan(8);
    expect(level(light, spot(10, 19), JUN)).toBe('full');
  });

  it('shades the morning by a house to the east', () => {
    // North up: the right side faces east. 2 m from a 6 m house.
    const light = sunlight(plot({ right: 'house' }), 47)!;
    const m = light.months(spot(18, 10))[JUN];
    expect(m.am).toBeLessThan(1.5);
    expect(m.hours - m.am).toBeGreaterThan(6);
    expect(when(light, m, JUN)).toBe('afternoon');
  });

  it('reads the sides by true north, whichever way the plot faces', () => {
    // Turned so its top faces east, the house on its top side stands east.
    const a = sunlight(plot({ right: 'house' }), 47)!.months(spot(18, 10));
    const b = sunlight(plot({ top: 'house' }, 90), 47)!.months(spot(10, 2));
    expect(b[JUN].hours).toBeCloseTo(a[JUN].hours, 1);
    expect(b[JUN].am).toBeCloseTo(a[JUN].am, 1);
  });

  it('compares a winter month with the sun there is then', () => {
    const light = sunlight(plot({ top: 'fence' }), 52)!;
    expect(light.open[DEC]).toBeLessThan(8);
    expect(level(light, spot(10, 10), DEC)).toBe('full');
  });

  it('leaves out the months an open spot hardly gets the sun', () => {
    // Polar night at 69° N: no sun 10° up from December to February.
    const light = sunlight(plot({ top: 'fence' }), 69)!;
    expect(light.open[DEC]).toBe(0);
    expect(level(light, spot(10, 10), DEC)).toBeUndefined();
    expect(season(light, spot(10, 10), '2026-12-01')).toBeNull();
    expect(season(light, spot(10, 10), '2026-06-01')).toBeGreaterThan(6);
  });

  it('judges an autumn crop by the months it grows through', () => {
    // 2 m north of a fence to the south: dark from October to February.
    const light = sunlight(plot({ bottom: 'fence' }), 47)!;
    const by = spot(10, 18);
    const winter = season(light, by, '2026-10-20')!;
    // Too cold to grow from November to February: October, March, April.
    const growing = season(light, by, '2026-10-20', m => m < 10 && m > 1)!;
    expect(winter).toBeLessThan(3);
    expect(growing).toBeGreaterThan(winter + 2);
  });

  it('casts each side its shadow, as long as its height over the sun', () => {
    // Zug, 15 March, solar noon: the sun 40° up, due south. A 2 m fence on
    // the south side (y = 20) throws 2 / tan(40°) = 2.4 m of shade north.
    const [fence] = shadows(plot({ bottom: 'fence' }), 47.17, '2026-03-15', 12);
    const ys = fence.points.map(([, y]) => y);
    expect(Math.min(...ys)).toBeCloseTo(
      20 - 2 / Math.tan((40 * Math.PI) / 180),
      1
    );
    expect(Math.max(...ys)).toBeCloseTo(20, 5);
    expect(fence.through).toBe(0);
    // A 6 m house throws three times as far; in June far less.
    const [house] = shadows(plot({ bottom: 'house' }), 47.17, '2026-03-15', 12);
    expect(20 - Math.min(...house.points.map(([, y]) => y))).toBeCloseTo(
      3 * (20 - Math.min(...ys)),
      1
    );
    const [june] = shadows(plot({ bottom: 'house' }), 47.17, '2026-06-15', 12);
    expect(20 - Math.min(...june.points.map(([, y]) => y))).toBeLessThan(3);
    // Before sunrise there is no shadow to draw.
    expect(shadows(plot({ bottom: 'house' }), 47.17, '2026-12-15', 5)).toEqual(
      []
    );
  });

  it('lets the sun through trees, more of it when they are bare', () => {
    const inLeaf = () => 1,
      bare = () => 0;
    // 2 m north of a row of trees on the south side: in December the low sun
    // is behind them all day, so the spot gets just the share they let
    // through, three times as much with their leaves off.
    const by = spot(10, 18);
    const leafy = sunlight(plot({ bottom: 'trees' }), 47, inLeaf)!;
    const winter = sunlight(plot({ bottom: 'trees' }), 47, bare)!;
    expect(leafy.months(by)[DEC].hours).toBeCloseTo(
      THROUGH.leaf * leafy.open[DEC],
      5
    );
    expect(winter.months(by)[DEC].hours).toBeCloseTo(
      THROUGH.bare * winter.open[DEC],
      5
    );
    const [shade] = shadows(
      plot({ bottom: 'trees' }),
      47,
      '2026-06-15',
      12,
      inLeaf
    );
    expect(shade.through).toBeCloseTo(THROUGH.leaf, 5);
    // By the place's air: bare at 5 °C, in full leaf from 12 °C.
    const leaf = leafOf([1, 3, 6, 9, 13, 17, 19, 18, 15, 10, 5, 2]);
    expect(leaf(0)).toBe(0);
    expect(leaf(4)).toBe(1);
    expect(leaf(3)).toBeCloseTo(4 / 7, 5);
  });

  it("carries a side along an L's outline, round its cut corner", () => {
    const g: Garden = {
      width: 20,
      length: 20,
      shape: 'L',
      north: 0,
      sides: { right: 'house', bottom: 'fence' },
    };
    const walls = wallsOf(g);
    // The right side: the wide part's right edge, then the cut corner's edge
    // that faces right; the bottom side likewise.
    expect(walls.filter(w => w.side === 'right')).toMatchObject([
      { x0: 20, y0: 0, x1: 20, y1: 10 },
      { x0: 11, y0: 10, x1: 11, y1: 20 },
    ]);
    expect(walls.filter(w => w.side === 'bottom')).toMatchObject([
      { x0: 0, y0: 20, x1: 11, y1: 20 },
      { x0: 11, y0: 10, x1: 20, y1: 10 },
    ]);
    // 1 m west of the house on the cut corner's edge: its morning is shaded.
    const m = sunlight(g, 47)!.months(spot(10, 15))[JUN];
    expect(m.am).toBeLessThan(m.hours - m.am);
    // Each edge casts its own shadow.
    expect(shadows(g, 47, '2026-06-15', 9)).toHaveLength(4);
  });
});
