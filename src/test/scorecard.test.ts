import { describe, expect, it } from 'vitest';
import { areaKey, formatShare, timesInTen } from '@/lib/scorecard';

describe('scorecard helpers', () => {
  it('says a share in tens, rounded', () => {
    expect(timesInTen(0.709)).toBe(7);
    expect(timesInTen(0.588)).toBe(6);
    expect(timesInTen(0.5)).toBe(5);
  });

  it('names where the pooled finds came from', () => {
    expect(areaKey(['NE', 'SE'])).toBe('home.live.europe');
    expect(areaKey(['USE'])).toBe('home.live.northAmerica');
    expect(areaKey(['NE', 'USW'])).toBe('data.scorecard.everywhere');
  });

  it('rounds to whole percent in the reader language', () => {
    expect(formatShare(0.709, 'en')).toBe('71%');
    expect(formatShare(0.709, 'de')).toBe('71 %');
  });
});
