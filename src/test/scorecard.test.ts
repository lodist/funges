import { describe, expect, it } from 'vitest';
import { formatShare, pooledTally, type Scorecard } from '@/lib/scorecard';

const card: Scorecard = {
  updated_at: '2026-10-23',
  since: '2026-10-05',
  until: '2026-10-18',
  regions: {
    NE: { finds: 300, top_quarter: 0.6, species: {} },
    SE: { finds: 100, top_quarter: 0.2, species: {} },
  },
};

describe('pooledTally', () => {
  it('weighs each region by its finds', () => {
    expect(pooledTally(card, ['NE', 'SE'])).toEqual({
      finds: 400,
      top_quarter: (300 * 0.6 + 100 * 0.2) / 400,
    });
  });

  it('says nothing for regions without enough finds', () => {
    expect(pooledTally(card, ['USE', 'USW'])).toBeNull();
  });
});

describe('formatShare', () => {
  it('rounds to whole percent in the reader language', () => {
    expect(formatShare(0.533, 'en')).toBe('53%');
    expect(formatShare(0.533, 'de')).toBe('53 %');
  });
});
