import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  ATLAS_RAMP,
  blendMonths,
  curveAt,
  dayOfYear,
  inWindow,
  projection,
  seasonWindows,
} from '@/lib/season-atlas';

describe('the season atlas helpers', () => {
  it('blends a day between the month mids around it', () => {
    const [a, b, f] = blendMonths(300); // 27 October: between 15 Oct (288) and 15 Nov (319)
    expect([a, b]).toEqual([9, 10]);
    expect(f).toBeCloseTo(12 / 31);
  });

  it('wraps the blend around New Year', () => {
    const [a, b, f] = blendMonths(1);
    expect([a, b]).toEqual([11, 0]);
    expect(f).toBeCloseTo(17 / 31);
    expect(blendMonths(360).slice(0, 2)).toEqual([11, 0]);
  });

  it('reads a curve on a day', () => {
    const curve = Array(12).fill(0);
    curve[8] = 1;
    expect(curveAt(curve, 258)).toBe(1);
    expect(curveAt(curve, 273)).toBeCloseTo(0.5);
  });

  it('finds one season, two seasons and one across New Year', () => {
    const autumn = [0, 0, 0, 0, 0, 0, 0.3, 0.8, 1, 0.6, 0.5, 0.1];
    expect(seasonWindows(autumn)).toEqual([[7, 10]]);
    const twice = [0, 0, 0, 0, 0.9, 0.6, 0, 0, 0.7, 1, 0.5, 0];
    expect(seasonWindows(twice)).toEqual([
      [4, 5],
      [8, 10],
    ]);
    const winter = [1, 0.7, 0.2, 0, 0, 0, 0, 0, 0, 0, 0.3, 0.6];
    expect(seasonWindows(winter)).toEqual([[11, 1]]);
    expect(inWindow([11, 1], 0)).toBe(true);
    expect(inWindow([11, 1], 5)).toBe(false);
    expect(seasonWindows(Array(12).fill(1))).toEqual([[0, 11]]);
  });

  it('counts 29 February as the 28th', () => {
    expect(dayOfYear(new Date(2026, 0, 1))).toBe(1);
    expect(dayOfYear(new Date(2026, 11, 31))).toBe(365);
    expect(dayOfYear(new Date(2028, 2, 1))).toBe(60);
    expect(dayOfYear(new Date(2028, 11, 31))).toBe(365);
  });

  it('colours the legend and bars as the build colours the map', () => {
    // The map frames are baked by the site build; a ramp edited on one side only
    // would give the map and its legend different colours.
    const script = readFileSync('scripts/build_season_atlas_site.py', 'utf8');
    const baked = script.match(/^RAMP = \[([^\]]*)\]/m)?.[1] ?? '';
    expect([...baked.matchAll(/"(#[0-9a-f]{6})"/g)].map(m => m[1])).toEqual(
      ATLAS_RAMP
    );
  });

  it('keeps a place in shape and within the height it is given', () => {
    const p = projection([0, 40, 10, 50], 1000, 2000);
    expect(p.width).toBe(1000);
    expect(p.height).toBeCloseTo(1000 / Math.cos((45 * Math.PI) / 180), 6);
    const tall = projection([0, 40, 10, 50], 1000, 500);
    expect(tall.height).toBeCloseTo(500);
    expect(tall.x(10)).toBeCloseTo(tall.width);
    expect(tall.y(40)).toBeCloseTo(500);
  });
});
