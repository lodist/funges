import { describe, expect, it } from 'vitest';
import {
  BLOOM_CODE,
  BLOOM_IDLE,
  BLOOM_RAMP,
  bloomFillColor,
  bloomGradientCss,
  bloomInSeason,
  bloomLayerId,
  bloomStatus,
  bloomTilesUrl,
  bloomWhen,
  formatBloomDate,
  isBloomLayer,
  unixDay,
} from '@/lib/bloom';
import { isMapSpecies } from '@/data/species';
import { layerRegion } from '@/store/mapStore';
import type { TFunction } from 'i18next';

describe('bloom days', () => {
  it('counts local calendar days since 1970-01-01', () => {
    expect(unixDay(new Date(1970, 0, 1, 23, 30))).toBe(0);
    expect(unixDay(new Date(1970, 0, 2))).toBe(1);
    // What backend/bloom.py writes for 6 April 2027: (date - 1970-01-01).days
    expect(unixDay(new Date(2027, 3, 6))).toBe(20914);
  });

  it('formats a peak day as a date in the given language', () => {
    expect(formatBloomDate(20914, 'en')).toBe('April 6');
    expect(formatBloomDate(20914, 'de')).toBe('6. April');
    expect(formatBloomDate(20914, 'en', 'short')).toBe('Apr 6');
  });

  it('is in season from February to June, when the backend builds it', () => {
    expect(bloomInSeason(new Date(2027, 0, 31))).toBe(false);
    expect(bloomInSeason(new Date(2027, 1, 1))).toBe(true);
    expect(bloomInSeason(new Date(2027, 5, 30))).toBe(true);
    expect(bloomInSeason(new Date(2027, 6, 1))).toBe(false);
  });
});

describe('bloomStatus', () => {
  const peak = 100;
  it.each([
    [70, 'later'],
    [79, 'soon'],
    [97, 'soon'],
    [98, 'peak'],
    [102, 'peak'],
    [103, 'past'],
    [114, 'past'],
    [115, 'over'],
  ])('on day %i is %s', (day, status) => {
    expect(bloomStatus(peak, day)).toBe(status);
  });

  it('treats a cell without a peak as over, so a click lists nothing', () => {
    expect(bloomStatus(Number(undefined), 100)).toBe('over');
  });
});

describe('bloomFillColor', () => {
  it('colours by days to peak on the given day', () => {
    const expression = bloomFillColor(20900) as unknown[];
    expect(expression.slice(0, 3)).toEqual([
      'interpolate',
      ['linear'],
      ['-', ['get', 'peak'], 20900],
    ]);
    expect(expression.slice(3)).toEqual(BLOOM_RAMP.flat());
  });

  it('is transparent once a place is over, so last season reads as nothing', () => {
    expect(BLOOM_RAMP[0][1]).toMatch(/, 0\)$/);
  });

  it('draws the legend from later to past: yellow, pink, then green', () => {
    const css = bloomGradientCss();
    expect(css.startsWith(`linear-gradient(to right, ${BLOOM_IDLE} 0%`)).toBe(
      true
    );
    expect(css).toContain('#c2185b');
    expect(css.endsWith('rgba(156, 196, 148, 0) 100%)')).toBe(true);
  });

  it('never paints the days after the peak pink', () => {
    const past = BLOOM_RAMP.filter(([toPeak]) => toPeak < -2);
    expect(past.length).toBeGreaterThan(0);
    for (const [, colour] of past) {
      expect(colour).not.toMatch(/#c2185b|216, 27, 96/);
    }
  });
});

describe('bloomWhen', () => {
  const t = ((key: string, options?: { count?: number }) =>
    options?.count === undefined
      ? key
      : `${key}:${options.count}`) as unknown as TFunction;

  it('says how far the peak is', () => {
    expect(bloomWhen(t, 110, 100)).toBe('bloom.inDays:10');
    expect(bloomWhen(t, 101, 100)).toBe('bloom.atPeak');
    expect(bloomWhen(t, 95, 100)).toBe('bloom.daysAgo:5');
  });
});

describe('the bloom layer on the map', () => {
  it('is a valid map code without a catalog entry', () => {
    expect(isMapSpecies(BLOOM_CODE)).toBe(true);
  });

  it('names its layers like a species fill, so region matching applies', () => {
    expect(bloomLayerId('usw')).toBe('cherry_blossom_usw');
    expect(layerRegion(bloomLayerId('usw'))).toBe('usw');
    expect(isBloomLayer('cherry_blossom_ne')).toBe(true);
    expect(isBloomLayer('mushroom_ne')).toBe(false);
    expect(bloomTilesUrl('se')).toBe(
      'pmtiles://https://data.fung.es/EU/SE/se_bloom.pmtiles'
    );
  });
});
