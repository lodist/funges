import { getRecipesBySpecies, type Recipe } from '@/data/recipes';
import type { SpeciesWithTranslations } from '@/data/species';
import { TOXIC_SPECIES, type ToxicSeverity } from '@/data/toxic-species';
import i18n from '@/i18n';

export type ForagingFocus = 'mixed' | 'mushrooms' | 'plants' | 'berries';
export type ScoreRegionId = 'NE' | 'SE' | 'USE' | 'USW';

export interface WorthForagingNowRecommendation {
  speciesId: string;
  speciesName: string;
  scientificName: string;
  category: SpeciesWithTranslations['category'];
  score: number;
  confidence: 'high' | 'medium' | 'low';
  habitatLabel: string | null;
  recipes: Array<{
    id: string;
    title: string;
    image: string | null;
  }>;
  /** The most dangerous toxic look-alike, so a pick never ships without it. */
  lookalike: { scientificName: string; severity: ToxicSeverity } | null;
  bestWindow: string;
  coordinate: [number, number];
  distanceKm: number | null;
  /** Compass bearing from the reader to the best point, 0 = north. */
  bearingDeg: number | null;
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
  bearingDeg: number | null;
  rankingScore: number;
}

const SCORE_DATA_URL = `${import.meta.env.BASE_URL}data/worth_foraging_now.json`;
const STORAGE_KEY = 'worth-foraging-now:v1';
const STORAGE_TTL_MS = 6 * 60 * 60 * 1000;
const RADIUS_KM = 100;
const MAX_RECOMMENDATIONS = 9;

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

let cachedDataset: RecommendationDataset | null = null;
let cachedDatasetPromise: Promise<RecommendationDataset> | null = null;

interface CachedDatasetPayload {
  cachedAt: number;
  dataset: RecommendationDataset;
}

function getRecipeMatches(recipes: Recipe[], speciesId: string) {
  return getRecipesBySpecies(speciesId, recipes)
    .slice(0, 2)
    .map(recipe => ({
      id: recipe.id,
      title: recipe.title,
      image: recipe.image,
    }));
}

const SEVERITY_RANK: Record<ToxicSeverity, number> = {
  lethal: 0,
  toxic: 1,
  inedible: 2,
};

// ponytail: first entry of the worst severity, not region-aware; the table has
// no region field, so a US-only look-alike can name itself on a European pick.
export function getWorstLookalike(
  speciesId: string
): WorthForagingNowRecommendation['lookalike'] {
  const worst = TOXIC_SPECIES.filter(toxic =>
    toxic.confusedWithSpeciesIds.includes(speciesId)
  ).sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])[0];
  return worst
    ? { scientificName: worst.scientificName, severity: worst.severity }
    : null;
}

export function getConfidence(
  score: number
): WorthForagingNowRecommendation['confidence'] {
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

function bearingDeg(from: [number, number], to: [number, number]) {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const [lng1, lat1] = from.map(toRad);
  const [lng2, lat2] = to.map(toRad);
  const y = Math.sin(lng2 - lng1) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(lng2 - lng1);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

const COMPASS_POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
export type CompassPoint = (typeof COMPASS_POINTS)[number];

/** Eight-point compass name for a bearing, 0 = north. */
export function compassPoint(bearing: number): CompassPoint {
  return COMPASS_POINTS[Math.round(bearing / 45) % 8];
}

function distanceAwareRanking(score: number, distanceKm: number | null) {
  if (distanceKm === null) return score;
  const clampedDistance = Math.min(Math.max(distanceKm, 0), RADIUS_KM);
  const proximityScore = 10 - clampedDistance / 10;
  return score * 0.8 + proximityScore * 0.2;
}

function getRegionLabel(regionId: ScoreRegionId) {
  return i18n.t(`common:worthForagingNow.regions.${regionId}`);
}

function getTranslatedHabitatLabel(habitat: string | null | undefined) {
  if (!habitat) {
    return null;
  }

  return i18n.t(`species:habitats.${habitat}`, {
    defaultValue: habitat,
  });
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
        bearingDeg: null,
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
        bearingDeg: bearingDeg(userLocation, coordinate),
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
}: {
  ranked: RankedSpeciesCandidate[];
  recipes: Recipe[];
}) {
  return ranked.map<WorthForagingNowRecommendation>(candidate => ({
    speciesId: candidate.species.id,
    speciesName: candidate.species.name,
    scientificName: candidate.species.scientificName,
    category: candidate.species.category,
    score: candidate.score,
    confidence: getConfidence(candidate.score),
    habitatLabel: getTranslatedHabitatLabel(candidate.species.habitat),
    recipes: getRecipeMatches(recipes, candidate.species.id),
    lookalike: getWorstLookalike(candidate.species.id),
    bestWindow: i18n.t(
      `common:worthForagingNow.bestWindowByCategory.${candidate.species.category}`
    ),
    coordinate: candidate.coordinate,
    distanceKm: candidate.distanceKm,
    bearingDeg: candidate.bearingDeg,
  }));
}

export function deriveWorthForagingNowRecommendations({
  dataset,
  species,
  recipes,
  focus,
  mapCenter,
  userLocation,
}: RecommendationInputs & { dataset: RecommendationDataset }) {
  const regionId = inferScoreRegion(mapCenter);
  const regionLabel = getRegionLabel(regionId);

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
    recommendations: buildRecommendationsFromRanked({ ranked, recipes }),
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

export interface CurrentScores {
  scope: RecommendationContext['scope'];
  regionId: ScoreRegionId;
  regionLabel: string;
  referenceDate: string | null;
  /** Today's best score per species id within the scope; absent = not scoring. */
  scores: Record<string, number>;
}

/**
 * Every species' score today: the best point within 100 km of the reader when
 * a position is known and anything scores there, otherwise the best in the
 * map's region. The catalog pages read this; the picks above rank from it.
 */
export function deriveCurrentScores({
  dataset,
  mapCenter,
  userLocation,
}: {
  dataset: RecommendationDataset;
  mapCenter: [number, number];
  userLocation: [number, number] | null;
}): CurrentScores {
  const regionId = inferScoreRegion(userLocation ?? mapCenter);
  const base = {
    regionId,
    regionLabel: getRegionLabel(regionId),
    referenceDate: dataset.updated_at,
  };

  if (userLocation) {
    const scores: Record<string, number> = {};
    dataset.points.forEach(point => {
      if (haversineKm(userLocation, [point.lng, point.lat]) > RADIUS_KM) {
        return;
      }
      Object.entries(point.scores).forEach(([speciesId, score]) => {
        if (score === undefined) return;
        scores[speciesId] = Math.max(
          scores[speciesId] ?? 0,
          formatScore(score)
        );
      });
    });
    if (Object.keys(scores).length > 0) {
      return { ...base, scope: 'radius', scores };
    }
  }

  return {
    ...base,
    scope: 'region',
    scores: Object.fromEntries(
      (dataset.regions[regionId] ?? []).map(entry => [
        entry.speciesId,
        formatScore(entry.score),
      ])
    ),
  };
}

export async function fetchCurrentScores(inputs: {
  mapCenter: [number, number];
  userLocation: [number, number] | null;
}) {
  return deriveCurrentScores({
    ...inputs,
    dataset: await loadRecommendationDataset(),
  });
}
