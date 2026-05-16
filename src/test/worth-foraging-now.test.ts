import { describe, expect, it } from 'vitest';
import type { Recipe } from '@/data/recipes';
import type { SpeciesWithTranslations } from '@/data/species';
import {
  deriveWorthForagingNowRecommendations,
  inferScoreRegion,
} from '@/lib/worth-foraging-now';

const species: SpeciesWithTranslations[] = [
  {
    id: 'morel',
    name: 'Morel',
    scientificName: 'Morchella esculenta',
    category: 'mushroom',
    emoji: '🍄',
    description: 'Spring mushroom',
    howTo: 'Search in woodland',
    season: 'spring',
    habitat: 'forest',
    showOnMap: true,
  },
  {
    id: 'nettle',
    name: 'Nettle',
    scientificName: 'Urtica dioica',
    category: 'plant',
    emoji: '🌿',
    description: 'Useful spring green',
    howTo: 'Pick young leaves',
    season: 'spring-summer',
    habitat: 'meadow',
    showOnMap: true,
  },
  {
    id: 'elderberry',
    name: 'Elderberry',
    scientificName: 'Sambucus nigra',
    category: 'berry',
    emoji: '🫐',
    description: 'Late-season berry',
    howTo: 'Gather ripe berries',
    season: 'fall',
    habitat: 'hedgerow',
    showOnMap: true,
  },
];

const recipes: Recipe[] = [
  {
    id: 'morel-toast',
    title: 'Morel Toast',
    ingredients: ['morel', 'bread'],
    instructions: [],
    steps: [],
    warnings: [],
    species: ['morel'],
    difficulty: 'medium',
    prepTime: '20 min',
    cookTime: '15 min',
    servings: '2',
    tags: ['toast'],
    safetyNotes: [],
    image: null,
  },
  {
    id: 'nettle-soup',
    title: 'Nettle Soup',
    ingredients: ['nettle', 'potato'],
    instructions: [],
    steps: [],
    warnings: [],
    species: ['nettle'],
    difficulty: 'easy',
    prepTime: '30 min',
    cookTime: '20 min',
    servings: '4',
    tags: ['soup'],
    safetyNotes: [],
    image: null,
  },
];

describe('worth foraging now recommendations', () => {
  it('infers the score region from the current map center', () => {
    expect(inferScoreRegion([7.3, 47.8])).toBe('NE');
    expect(inferScoreRegion([7.3, 41.9])).toBe('SE');
    expect(inferScoreRegion([-73.9, 40.7])).toBe('USE');
    expect(inferScoreRegion([-122.4, 37.7])).toBe('USW');
  });

  it('uses nearby scores when a location is available', () => {
    const result = deriveWorthForagingNowRecommendations({
      dataset: {
        updated_at: '2026-05-10T00:00:00Z',
        grid_size_degrees: 0.5,
        min_score: 4,
        regions: {
          NE: [
            { speciesId: 'morel', score: 8.8, lat: 47.64, lng: 7.7 },
            { speciesId: 'nettle', score: 8.4, lat: 47.61, lng: 7.61 },
          ],
          SE: [],
          USE: [{ speciesId: 'elderberry', score: 9.7, lat: 40.4, lng: -3.7 }],
          USW: [],
        },
        points: [
          {
            regionId: 'NE',
            lat: 47.61,
            lng: 7.61,
            scores: { nettle: 8.4, morel: 7.1 },
          },
          {
            regionId: 'NE',
            lat: 47.9,
            lng: 8.55,
            scores: { nettle: 7.2, morel: 8.8 },
          },
          {
            regionId: 'USE',
            lat: 40.4,
            lng: -3.7,
            scores: { elderberry: 9.7 },
          },
        ],
      },
      species,
      recipes,

      focus: 'plants',
      mapCenter: [7.3, 47.8],
      userLocation: [7.5, 47.6],
    });

    expect(result.context.scope).toBe('radius');
    expect(result.recommendations[0]?.speciesId).toBe('nettle');
    expect(result.recommendations[0]?.recipes[0]?.id).toBe('nettle-soup');
    expect(result.recommendations.every(item => item.distanceKm !== null)).toBe(
      true
    );
  });

  it('falls back to the current map region when location is unavailable', () => {
    const result = deriveWorthForagingNowRecommendations({
      dataset: {
        updated_at: '2026-05-10T00:00:00Z',
        grid_size_degrees: 0.5,
        min_score: 4,
        regions: {
          NE: [
            { speciesId: 'morel', score: 9.1, lat: 52.52, lng: 13.4 },
            { speciesId: 'nettle', score: 8.4, lat: 47.61, lng: 7.61 },
          ],
          SE: [],
          USE: [{ speciesId: 'elderberry', score: 9.7, lat: 40.4, lng: -3.7 }],
          USW: [],
        },
        points: [],
      },
      species,
      recipes,

      focus: 'mixed',
      mapCenter: [7.3, 47.8],
      userLocation: null,
    });

    expect(result.context.scope).toBe('region');
    expect(result.context.regionId).toBe('NE');
    expect(result.recommendations[0]?.speciesId).toBe('morel');
    expect(result.recommendations[0]?.distanceKm).toBeNull();
  });

  it('uses score and distance together when ranking nearby candidates', () => {
    const result = deriveWorthForagingNowRecommendations({
      dataset: {
        updated_at: '2026-05-10T00:00:00Z',
        grid_size_degrees: 0.5,
        min_score: 4,
        regions: {
          NE: [],
          SE: [],
          USE: [],
          USW: [],
        },
        points: [
          {
            regionId: 'NE',
            lat: 47.61,
            lng: 7.61,
            scores: { morel: 8.5 },
          },
          {
            regionId: 'NE',
            lat: 48.45,
            lng: 8.95,
            scores: { morel: 9.2 },
          },
        ],
      },
      species,
      recipes,

      focus: 'mushrooms',
      mapCenter: [7.3, 47.8],
      userLocation: [7.6, 47.6],
    });

    expect(result.context.scope).toBe('radius');
    expect(result.recommendations[0]?.speciesId).toBe('morel');
    expect(result.recommendations[0]?.distanceKm).toBeLessThan(5);
  });

  it('excludes species not shown on map', () => {
    const hiddenSpecies = [
      ...species,
      {
        id: 'hidden',
        name: 'Hidden',
        scientificName: 'Hidden sp.',
        category: 'mushroom' as const,
        emoji: '🍄',
        description: '',
        howTo: '',
        season: 'spring',
        habitat: 'forest',
        showOnMap: false,
      },
    ];

    const result = deriveWorthForagingNowRecommendations({
      dataset: {
        updated_at: null,
        grid_size_degrees: 0.5,
        min_score: 4,
        regions: {
          NE: [
            { speciesId: 'hidden', score: 9.9, lat: 47.6, lng: 7.6 },
            { speciesId: 'morel', score: 7.0, lat: 47.6, lng: 7.6 },
          ],
          SE: [],
          USE: [],
          USW: [],
        },
        points: [],
      },
      species: hiddenSpecies,
      recipes,
      focus: 'mushrooms',
      mapCenter: [7.3, 47.8],
      userLocation: null,
    });

    expect(result.recommendations.every(r => r.speciesId !== 'hidden')).toBe(true);
  });

  it('filters by focus category — berries focus excludes mushrooms and plants', () => {
    const result = deriveWorthForagingNowRecommendations({
      dataset: {
        updated_at: null,
        grid_size_degrees: 0.5,
        min_score: 4,
        regions: {
          NE: [
            { speciesId: 'morel', score: 9.5, lat: 47.6, lng: 7.6 },
            { speciesId: 'nettle', score: 9.0, lat: 47.6, lng: 7.6 },
            { speciesId: 'elderberry', score: 7.0, lat: 47.6, lng: 7.6 },
          ],
          SE: [],
          USE: [],
          USW: [],
        },
        points: [],
      },
      species,
      recipes,
      focus: 'berries',
      mapCenter: [7.3, 47.8],
      userLocation: null,
    });

    expect(result.recommendations.every(r => r.category === 'berry')).toBe(true);
    expect(result.recommendations[0]?.speciesId).toBe('elderberry');
  });

  it('returns empty recommendations when the region has no data', () => {
    const result = deriveWorthForagingNowRecommendations({
      dataset: {
        updated_at: null,
        grid_size_degrees: 0.5,
        min_score: 4,
        regions: { NE: [], SE: [], USE: [], USW: [] },
        points: [],
      },
      species,
      recipes,
      focus: 'mixed',
      mapCenter: [7.3, 47.8],
      userLocation: null,
    });

    expect(result.recommendations).toHaveLength(0);
    expect(result.context.scope).toBe('region');
  });

  it('falls back to region scope when all nearby points are out of radius', () => {
    const result = deriveWorthForagingNowRecommendations({
      dataset: {
        updated_at: null,
        grid_size_degrees: 0.5,
        min_score: 4,
        regions: {
          NE: [{ speciesId: 'morel', score: 8.0, lat: 47.6, lng: 7.6 }],
          SE: [],
          USE: [],
          USW: [],
        },
        points: [
          // Far from userLocation [7.5, 47.6] — over 100 km away
          { regionId: 'NE', lat: 55.0, lng: 20.0, scores: { morel: 9.5 } },
        ],
      },
      species,
      recipes,
      focus: 'mushrooms',
      mapCenter: [7.3, 47.8],
      userLocation: [7.5, 47.6],
    });

    expect(result.context.scope).toBe('region');
    expect(result.recommendations[0]?.speciesId).toBe('morel');
  });
});
