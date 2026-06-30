import { describe, expect, it } from 'vitest';
import { queryRouteDishData } from '@/lib/route-to-dish';

describe('queryRouteDishData', () => {
  it('prefers a multi-ingredient stop and ranks fully covered recipes first', () => {
    const mapStub = {
      getStyle: () => ({
        layers: [
          { id: 'chickweed-fill', source: 'forage', 'source-layer': 'scores' },
          { id: 'sorrel-fill', source: 'forage', 'source-layer': 'scores' },
          { id: 'walnut-fill', source: 'forage', 'source-layer': 'scores' },
        ],
      }),
      querySourceFeatures: () => [
        {
          id: 'shared-stop',
          type: 'Feature',
          properties: {
            Chickweed: 6.1,
            Sorrel: 6.5,
            'Wild Walnut': 7.2,
          },
          geometry: {
            type: 'Point',
            coordinates: [7.1, 47.1],
          },
        },
        {
          id: 'sorrel-only',
          type: 'Feature',
          properties: {
            Sorrel: 7.5,
          },
          geometry: {
            type: 'Point',
            coordinates: [7.4, 47.4],
          },
        },
      ],
    };

    const result = queryRouteDishData({
      map: mapStub as never,
      recipes: [
        {
          id: 'salad',
          title: 'Wild Salad',
          species: ['chickweed', 'sorrel', 'walnut'],
        },
        {
          id: 'drink',
          title: 'Summer Cooler',
          species: ['strawberry', 'sorrel'],
        },
      ],
      start: [7, 47],
      minScore: 5.5,
      radiusKm: 100,
    });

    expect(result.sourceGroups).toHaveLength(1);
    expect(result.candidateStops).toHaveLength(2);
    expect(result.plans[0]?.recipeId).toBe('salad');
    expect(result.plans[0]?.fullyCovered).toBe(true);
    expect(result.plans[0]?.orderedStops).toHaveLength(1);
    expect(result.plans[0]?.coveredSpecies).toEqual([
      'chickweed',
      'sorrel',
      'walnut',
    ]);
    expect(result.plans[1]?.fullyCovered).toBe(false);
    expect(result.plans[1]?.missingSpecies).toEqual(['strawberry']);
  });

  it('excludes forecast (_fc) and numbers layers from the source groups', () => {
    const mapStub = {
      getStyle: () => ({
        layers: [
          {
            id: 'mushroom_ne',
            source: 'overlay-ne',
            'source-layer': 'ne_scores',
          },
          {
            id: 'mushroom_ne_fc',
            source: 'forecast-ne',
            'source-layer': 'ne_forecast',
          },
          {
            id: 'mushroom_numbers_ne',
            source: 'overlay-ne',
            'source-layer': 'ne_numbers',
          },
        ],
      }),
      querySourceFeatures: () => [],
    };

    const result = queryRouteDishData({
      map: mapStub as never,
      recipes: [{ id: 'r', title: 'Porcini Risotto', species: ['mushroom'] }],
      start: [7, 47],
      minScore: 5.5,
      radiusKm: 100,
    });

    expect(result.sourceGroups).toHaveLength(1);
    expect(result.sourceGroups[0]?.sourceId).toBe('overlay-ne');
    expect(result.sourceGroups[0]?.sourceLayer).toBe('ne_scores');
  });

  it('reads forecast (_fc) layers and interpolates scores when frac > 0', () => {
    const mapStub = {
      getStyle: () => ({
        layers: [
          {
            id: 'mushroom_ne',
            source: 'overlay-ne',
            'source-layer': 'ne_scores',
          },
          {
            id: 'mushroom_ne_fc',
            source: 'forecast-ne',
            'source-layer': 'ne_forecast',
          },
        ],
      }),
      // Both sources hold the same stop; only the _fc twin carries `_score_d6`.
      querySourceFeatures: (sourceId: string) =>
        sourceId === 'forecast-ne'
          ? [
              {
                id: 'stop',
                type: 'Feature',
                properties: { mushroom_score: 6.0, mushroom_score_d6: 0.0 },
                geometry: { type: 'Point', coordinates: [7.1, 47.1] },
              },
            ]
          : [
              {
                id: 'stop',
                type: 'Feature',
                properties: { mushroom_score: 6.0 },
                geometry: { type: 'Point', coordinates: [7.1, 47.1] },
              },
            ],
    };

    const recipes = [
      { id: 'r', title: 'Porcini Risotto', species: ['mushroom'] },
    ];
    const common = {
      map: mapStub as never,
      recipes,
      start: [7, 47] as [number, number],
      minScore: 5.5,
      radiusKm: 100,
    };

    // Day 0: queries today source, score 6.0 -> covered.
    const today = queryRouteDishData({ ...common, frac: 0 });
    expect(today.sourceGroups[0]?.sourceId).toBe('overlay-ne');
    expect(today.plans[0]?.fullyCovered).toBe(true);

    // Day 6 (frac 1): queries _fc source, interpolates 6 -> 0, below minScore -> dropped.
    const day6 = queryRouteDishData({ ...common, frac: 1 });
    expect(day6.sourceGroups[0]?.sourceId).toBe('forecast-ne');
    expect(day6.candidateStops).toHaveLength(0);
    expect(day6.plans[0]?.fullyCovered).toBe(false);
  });

  it('excludes stops beyond the radius', () => {
    const mapStub = {
      getStyle: () => ({
        layers: [
          { id: 'nettle-fill', source: 'forage', 'source-layer': 'scores' },
        ],
      }),
      querySourceFeatures: () => [
        {
          id: 'far-stop',
          type: 'Feature',
          properties: { Nettle: 8.0 },
          geometry: { type: 'Point', coordinates: [20.0, 55.0] }, // ~1000 km from start
        },
      ],
    };

    const result = queryRouteDishData({
      map: mapStub as never,
      recipes: [{ id: 'soup', title: 'Nettle Soup', species: ['nettle'] }],
      start: [7, 47],
      minScore: 5,
      radiusKm: 50,
    });

    expect(result.plans[0]?.fullyCovered).toBe(false);
    expect(result.plans[0]?.missingSpecies).toEqual(['nettle']);
  });

  it('returns no plans for an empty recipe list', () => {
    const mapStub = {
      getStyle: () => ({ layers: [] }),
      querySourceFeatures: () => [],
    };

    const result = queryRouteDishData({
      map: mapStub as never,
      recipes: [],
      start: [7, 47],
      minScore: 5,
      radiusKm: 100,
    });

    expect(result.plans).toHaveLength(0);
    expect(result.candidateStops).toHaveLength(0);
  });

  it('excludes stops below the minimum score threshold', () => {
    const mapStub = {
      getStyle: () => ({
        layers: [
          { id: 'morel-fill', source: 'forage', 'source-layer': 'scores' },
        ],
      }),
      querySourceFeatures: () => [
        {
          id: 'low-score-stop',
          type: 'Feature',
          properties: { Morel: 2.0 }, // below minScore of 5
          geometry: { type: 'Point', coordinates: [7.1, 47.1] },
        },
      ],
    };

    const result = queryRouteDishData({
      map: mapStub as never,
      recipes: [{ id: 'pasta', title: 'Morel Pasta', species: ['morel'] }],
      start: [7, 47],
      minScore: 5,
      radiusKm: 100,
    });

    expect(result.candidateStops).toHaveLength(0);
    expect(result.plans[0]?.fullyCovered).toBe(false);
  });

  it('merges duplicate features from the same coordinate', () => {
    const mapStub = {
      getStyle: () => ({
        layers: [
          { id: 'garlic-fill', source: 'forage', 'source-layer': 'scores' },
          { id: 'dandelion-fill', source: 'forage', 'source-layer': 'scores' },
        ],
      }),
      querySourceFeatures: () => [
        // Same feature id — should be merged, not duplicated
        {
          id: 'shared',
          type: 'Feature',
          properties: { 'Wild Garlic': 7.0, Dandelion: 6.5 },
          geometry: { type: 'Point', coordinates: [7.2, 47.2] },
        },
        {
          id: 'shared',
          type: 'Feature',
          properties: { 'Wild Garlic': 7.0, Dandelion: 6.5 },
          geometry: { type: 'Point', coordinates: [7.2, 47.2] },
        },
      ],
    };

    const result = queryRouteDishData({
      map: mapStub as never,
      recipes: [
        {
          id: 'salad',
          title: 'Spring Salad',
          species: ['garlic', 'dandelion'],
        },
      ],
      start: [7, 47],
      minScore: 5,
      radiusKm: 100,
    });

    expect(result.candidateStops).toHaveLength(1);
    expect(result.plans[0]?.fullyCovered).toBe(true);
  });
});
