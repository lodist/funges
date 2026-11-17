import { describe, expect, it } from 'vitest';
import { formatShare, timesInTen } from '@/lib/scorecard';

describe('scorecard helpers', () => {
  it('says a share in tens, rounded', () => {
    expect(timesInTen(0.709)).toBe(7);
    expect(timesInTen(0.588)).toBe(6);
    expect(timesInTen(0.5)).toBe(5);
  });

  it('never says 10 times in 10, which reads as always', () => {
    expect(timesInTen(0.987)).toBe(9);
    expect(timesInTen(1)).toBe(9);
  });

  it('rounds to whole percent in the reader language', () => {
    expect(formatShare(0.709, 'en')).toBe('71%');
    expect(formatShare(0.709, 'de')).toBe('71 %');
  });
});
