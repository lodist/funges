import { describe, expect, it } from 'vitest';
import { layerRegion, resolveDataNerdRegion } from '@/store/mapStore';

describe('layerRegion', () => {
  it.each([
    ['mushroom_ne', 'ne'],
    ['mushroom_se', 'se'],
    ['mushroom_use', 'use'],
    ['mushroom_usw', 'usw'],
    ['walnut_se_numbers', 'se'],
  ])('extracts %s -> %s', (id, expected) => {
    expect(layerRegion(id)).toBe(expected);
  });

  it('returns null for a layer id with no known region suffix', () => {
    expect(layerRegion('background')).toBeNull();
  });
});

describe('resolveDataNerdRegion', () => {
  it.each([
    ['mushroom_ne', 'NE'],
    ['mushroom_se', 'SE'],
    ['mushroom_use', 'USE'],
    ['mushroom_usw', 'USW'],
    ['walnut_se_numbers', 'SE'],
  ])('resolves %s -> %s', (id, expected) => {
    expect(resolveDataNerdRegion(id)).toBe(expected);
  });

  it('returns null for an unrecognized layer id (no false-positive region match)', () => {
    expect(resolveDataNerdRegion('background')).toBeNull();
  });
});
