import { describe, it, expect } from 'vitest';
import { FORECAST_DAYS, FORECAST_REGIONS, forecastDayLabel, setForecastFraction } from '@/lib/forecast';

describe('forecast lib', () => {
  it('has a 7-day window and 4 regions', () => {
    expect(FORECAST_DAYS).toBe(7);
    expect(FORECAST_REGIONS).toEqual(['ne', 'se', 'use', 'usw']);
  });

  it('labels a day as D/M offset from the base date', () => {
    const base = new Date(2026, 5, 25); // 25 Jun 2026 (month is 0-based)
    expect(forecastDayLabel(base, 0)).toBe('25/6');
    expect(forecastDayLabel(base, 6)).toBe('1/7');
  });

  it('builds a d0->d6 interpolation input at the given fraction', () => {
    const expr = ['interpolate', ['linear'], ['get', 'mushroom_score'], 0, '#fff', 10, '#800020'];
    const out = setForecastFraction(expr, 'mushroom', 0.5);
    expect(out[2]).toEqual([
      '+',
      ['coalesce', ['get', 'mushroom_score'], 0],
      ['*', 0.5, ['-',
        ['coalesce', ['get', 'mushroom_score_d6'], 0],
        ['coalesce', ['get', 'mushroom_score'], 0],
      ]],
    ]);
    expect(out.slice(3)).toEqual([0, '#fff', 10, '#800020']); // ramp preserved
    expect(expr[2]).toEqual(['get', 'mushroom_score']);        // input not mutated
  });
});
