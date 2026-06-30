import { describe, it, expect } from 'vitest';
import {
  FORECAST_DAYS,
  FORECAST_REGIONS,
  forecastDayLabel,
  setForecastFraction,
  interpolateScores,
} from '@/lib/forecast';

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
    const expr = [
      'interpolate',
      ['linear'],
      ['get', 'mushroom_score'],
      0,
      '#fff',
      10,
      '#800020',
    ];
    const out = setForecastFraction(expr, 'mushroom', 0.5);
    expect(out[2]).toEqual([
      '+',
      ['coalesce', ['get', 'mushroom_score'], 0],
      [
        '*',
        0.5,
        [
          '-',
          [
            'coalesce',
            ['get', 'mushroom_score_d6'],
            ['get', 'mushroom_score'],
            0,
          ],
          ['coalesce', ['get', 'mushroom_score'], 0],
        ],
      ],
    ]);
    expect(out.slice(3)).toEqual([0, '#fff', 10, '#800020']); // ramp preserved
    expect(expr[2]).toEqual(['get', 'mushroom_score']); // input not mutated
  });

  it('interpolates feature scores to a fraction and folds away _d6', () => {
    const props = {
      mushroom_score: 6,
      mushroom_score_d6: 0,
      chant_score: 4,
      name: 'x',
    };
    const out = interpolateScores(props, 0.5);
    expect(out.mushroom_score).toBe(3); // 6 + 0.5*(0-6)
    expect(out.chant_score).toBe(4); // no _d6 -> flat
    expect(out.mushroom_score_d6).toBeUndefined();
    expect(out.name).toBe('x'); // non-score passthrough
  });
});
