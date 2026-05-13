import type { Recipe } from '@/data/recipes';
import type { SpeciesWithTranslations } from '@/data/species';

export type ExperienceLevel = 'beginner' | 'intermediate' | 'expert';
export type ForagingFocus = 'mixed' | 'mushrooms' | 'plants' | 'berries';
export type ScoreRegionId = 'NE' | 'SE' | 'USE' | 'USW';

export interface WeekendRecommendation {
  speciesId: string;
  speciesName: string;
  scientificName: string;
  category: SpeciesWithTranslations['category'];
  score: number;
  confidence: 'high' | 'medium' | 'low';
  seasonLabel: string;
  habitatLabel: string | null;
  recipes: Array<{
    id: string;
    title: string;
  }>;
  whyNow: string[];
  caution: string;
  bestWindow: string;
  coordinate: [number, number];
  distanceKm: number | null;
}

export interface RecommendationContext {
  scope: 'region' | 'radius';
  regionId: ScoreRegionId;
  regionLabel: string;
  referenceDate: string | null;
  radiusKm: number | null;
}

interface RecommendationInputs {
  species: SpeciesWithTranslations[];
  recipes: Recipe[];
  experienceLevel: ExperienceLevel;
  focus: ForagingFocus;
  mapCenter: [number, number];
  userLocation: [number, number] | null;
}

interface RecommendationDatasetPoint {
  regionId: ScoreRegionId;
  lat: number;
  lng: number;
  scores: Partial<Record<string, number>>;
}

interface RecommendationDatasetRegionEntry {
  speciesId: string;
  score: number;
  lat: number;
  lng: number;
}

interface RecommendationDataset {
  updated_at: string | null;
  grid_size_degrees: number;
  min_score: number;
  regions: Record<ScoreRegionId, RecommendationDatasetRegionEntry[]>;
  points: RecommendationDatasetPoint[];
}

interface RankedSpeciesCandidate {
  species: SpeciesWithTranslations;
  score: number;
  coordinate: [number, number];
  distanceKm: number | null;
  rankingScore: number;
}

const SCORE_DATA_URL = 'data/worth_foraging_now.json';
const STORAGE_KEY = 'worth-foraging-now:v1';
const STORAGE_TTL_MS = 6 * 60 * 60 * 1000;
const RADIUS_KM = 100;
const MAX_RECOMMENDATIONS = 3;

const REGION_LABELS: Record<ScoreRegionId, string> = {
  NE: 'North Europe',
  SE: 'South Europe',
  USE: 'US East',
  USW: 'US West',
};

const REGION_MATCHERS: Record<
  ScoreRegionId,
  (coordinate: [number, number]) => boolean
> = {
  NE: ([lng, lat]) => lng >= -25 && lat >= 47,
  SE: ([lng, lat]) => lng >= -25 && lat < 47,
  USE: ([lng]) => lng < -25 && lng >= -100,
  USW: ([lng]) => lng < -100,
};

const FOCUS_CATEGORY_MAP: Record<
  ForagingFocus,
  SpeciesWithTranslations['category'][]
> = {
  mixed: ['mushroom', 'plant', 'berry', 'nut', 'flower'],
  mushrooms: ['mushroom'],
  plants: ['plant', 'flower'],
  berries: ['berry', 'nut'],
};

const EXPERIENCE_CAUTION: Record<ExperienceLevel, string> = {
  beginner: 'Stay with easy-to-identify species and double-check every find.',
  intermediate: 'Good target if you verify habitat, season, and lookalikes.',
  expert: 'Suitable for experienced foragers who can validate local variation.',
};

const WINDOW_BY_CATEGORY: Record<SpeciesWithTranslations['category'], string> = {
  mushroom: 'Best when moisture is still in the ground.',
  plant: 'Best while fresh spring or early-summer growth is active.',
  berry: 'Best once sun and recent moisture balance out.',
  nut: 'Best during dry conditions with good ground visibility.',
  flower: 'Best in bright, dry weather before midday heat.',
};

let cachedDataset: RecommendationDataset | null = null;
let cachedDatasetPromise: Promise<RecommendationDataset> | null = null;

interface CachedDatasetPayload {
  cachedAt: number;
  dataset: RecommendationDataset;
}

function getRecipeMatches(recipes: Recipe[], speciesId: string) {
  return recipes
    .filter(recipe => recipe.species.includes(speciesId))
    .slice(0, 2)
    .map(recipe => ({
      id: recipe.id,
      title: recipe.title,
    }));
}

function getConfidence(score: number): WeekendRecommendation['confidence'] {
  if (score >= 8.2) return 'high';
  if (score >= 6.8) return 'medium';
  return 'low';
}

function formatScore(score: number) {
  return Math.max(0, Math.min(10, Number(score.toFixed(1))));
}

function haversineKm(from: [number, number], to: [number, number]) {
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

function distanceAwareRanking(score: number, distanceKm: number | null) {
  if (distanceKm === null) return score;
  const clampedDistance = Math.min(Math.max(distanceKm, 0), RADIUS_KM);
  const proximityScore = 10 - clampedDistance / 10;
  return score * 0.8 + proximityScore * 0.2;
}

export function inferScoreRegion(center: [number, number]): ScoreRegionId {
  if (REGION_MATCHERS.USW(center)) return 'USW';
  if (REGION_MATCHERS.USE(center)) return 'USE';
  if (REGION_MATCHERS.SE(center)) return 'SE';
  return 'NE';
}

function isRecommendationDataset(
  value: unknown
): value is RecommendationDataset {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<RecommendationDataset>;
  return (
    typeof candidate.grid_size_degrees === 'number' &&
    typeof candidate.min_score === 'number' &&
    !!candidate.regions &&
    !!candidate.points
  );
}

function readCachedDataset() {
  if (typeof window === 'undefined') return null;

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as Partial<CachedDatasetPayload>;

    if (
      typeof parsed.cachedAt !== 'number' ||
      !isRecommendationDataset(parsed.dataset)
    ) {
      return null;
    }

    if (Date.now() - parsed.cachedAt > STORAGE_TTL_MS) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    return parsed.dataset;
  } catch {
    return null;
  }
}

function writeCachedDataset(dataset: RecommendationDataset) {
  if (typeof window === 'undefined') return;

  try {
    const payload: CachedDatasetPayload = {
      cachedAt: Date.now(),
      dataset,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage quota and serialization errors.
  }
}

async function loadRecommendationDataset() {
  if (cachedDataset) {
    return cachedDataset;
  }

  const localDataset = readCachedDataset();
  if (localDataset) {
    cachedDataset = localDataset;
    return localDataset;
  }

  if (!cachedDatasetPromise) {
    cachedDatasetPromise = fetch(SCORE_DATA_URL, {
      headers: {
        Accept: 'application/json',
      },
    })
      .then(async response => {
        if (!response.ok) {
          throw new Error('Unable to load precomputed recommendations.');
        }

        const dataset = (await response.json()) as unknown;
        if (!isRecommendationDataset(dataset)) {
          throw new Error('Precomputed recommendations are malformed.');
        }

        cachedDataset = dataset;
        writeCachedDataset(dataset);
        return dataset;
      })
      .finally(() => {
        cachedDatasetPromise = null;
      });
  }

  return cachedDatasetPromise;
}

function rankRegionSpecies({
  dataset,
  species,
  focus,
  regionId,
}: {
  dataset: RecommendationDataset;
  species: SpeciesWithTranslations[];
  focus: ForagingFocus;
  regionId: ScoreRegionId;
}) {
  const allowedCategories = new Set(FOCUS_CATEGORY_MAP[focus]);
  const speciesMap = new Map(species.map(item => [item.id, item]));

  return (dataset.regions[regionId] ?? [])
    .map<RankedSpeciesCandidate | null>(entry => {
      const matchedSpecies = speciesMap.get(entry.speciesId);
      if (!matchedSpecies) return null;
      if (!matchedSpecies.showOnMap) return null;
      if (!allowedCategories.has(matchedSpecies.category)) return null;

      const score = formatScore(entry.score);
      return {
        species: matchedSpecies,
        score,
        coordinate: [entry.lng, entry.lat],
        distanceKm: null,
        rankingScore: score,
      };
    })
    .filter((item): item is RankedSpeciesCandidate => item !== null)
    .sort((a, b) => b.rankingScore - a.rankingScore)
    .slice(0, MAX_RECOMMENDATIONS);
}

function rankNearbySpecies({
  dataset,
  species,
  focus,
  userLocation,
}: {
  dataset: RecommendationDataset;
  species: SpeciesWithTranslations[];
  focus: ForagingFocus;
  userLocation: [number, number];
}) {
  const allowedCategories = new Set(FOCUS_CATEGORY_MAP[focus]);
  const speciesMap = new Map(species.map(item => [item.id, item]));
  const rankedBySpecies = new Map<string, RankedSpeciesCandidate>();

  dataset.points.forEach(point => {
    const coordinate: [number, number] = [point.lng, point.lat];
    const distanceKm = haversineKm(userLocation, coordinate);

    if (distanceKm > RADIUS_KM) {
      return;
    }

    Object.entries(point.scores).forEach(([speciesId, rawScore]) => {
      if (rawScore === undefined) return;
      const matchedSpecies = speciesMap.get(speciesId);
      if (!matchedSpecies) return;
      if (!matchedSpecies.showOnMap) return;
      if (!allowedCategories.has(matchedSpecies.category)) return;

      const score = formatScore(rawScore);
      const candidate: RankedSpeciesCandidate = {
        species: matchedSpecies,
        score,
        coordinate,
        distanceKm: Number(distanceKm.toFixed(1)),
        rankingScore: distanceAwareRanking(score, distanceKm),
      };
      const existing = rankedBySpecies.get(speciesId);

      if (!existing || candidate.rankingScore > existing.rankingScore) {
        rankedBySpecies.set(speciesId, candidate);
      }
    });
  });

  return Array.from(rankedBySpecies.values())
    .sort((a, b) => b.rankingScore - a.rankingScore)
    .slice(0, MAX_RECOMMENDATIONS);
}

function buildRecommendationsFromRanked({
  ranked,
  recipes,
  experienceLevel,
  regionLabel,
  scope,
}: {
  ranked: RankedSpeciesCandidate[];
  recipes: Recipe[];
  experienceLevel: ExperienceLevel;
  regionLabel: string;
  scope: RecommendationContext['scope'];
}) {
  return ranked.map<WeekendRecommendation>(candidate => {
    const recipeMatches = getRecipeMatches(recipes, candidate.species.id);
    const scopeLine =
      scope === 'radius'
        ? candidate.distanceKm !== null
          ? `Strong current score within 100 km, about ${candidate.distanceKm} km away.`
          : 'Strong current score within 100 km of your location.'
        : `Highest current score found in the ${regionLabel} map region.`;
    const kitchenLine =
      recipeMatches.length > 0
        ? `Kitchen payoff is strong with ${recipeMatches.length} matching recipe${recipeMatches.length > 1 ? 's' : ''}.`
        : 'No direct recipe match yet, but the score is strong enough to scout.';

    return {
      speciesId: candidate.species.id,
      speciesName: candidate.species.name,
      scientificName: candidate.species.scientificName,
      category: candidate.species.category,
      score: candidate.score,
      confidence: getConfidence(candidate.score),
      seasonLabel: candidate.species.season ?? 'varied',
      habitatLabel: candidate.species.habitat ?? null,
      recipes: recipeMatches,
      whyNow: [
        scopeLine,
        kitchenLine,
        candidate.species.habitat
          ? `Best habitat signal: ${candidate.species.habitat}.`
          : 'Watch for the strongest local habitat signal on the map.',
      ],
      caution: EXPERIENCE_CAUTION[experienceLevel],
      bestWindow: WINDOW_BY_CATEGORY[candidate.species.category],
      coordinate: candidate.coordinate,
      distanceKm: candidate.distanceKm,
    };
  });
}

export function deriveWorthForagingNowRecommendations({
  dataset,
  species,
  recipes,
  experienceLevel,
  focus,
  mapCenter,
  userLocation,
}: RecommendationInputs & { dataset: RecommendationDataset }) {
  const regionId = inferScoreRegion(mapCenter);
  const regionLabel = REGION_LABELS[regionId];

  const rankedNearby = userLocation
    ? rankNearbySpecies({
        dataset,
        species,
        focus,
        userLocation,
      })
    : [];

  const effectiveScope: RecommendationContext['scope'] =
    userLocation && rankedNearby.length > 0 ? 'radius' : 'region';

  const ranked =
    effectiveScope === 'radius'
      ? rankedNearby
      : rankRegionSpecies({
          dataset,
          species,
          focus,
          regionId,
        });

  return {
    recommendations: buildRecommendationsFromRanked({
      ranked,
      recipes,
      experienceLevel,
      regionLabel,
      scope: effectiveScope,
    }),
    context: {
      scope: effectiveScope,
      regionId,
      regionLabel,
      referenceDate: dataset.updated_at,
      radiusKm: effectiveScope === 'radius' ? RADIUS_KM : null,
    } satisfies RecommendationContext,
  };
}

export async function fetchWorthForagingNowRecommendations(
  inputs: RecommendationInputs
) {
  const dataset = await loadRecommendationDataset();
  return deriveWorthForagingNowRecommendations({
    ...inputs,
    dataset,
  });
}
