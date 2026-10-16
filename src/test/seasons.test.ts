import { describe, expect, it } from 'vitest';
import {
  monthRange,
  monthsLabel,
  seasonMonthSet,
  seasonOf,
  seasonPlace,
  seasonProgress,
  speciesSeasons,
} from '@/lib/seasons';

describe('seasons', () => {
  it('maps months to meteorological seasons', () => {
    expect(seasonOf(new Date(2026, 1, 28))).toBe('winter');
    expect(seasonOf(new Date(2026, 2, 1))).toBe('spring');
    expect(seasonOf(new Date(2026, 7, 31))).toBe('summer');
    expect(seasonOf(new Date(2026, 9, 16))).toBe('fall');
    expect(seasonOf(new Date(2026, 11, 1))).toBe('winter');
  });

  it('measures progress through a season, across the new year', () => {
    expect(seasonProgress(new Date(2026, 8, 1))).toBe(0);
    expect(seasonProgress(new Date(2026, 9, 16))).toBeCloseTo(0.5, 1);
    // January 15 is about half-way through the winter that began in December.
    expect(seasonProgress(new Date(2027, 0, 15))).toBeCloseTo(0.5, 1);
  });

  it('reads the catalog season field', () => {
    expect(speciesSeasons('summer-fall')).toEqual(['summer', 'fall']);
    expect(speciesSeasons('fall-winter')).toEqual(['fall', 'winter']);
    expect(speciesSeasons('winter-spring')).toEqual(['winter', 'spring']);
    expect(speciesSeasons('spring-fall')).toEqual(['spring', 'fall']);
    expect(speciesSeasons('summer')).toEqual(['summer']);
    expect(speciesSeasons(undefined)).toEqual([]);
    expect(speciesSeasons('monsoon')).toEqual([]);
  });

  it('places a species before, at, after or away from today', () => {
    expect(seasonPlace(['summer', 'fall'], 'fall')).toBe('now');
    expect(seasonPlace(['winter'], 'fall')).toBe('next');
    expect(seasonPlace(['spring', 'summer'], 'fall')).toBe('before');
    expect(seasonPlace(['spring'], 'fall')).toBe('later');
  });

  it('lists in-season months and names a range', () => {
    expect([...seasonMonthSet(['winter'])]).toEqual([11, 0, 1]);
    expect(monthRange([8, 10], 'en')).toBe('Sep–Nov');
  });

  it('joins neighbouring seasons into one span of months', () => {
    expect(monthsLabel(['fall', 'winter'], 'en')).toBe('Sep–Feb');
    expect(monthsLabel(['spring', 'fall'], 'en')).toBe('Mar–May, Sep–Nov');
    expect(monthsLabel(['summer'], 'en')).toBe('Jun–Aug');
  });
});
