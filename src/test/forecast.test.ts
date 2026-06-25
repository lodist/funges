import { describe, it, expect } from 'vitest';
import { FORECAST_DAYS, FORECAST_REGIONS, forecastDayLabel, setDayOnFillColor } from '@/lib/forecast';

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

  it('rewrites the interpolate input to the active day, preserving the ramp', () => {
    const expr = ['interpolate', ['linear'], ['get', 'mushroom_score_d1'], 0, '#fff', 10, '#800020'];
    const out = setDayOnFillColor(expr, 'mushroom', 3);
    expect(out[2]).toEqual(['get', 'mushroom_score_d3']);
    expect(out.slice(3)).toEqual([0, '#fff', 10, '#800020']); // ramp untouched
    expect(expr[2]).toEqual(['get', 'mushroom_score_d1']);     // input not mutated
  });
});
