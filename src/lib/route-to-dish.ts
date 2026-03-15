import type mapboxgl from 'mapbox-gl';
import { getRepresentativeLngLat, type LngLat } from '@/lib/geo';

export interface RouteDishRecipe {
  id: string;
  title: string;
  species: string[];
}

export interface RouteDishSpeciesConfig {
  scorePropertyAliases: string[];
}

export interface RouteDishCandidateStop {
  id: string;
  coordinate: LngLat;
  sourceId: string;
  sourceLayer?: string;
  coveredSpecies: string[];
  scoreBySpecies: Partial<Record<string, number>>;
}

export interface RouteDishPlan {
  recipeId: string;
  recipeTitle: string;
  requiredSpecies: string[];
  coveredSpecies: string[];
  missingSpecies: string[];
  stopIds: string[];
  orderedStops: RouteDishCandidateStop[];
  estimatedDistanceKm: number;
  fullyCovered: boolean;
}

export interface RouteDishSourceGroup {
  sourceId: string;
  sourceLayer?: string;
  layerIds: string[];
  speciesIds: string[];
}

export interface RouteDishResult {
  sourceGroups: RouteDishSourceGroup[];
  candidateStops: RouteDishCandidateStop[];
  plans: RouteDishPlan[];
}

export const ROUTE_TO_DISH_SPECIES_CONFIG: Record<
  string,
  RouteDishSpeciesConfig
> = {
  amaranth: {
    scorePropertyAliases: ['amaranth', 'amaranth_score', 'Amaranth'],
  },
  artichoke: {
    scorePropertyAliases: [
      'artichoke',
      'artichoke_score',
      'Wild Artichoke',
      'Artichoke',
    ],
  },
  asparagus: {
    scorePropertyAliases: [
      'asparagus',
      'asparagus_score',
      'Wild Asparagus',
      'Asparagus',
    ],
  },
  black_chant: {
    scorePropertyAliases: [
      'black_chant',
      'black_chant_score',
      'Black Chanterelle',
    ],
  },
  chant: { scorePropertyAliases: ['chant', 'chant_score', 'Chanterelle'] },
  chickweed: {
    scorePropertyAliases: ['chickweed', 'chickweed_score', 'Chickweed'],
  },
  chestnut: {
    scorePropertyAliases: ['chestnut', 'chestnut_score', 'Chestnut'],
  },
  dandelion: {
    scorePropertyAliases: ['dandelion', 'dandelion_score', 'Dandelion'],
  },
  garlic: {
    scorePropertyAliases: ['garlic', 'garlic_score', 'Wild Garlic', 'Garlic'],
  },
  lingonb: {
    scorePropertyAliases: ['lingonb', 'lingonb_score', 'Lingonberry'],
  },
  masterwort: {
    scorePropertyAliases: ['masterwort', 'masterwort_score', 'Masterwort'],
  },
  morel: { scorePropertyAliases: ['morel', 'morel_score', 'Morel'] },
  mushroom: {
    scorePropertyAliases: ['mushroom', 'mushroom_score', 'Porcini', 'Mushroom'],
  },
  nettle: { scorePropertyAliases: ['nettle', 'nettle_score', 'Nettle'] },
  parasol: {
    scorePropertyAliases: ['parasol', 'parasol_score', 'Parasol Mushroom'],
  },
  raspberry: {
    scorePropertyAliases: ['raspberry', 'raspberry_score', 'Raspberry'],
  },
  sorrel: { scorePropertyAliases: ['sorrel', 'sorrel_score', 'Sorrel'] },
  st_george: {
    scorePropertyAliases: [
      'st_george',
      'st_george_score',
      "St. George's Mushroom",
      'St. Georges Mushroom',
    ],
  },
  strawberry: {
    scorePropertyAliases: [
      'strawberry',
      'strawberry_score',
      'Wild Strawberry',
      'Strawberry',
    ],
  },
  walnut: {
    scorePropertyAliases: ['walnut', 'walnut_score', 'Wild Walnut', 'Walnut'],
  },
};

const ROUTE_TO_DISH_SPECIES_IDS = new Set(
  Object.keys(ROUTE_TO_DISH_SPECIES_CONFIG)
);

function getSpeciesLayerGroups(
  map: mapboxgl.Map,
  speciesIds: string[]
): RouteDishSourceGroup[] {
  const layers = map.getStyle().layers ?? [];
  const groups = new Map<string, RouteDishSourceGroup>();

  layers.forEach(layer => {
    const matchedSpecies = speciesIds.filter(speciesId =>
      layer.id.startsWith(speciesId)
    );
    if (matchedSpecies.length === 0) return;

    const sourceId =
      typeof layer.source === 'string' ? layer.source : undefined;
    if (!sourceId) return;

    const sourceLayer =
      'source-layer' in layer && typeof layer['source-layer'] === 'string'
        ? layer['source-layer']
        : undefined;

    const key = `${sourceId}::${sourceLayer ?? ''}`;
    const existing = groups.get(key);

    if (existing) {
      existing.layerIds.push(layer.id);
      existing.speciesIds = Array.from(
        new Set([...existing.speciesIds, ...matchedSpecies])
      );
      return;
    }

    groups.set(key, {
      sourceId,
      sourceLayer,
      layerIds: [layer.id],
      speciesIds: matchedSpecies,
    });
  });

  return Array.from(groups.values());
}

function getFeatureKey(
  feature: mapboxgl.MapboxGeoJSONFeature,
  sourceId: string,
  sourceLayer?: string
): string {
  if (feature.id !== undefined && feature.id !== null) {
    return `${sourceId}:${sourceLayer ?? 'no-layer'}:${String(feature.id)}`;
  }

  const [lng, lat] = getRepresentativeLngLat(feature);
  return `${sourceId}:${sourceLayer ?? 'no-layer'}:${lng.toFixed(6)}:${lat.toFixed(6)}`;
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function getScoreForSpecies(
  properties: Record<string, unknown>,
  speciesId: string
): number | null {
  const config = ROUTE_TO_DISH_SPECIES_CONFIG[speciesId];
  const aliases = config?.scorePropertyAliases ?? [
    speciesId,
    `${speciesId}_score`,
  ];

  for (const alias of aliases) {
    const score = toNumber(properties[alias]);
    if (score !== null) {
      return score;
    }
  }

  return null;
}

function haversineKm(from: LngLat, to: LngLat): number {
  const [lng1, lat1] = from;
  const [lng2, lat2] = to;
  const earthRadiusKm = 6371;
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function permuteStops(
  stops: RouteDishCandidateStop[]
): RouteDishCandidateStop[][] {
  if (stops.length <= 1) {
    return [stops];
  }

  return stops.flatMap((stop, index) => {
    const rest = [...stops.slice(0, index), ...stops.slice(index + 1)];
    return permuteStops(rest).map(order => [stop, ...order]);
  });
}

function estimatePathDistanceKm(
  start: LngLat,
  stops: RouteDishCandidateStop[]
) {
  let total = 0;
  let current = start;

  stops.forEach(stop => {
    total += haversineKm(current, stop.coordinate);
    current = stop.coordinate;
  });

  return total;
}

function orderStopsForShortestPath(
  start: LngLat,
  stops: RouteDishCandidateStop[]
): RouteDishCandidateStop[] {
  if (stops.length <= 1) {
    return stops;
  }

  let bestOrder = stops;
  let bestDistance = Number.POSITIVE_INFINITY;

  permuteStops(stops).forEach(order => {
    const distance = estimatePathDistanceKm(start, order);
    if (distance < bestDistance) {
      bestOrder = order;
      bestDistance = distance;
    }
  });

  return bestOrder;
}

function buildGreedyPlan(
  recipe: RouteDishRecipe,
  candidateStops: RouteDishCandidateStop[],
  start: LngLat,
  minScore: number,
  radiusKm: number
): RouteDishPlan {
  const requiredSpecies = Array.from(
    new Set(
      recipe.species.filter(speciesId =>
        ROUTE_TO_DISH_SPECIES_IDS.has(speciesId)
      )
    )
  );
  const nearbyStops = candidateStops
    .filter(stop => haversineKm(start, stop.coordinate) <= radiusKm)
    .map(stop => ({
      ...stop,
      coveredSpecies: stop.coveredSpecies.filter(
        speciesId => (stop.scoreBySpecies[speciesId] ?? 0) >= minScore
      ),
    }))
    .filter(stop => stop.coveredSpecies.length > 0);

  const uncovered = new Set(requiredSpecies);
  const selectedStops: RouteDishCandidateStop[] = [];

  while (uncovered.size > 0) {
    const bestStop = nearbyStops
      .filter(stop => !selectedStops.some(selected => selected.id === stop.id))
      .map(stop => ({
        stop,
        uncoveredCoverageCount: stop.coveredSpecies.filter(speciesId =>
          uncovered.has(speciesId)
        ).length,
        distanceFromStartKm: haversineKm(start, stop.coordinate),
      }))
      .filter(candidate => candidate.uncoveredCoverageCount > 0)
      .sort((left, right) => {
        if (right.uncoveredCoverageCount !== left.uncoveredCoverageCount) {
          return right.uncoveredCoverageCount - left.uncoveredCoverageCount;
        }

        return left.distanceFromStartKm - right.distanceFromStartKm;
      })[0];

    if (!bestStop) {
      break;
    }

    selectedStops.push(bestStop.stop);
    bestStop.stop.coveredSpecies.forEach(speciesId => {
      uncovered.delete(speciesId);
    });
  }

  const orderedStops = orderStopsForShortestPath(start, selectedStops);
  const coveredSpecies = requiredSpecies.filter(
    speciesId => !uncovered.has(speciesId)
  );

  return {
    recipeId: recipe.id,
    recipeTitle: recipe.title,
    requiredSpecies,
    coveredSpecies,
    missingSpecies: requiredSpecies.filter(speciesId =>
      uncovered.has(speciesId)
    ),
    stopIds: orderedStops.map(stop => stop.id),
    orderedStops,
    estimatedDistanceKm: estimatePathDistanceKm(start, orderedStops),
    fullyCovered: uncovered.size === 0,
  };
}

export function queryRouteDishData(params: {
  map: mapboxgl.Map;
  recipes: RouteDishRecipe[];
  start: LngLat;
  minScore: number;
  radiusKm: number;
}): RouteDishResult {
  const { map, recipes, start, minScore, radiusKm } = params;
  const speciesIds = Array.from(
    new Set(
      recipes
        .flatMap(recipe => recipe.species)
        .filter(speciesId => ROUTE_TO_DISH_SPECIES_IDS.has(speciesId))
    )
  );
  const sourceGroups = getSpeciesLayerGroups(map, speciesIds);
  const candidateStopMap = new Map<string, RouteDishCandidateStop>();

  sourceGroups.forEach(group => {
    let features: mapboxgl.MapboxGeoJSONFeature[] = [];

    try {
      features = map.querySourceFeatures(group.sourceId, {
        sourceLayer: group.sourceLayer,
      });
    } catch (error) {
      console.warn('Route-to-Dish source group query failed', group, error);
      return;
    }

    features.forEach(feature => {
      const featureKey = getFeatureKey(
        feature,
        group.sourceId,
        group.sourceLayer
      );
      const properties = (feature.properties ?? {}) as Record<string, unknown>;
      const scoreBySpecies: Partial<Record<string, number>> = {};

      speciesIds.forEach(speciesId => {
        const score = getScoreForSpecies(properties, speciesId);
        if (score !== null) {
          scoreBySpecies[speciesId] = score;
        }
      });

      const coveredSpecies = speciesIds.filter(
        speciesId => (scoreBySpecies[speciesId] ?? 0) >= minScore
      );

      if (coveredSpecies.length === 0) {
        return;
      }

      const existing = candidateStopMap.get(featureKey);
      if (existing) {
        existing.coveredSpecies = Array.from(
          new Set([...existing.coveredSpecies, ...coveredSpecies])
        );
        existing.scoreBySpecies = {
          ...existing.scoreBySpecies,
          ...scoreBySpecies,
        };
        return;
      }

      candidateStopMap.set(featureKey, {
        id: featureKey,
        coordinate: getRepresentativeLngLat(feature),
        sourceId: group.sourceId,
        sourceLayer: group.sourceLayer,
        coveredSpecies,
        scoreBySpecies,
      });
    });
  });

  const candidateStops = Array.from(candidateStopMap.values());
  const plans = recipes
    .map(recipe =>
      buildGreedyPlan(recipe, candidateStops, start, minScore, radiusKm)
    )
    .sort((left, right) => {
      if (left.fullyCovered !== right.fullyCovered) {
        return left.fullyCovered ? -1 : 1;
      }

      if (left.coveredSpecies.length !== right.coveredSpecies.length) {
        return right.coveredSpecies.length - left.coveredSpecies.length;
      }

      return left.estimatedDistanceKm - right.estimatedDistanceKm;
    });

  return {
    sourceGroups,
    candidateStops,
    plans,
  };
}
