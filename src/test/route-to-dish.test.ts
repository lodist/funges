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
});
