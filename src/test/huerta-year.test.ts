import { describe, expect, it } from 'vitest';

import { months, nextMonth } from '@/hooks/use-huerta-year';

describe("a place's year", () => {
  it('reads a month mask, January first', () => {
    expect(months(0b1000000000101)).toEqual([
      true,
      false,
      true,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it('finds the next month a crop goes in, wrapping into next year', () => {
    const tomato = (1 << 4) | (1 << 5); // May, June
    expect(nextMonth(tomato, 9)).toBe(4); // from October: back in May
    expect(nextMonth(tomato, 4)).toBe(5);
    expect(nextMonth(0, 3)).toBeNull();
  });
});
