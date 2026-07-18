import { describe, expect, it } from 'vitest';
import { LABEL_BANDS, populationStepExpression } from '@/config/labelBands';

describe('LABEL_BANDS', () => {
  it('exports thresholds in a consistent shape', () => {
    expect(LABEL_BANDS.country.minzoom).toBeLessThan(
      LABEL_BANDS.country.maxzoom
    );
    expect(LABEL_BANDS.region.minzoom).toBeLessThan(LABEL_BANDS.region.maxzoom);
    expect(LABEL_BANDS.city.minzoom).toBeLessThan(LABEL_BANDS.city.maxzoom);
    expect(LABEL_BANDS.settlement.minzoom).toBeLessThan(
      LABEL_BANDS.settlement.maxzoom
    );
    expect(LABEL_BANDS.city.populationSteps.length).toBeGreaterThan(0);
    expect(LABEL_BANDS.settlement.populationSteps.length).toBeGreaterThan(0);
  });

  it('has no zoom gap between the country/region band and the settlement band', () => {
    // At every zoom between the settlement layer's minzoom and the
    // country/region layers' maxzoom, at least one orienting label band is
    // visible: either country/region (below their maxzoom) or settlement
    // (above its minzoom).
    expect(LABEL_BANDS.country.maxzoom).toBeGreaterThanOrEqual(
      LABEL_BANDS.settlement.minzoom
    );
    expect(LABEL_BANDS.region.maxzoom).toBeGreaterThanOrEqual(
      LABEL_BANDS.settlement.minzoom
    );
  });

  it('lowers the settlement population threshold as zoom increases (no plateau that reopens the gap)', () => {
    const sorted = [...LABEL_BANDS.settlement.populationSteps].sort(
      (a, b) => a.zoom - b.zoom
    );
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].population).toBeLessThanOrEqual(
        sorted[i - 1].population
      );
    }
  });
});

describe('populationStepExpression', () => {
  it('builds a MapLibre step expression ordered by zoom', () => {
    const expr = populationStepExpression([
      { zoom: 10, population: 5000 },
      { zoom: 0, population: 50000 },
      { zoom: 8, population: 20000 },
    ]);
    expect(expr).toEqual([
      'step',
      ['zoom'],
      ['>=', ['get', 'population'], 50000],
      8,
      ['>=', ['get', 'population'], 20000],
      10,
      ['>=', ['get', 'population'], 5000],
    ]);
  });
});
