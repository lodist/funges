import { describe, expect, it } from 'vitest';

import { SAMPLE_ADVICE, type CropNeeds } from '@/lib/huerta';
import type { Garden } from '@/lib/planner';
import { forSoil, gardenSoil } from '@/lib/soil';

const valencia = { ph: 7.8, clay: 30, sand: 34 };
const garden: Garden = { width: 6, length: 4.5, shape: 'rect' };
const need = (min: number): CropNeeds => ({
  frost: 'half_hardy',
  soil: [min, null],
  night: null,
  days: 70,
});

describe("the garden's soil", () => {
  it("takes the gardener's word, else the map's at the place", () => {
    expect(gardenSoil(garden, valencia)).toEqual({
      texture: 'clay',
      acidity: 'alkaline',
    });
    expect(gardenSoil({ ...garden, ground: 'ground' }, valencia)).toEqual({
      texture: 'clay',
      acidity: 'alkaline',
    });
    expect(
      gardenSoil({ ...garden, ground: 'ground', soil: 'sandy' }, valencia)
    ).toEqual({ texture: 'sandy', acidity: 'alkaline' });
    // Long Island's sandy loam gardens light; Madrid's, with more clay, loam.
    expect(gardenSoil(garden, { ph: 4.9, clay: 13, sand: 55 }).texture).toBe(
      'sandy'
    );
    expect(gardenSoil(garden, { ph: 7.3, clay: 22, sand: 48 }).texture).toBe(
      'loam'
    );
    expect(gardenSoil({ ...garden, ground: 'ground' }, null)).toEqual({
      texture: 'loam',
      acidity: 'neutral',
    });
  });

  it('sows a little sooner into sand and later into clay, in spring only', () => {
    const needs = { carrot: need(7), lettuce: need(5) };
    const spring = {
      ...SAMPLE_ADVICE,
      soil: 6.2,
      crops: {
        ...SAMPLE_ADVICE.crops,
        carrot: 'wait_soil' as const,
        lettuce: 'now' as const,
      },
    };
    const on = (texture: 'sandy' | 'loam' | 'clay', day: string) =>
      forSoil(spring, needs, texture, day).crops;
    expect(on('sandy', '2027-03-20').carrot).toBe('now');
    expect(on('loam', '2027-03-20').carrot).toBe('wait_soil');
    expect(on('clay', '2027-03-20').lettuce).toBe('wait_soil');
    expect(on('sandy', '2027-03-20').lettuce).toBe('now');
    // Autumn: as the place's.
    expect(forSoil(spring, needs, 'sandy', '2027-10-20')).toBe(spring);
  });
});
