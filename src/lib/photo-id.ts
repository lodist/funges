import { SPECIES_DATA, type Species } from '@/data/species';
import {
  getToxicByScientificName,
  type ToxicSpecies,
} from '@/data/toxic-species';

/**
 * Maps model predictions onto the app's data, and decides what safety
 * information a candidate carries.
 *
 * Everything here is pure and synchronous. The model is injected — see
 * `IdentifyResolver` below.
 */

export type CandidateKind = 'catalog' | 'toxic' | 'other' | 'unknown';

export interface Prediction {
  scientificName: string;
  score: number;
}

export interface Candidate {
  scientificName: string;
  score: number;
  kind: CandidateKind;
  /** Populated for `catalog`. More than one when a name maps to several ids. */
  catalogSpecies: Species[];
  /** Populated for `toxic`. */
  toxic?: ToxicSpecies;
}

/**
 * Genus-level catalog entries store a literal `"spp."` suffix (`'Boletus spp.'`)
 * while the model's vocabulary uses the bare genus (`'Boletus'`). This bridges
 * the two, and is an ALLOW-LIST rather than a prefix match on purpose.
 *
 * A prefix match ("starts with Boletus" -> the edible catalog entry) would
 * classify `Boletus satanas` — the deprecated synonym for the toxic
 * *Rubroboletus satanas* — as safe porcini. Several boletes carry old `Boletus`
 * binomials for the same reason, so the rule must be "these exact names", never
 * "this genus".
 */
const GENUS_LEVEL_CATALOG: Record<
  string,
  { catalogName: string; accepted: string[] }
> = {
  Boletus: {
    catalogName: 'Boletus spp.',
    accepted: [
      'Boletus',
      'Boletus edulis',
      'Boletus aereus',
      'Boletus pinophilus',
      'Boletus reticulatus',
    ],
  },
  Morchella: {
    catalogName: 'Morchella spp.',
    accepted: [
      'Morchella',
      'Morchella esculenta',
      'Morchella elata',
      'Morchella conica',
      'Morchella importuna',
    ],
  },
};

/** scientificName -> catalog entries. A name can map to several (see below). */
const CATALOG_BY_SCIENTIFIC_NAME: ReadonlyMap<string, Species[]> = (() => {
  const map = new Map<string, Species[]>();
  for (const species of SPECIES_DATA) {
    // `elderberry` and `elderflower` are both Sambucus nigra — the model cannot
    // distinguish them, so both are returned and collapsed into one row later.
    const existing = map.get(species.scientificName);
    if (existing) existing.push(species);
    else map.set(species.scientificName, [species]);
  }
  // Register every accepted species-level name under its genus catalog entry.
  for (const { catalogName, accepted } of Object.values(GENUS_LEVEL_CATALOG)) {
    const entries = map.get(catalogName);
    if (!entries) continue;
    for (const name of accepted) {
      if (!map.has(name)) map.set(name, entries);
    }
  }
  return map;
})();

/**
 * Tier 2: species the model can name but the app knows nothing else about.
 * Registered at runtime from the shipped vocabulary. Never carries an edibility
 * claim.
 */
let tier2Names: ReadonlySet<string> = new Set();

export function registerTier2Vocabulary(names: Iterable<string>): void {
  tier2Names = new Set(names);
}

/** Test seam — lets a test restore a clean slate. */
export function resetTier2Vocabulary(): void {
  tier2Names = new Set();
}

/**
 * Resolve one predicted scientific name.
 *
 * Order is load-bearing: TOXIC IS CHECKED FIRST. If a name ever appeared in
 * both tables, checking catalog first would silently downgrade a lethal species
 * to an edible one, and checking tier 2 first would downgrade it to a
 * no-safety-information row. Toxic must always win.
 */
export function resolvePrediction(prediction: Prediction): Candidate {
  const { scientificName, score } = prediction;

  const toxic = getToxicByScientificName(scientificName);
  if (toxic) {
    return { scientificName, score, kind: 'toxic', catalogSpecies: [], toxic };
  }

  const catalogSpecies = CATALOG_BY_SCIENTIFIC_NAME.get(scientificName);
  if (catalogSpecies) {
    return { scientificName, score, kind: 'catalog', catalogSpecies };
  }

  if (tier2Names.has(scientificName)) {
    return { scientificName, score, kind: 'other', catalogSpecies: [] };
  }

  return { scientificName, score, kind: 'unknown', catalogSpecies: [] };
}

/**
 * Resolve a ranked prediction list, preserving the model's own order.
 *
 * Ranking is NEVER reordered by toxicity — promoting a toxic candidate would
 * misrepresent the model's confidence and imply more certainty than it
 * expressed. Toxicity is an overlay, not a sort key.
 *
 * Nothing is dropped at any tier: a list silently shrinking from 3 to 2 with no
 * visible cause is its own defect.
 */
export function resolvePredictions(predictions: Prediction[]): Candidate[] {
  return predictions.map(resolvePrediction);
}

/**
 * Cap on toxic labels appended by `mergeToxicSightings`.
 *
 * Bounds the list at 3 + 2 rows. Two photos could in principle contribute six
 * distinct sightings, and a wall of warnings is how alarm fatigue is manufactured
 * — the point of grading severity in the first place.
 */
const MAX_APPENDED_SIGHTINGS = 2;

/**
 * Combine the ranking from the averaged embedding with toxic labels that only one
 * individual photo saw.
 *
 * Averaging is what makes several photos more accurate, but it can also dilute. A
 * photo of the stem base can show a death cap's volva plainly while a top-down
 * cap shot of the same find shows nothing at all, and the mean of the two can
 * rank that warning out of the top 3. So `ranked` — the averaged, measured-
 * accurate ordering — is what the user sees first, and a toxic label that a
 * single photo put in its own top 3 is appended rather than lost.
 *
 * Only TOXIC labels are appended. Appending an edible one would manufacture a
 * candidate the combined evidence does not support, which is the one direction
 * this feature must never err in.
 */
export function mergeToxicSightings(
  ranked: Prediction[],
  perPhoto: Prediction[][]
): Candidate[] {
  const combined = resolvePredictions(ranked);
  const seen = new Set(combined.map(c => c.scientificName));

  // Strongest sighting first, so if the cap bites it drops the weakest evidence.
  const sightings = perPhoto.flat().sort((a, b) => b.score - a.score);

  const appended: Candidate[] = [];
  for (const sighting of sightings) {
    if (appended.length === MAX_APPENDED_SIGHTINGS) break;
    if (seen.has(sighting.scientificName)) continue;
    const candidate = resolvePrediction(sighting);
    if (candidate.kind !== 'toxic') continue;
    seen.add(sighting.scientificName);
    appended.push(candidate);
  }

  return [...combined, ...appended];
}

/** True when any candidate is toxic, at any rank. Drives the warning banner. */
export function hasToxicCandidate(candidates: Candidate[]): boolean {
  return candidates.some(c => c.kind === 'toxic');
}

export interface CriticalConfusion {
  toxic: ToxicSpecies;
  catalogSpecies: Species;
  noteKey: string;
}

/**
 * Find escalated confusions present in this result set.
 *
 * Generic and data-driven: it looks for any toxic candidate whose
 * `criticalConfusions` names a catalog species that is ALSO in the set. No
 * species name is hardcoded here, so adding a pair is a data change.
 */
export function findCriticalConfusions(
  candidates: Candidate[]
): CriticalConfusion[] {
  const catalogIds = new Map<string, Species>();
  for (const c of candidates) {
    if (c.kind === 'catalog') {
      for (const s of c.catalogSpecies) catalogIds.set(s.id, s);
    }
  }

  const found: CriticalConfusion[] = [];
  for (const c of candidates) {
    for (const pair of c.toxic?.criticalConfusions ?? []) {
      const catalogSpecies = catalogIds.get(pair.catalogId);
      if (catalogSpecies) {
        found.push({ toxic: c.toxic!, catalogSpecies, noteKey: pair.noteKey });
      }
    }
  }
  return found;
}

/** The model, injected. Kept deliberately narrow. */
export type IdentifyResolver = (image: Blob) => Promise<Prediction[]>;
