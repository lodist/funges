import { describe, it, expect } from 'vitest';
import {
  groupByContinent,
  isExpired,
  CACHE_EXPIRY_MS,
  type ContinentId,
} from '@/lib/offlineCache';

function record(
  continent: ContinentId,
  url: string,
  sizeBytes: number,
  cachedAt: number
) {
  return { url, continent, blob: new Blob(), sizeBytes, cachedAt };
}

describe('groupByContinent', () => {
  it('sums sizes and keeps the earliest cachedAt per continent', () => {
    const result = groupByContinent([
      record('eu', 'a', 100, 1000),
      record('eu', 'b', 200, 2000),
      record('us', 'c', 50, 500),
    ]);

    expect(result).toEqual(
      expect.arrayContaining([
        { continent: 'eu', sizeBytes: 300, cachedAt: 1000 },
        { continent: 'us', sizeBytes: 50, cachedAt: 500 },
      ])
    );
  });

  it('returns an empty array for no records', () => {
    expect(groupByContinent([])).toEqual([]);
  });
});

describe('isExpired', () => {
  it('is false right after caching', () => {
    expect(isExpired(1000, 1000)).toBe(false);
  });

  it('is false just under the expiry window', () => {
    expect(isExpired(1000, 1000 + CACHE_EXPIRY_MS - 1)).toBe(false);
  });

  it('is true once the expiry window has passed', () => {
    expect(isExpired(1000, 1000 + CACHE_EXPIRY_MS + 1)).toBe(true);
  });
});
