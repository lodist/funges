import type { Species } from './species';

/**
 * Toxic look-alikes for the edible catalog in `species.ts`.
 *
 * Deliberately a SEPARATE table from SPECIES_DATA. These species must be
 * predictable and flaggable in photo-identification results, but must never
 * appear in the species browser, recipes, or the map. Nothing in
 * `useSpeciesData()` reads this file.
 *
 * The 22 entries are the toxic label set the BioCLIP spike measured its
 * false-edible gate against — see
 * docs/superpowers/specs/2026-07-25-bioclip2-spike-results.md
 */

/**
 * `inedible` is a real and necessary tier, not padding. Tylopilus felleus is
 * merely too bitter to eat; labelling it identically to Amanita phalloides
 * ("may be fatal") produces alarm fatigue that erodes trust in the warnings
 * that are genuinely life-threatening.
 */
export type ToxicSeverity = 'lethal' | 'toxic' | 'inedible';

export interface ToxicSpecies {
  id: string;
  /**
   * EXACT iNaturalist accepted name — this string is matched character-for-character
   * against model output. Two of these look like typos and are not:
   * `Inosperma erubescens` (iNat moved it out of Inocybe) and
   * `Atropa bella-donna` (hyphenated). "Correcting" either one silently removes
   * a deadly species from the warning system. Both already failed once during
   * the spike for exactly this reason.
   */
  scientificName: string;
  /** Used only for emoji/icon lookup, never for edibility logic. */
  category: Species['category'];
  severity: ToxicSeverity;
  /** → identify.json `toxicity.mechanisms.*` */
  reasonKey: string;
  /** → identify.json `toxicity.checks.*` — the features that distinguish it. */
  checkKeys: string[];
  /**
   * DISPLAY COPY ONLY. Drives "commonly mistaken for X" text. Never used to
   * decide whether something is toxic — that is a scientificName lookup. Kept
   * separate so a wrong hint here can only produce slightly-off copy, never a
   * toxic species presented as safe.
   */
  confusedWithSpeciesIds: string[];
  /**
   * Confusions dangerous enough to warrant their own escalated warning when
   * both species appear in the same result set. Data-driven so adding a pair
   * later is a data change, not a code change.
   */
  criticalConfusions?: { catalogId: string; noteKey: string }[];
}

export const TOXIC_SPECIES: ToxicSpecies[] = [
  // --- confused with chanterelle / oyster mushroom ---
  {
    id: 'omphalotus-olearius',
    scientificName: 'Omphalotus olearius',
    category: 'mushroom',
    severity: 'toxic',
    reasonKey: 'toxicity.mechanisms.giIrritant',
    checkKeys: [
      'toxicity.checks.gillAttachment',
      'toxicity.checks.gillVsRidges',
    ],
    confusedWithSpeciesIds: ['chant', 'oyster-mushroom'],
  },
  {
    id: 'hygrophoropsis-aurantiaca',
    scientificName: 'Hygrophoropsis aurantiaca',
    category: 'mushroom',
    severity: 'inedible',
    reasonKey: 'toxicity.mechanisms.poorEdibility',
    checkKeys: ['toxicity.checks.gillVsRidges'],
    confusedWithSpeciesIds: ['chant'],
  },

  // --- confused with parasol mushroom ---
  {
    id: 'chlorophyllum-molybdites',
    scientificName: 'Chlorophyllum molybdites',
    category: 'mushroom',
    severity: 'toxic',
    reasonKey: 'toxicity.mechanisms.giIrritant',
    checkKeys: ['toxicity.checks.sporePrint', 'toxicity.checks.ringAndStem'],
    confusedWithSpeciesIds: ['parasol'],
  },
  {
    id: 'lepiota-brunneoincarnata',
    scientificName: 'Lepiota brunneoincarnata',
    category: 'mushroom',
    severity: 'lethal',
    reasonKey: 'toxicity.mechanisms.amatoxin',
    checkKeys: ['toxicity.checks.overallSize', 'toxicity.checks.ringAndStem'],
    confusedWithSpeciesIds: ['parasol'],
    // The spike measured this pair at 13% top-1 confusion — 4x any other, and
    // one side of it is lethal. This is the single most dangerous confusion the
    // evaluation found.
    criticalConfusions: [
      {
        catalogId: 'parasol',
        noteKey: 'toxicity.critical.lepiotaMacrolepiota',
      },
    ],
  },

  // --- confused with St George's mushroom ---
  {
    id: 'inosperma-erubescens',
    scientificName: 'Inosperma erubescens',
    category: 'mushroom',
    severity: 'lethal',
    reasonKey: 'toxicity.mechanisms.muscarine',
    checkKeys: ['toxicity.checks.fleshReddening', 'toxicity.checks.smell'],
    confusedWithSpeciesIds: ['st_george'],
  },
  {
    id: 'entoloma-sinuatum',
    scientificName: 'Entoloma sinuatum',
    category: 'mushroom',
    severity: 'toxic',
    reasonKey: 'toxicity.mechanisms.giIrritant',
    checkKeys: ['toxicity.checks.sporePrint', 'toxicity.checks.smell'],
    confusedWithSpeciesIds: ['st_george'],
  },

  // --- confused with morels ---
  {
    id: 'gyromitra-esculenta',
    scientificName: 'Gyromitra esculenta',
    category: 'mushroom',
    severity: 'lethal',
    reasonKey: 'toxicity.mechanisms.gyromitrin',
    checkKeys: ['toxicity.checks.capStructure', 'toxicity.checks.hollowStem'],
    confusedWithSpeciesIds: ['morel'],
  },
  {
    id: 'verpa-bohemica',
    scientificName: 'Verpa bohemica',
    category: 'mushroom',
    severity: 'toxic',
    reasonKey: 'toxicity.mechanisms.giIrritant',
    checkKeys: ['toxicity.checks.capAttachment', 'toxicity.checks.hollowStem'],
    confusedWithSpeciesIds: ['morel'],
  },

  // --- confused with boletes / porcini ---
  {
    id: 'rubroboletus-satanas',
    scientificName: 'Rubroboletus satanas',
    category: 'mushroom',
    severity: 'toxic',
    reasonKey: 'toxicity.mechanisms.giIrritant',
    checkKeys: ['toxicity.checks.poreColour', 'toxicity.checks.fleshBruising'],
    confusedWithSpeciesIds: ['mushroom'],
  },
  {
    id: 'tylopilus-felleus',
    scientificName: 'Tylopilus felleus',
    category: 'mushroom',
    severity: 'inedible',
    reasonKey: 'toxicity.mechanisms.bitter',
    checkKeys: ['toxicity.checks.poreColour', 'toxicity.checks.stemNetwork'],
    confusedWithSpeciesIds: ['mushroom'],
  },

  // --- unconditionally dangerous fungi, no specific catalog pairing ---
  {
    id: 'amanita-phalloides',
    scientificName: 'Amanita phalloides',
    category: 'mushroom',
    severity: 'lethal',
    reasonKey: 'toxicity.mechanisms.amatoxin',
    checkKeys: ['toxicity.checks.volva', 'toxicity.checks.gillColour'],
    confusedWithSpeciesIds: [],
  },
  {
    id: 'amanita-virosa',
    scientificName: 'Amanita virosa',
    category: 'mushroom',
    severity: 'lethal',
    reasonKey: 'toxicity.mechanisms.amatoxin',
    checkKeys: ['toxicity.checks.volva', 'toxicity.checks.gillColour'],
    confusedWithSpeciesIds: [],
  },
  {
    id: 'amanita-muscaria',
    scientificName: 'Amanita muscaria',
    category: 'mushroom',
    severity: 'toxic',
    reasonKey: 'toxicity.mechanisms.isoxazole',
    checkKeys: ['toxicity.checks.volva', 'toxicity.checks.capWarts'],
    confusedWithSpeciesIds: [],
  },
  {
    id: 'galerina-marginata',
    scientificName: 'Galerina marginata',
    category: 'mushroom',
    severity: 'lethal',
    reasonKey: 'toxicity.mechanisms.amatoxin',
    checkKeys: ['toxicity.checks.sporePrint', 'toxicity.checks.ringAndStem'],
    confusedWithSpeciesIds: [],
  },
  {
    id: 'cortinarius-rubellus',
    scientificName: 'Cortinarius rubellus',
    category: 'mushroom',
    severity: 'lethal',
    reasonKey: 'toxicity.mechanisms.orellanine',
    checkKeys: ['toxicity.checks.cortina', 'toxicity.checks.sporePrint'],
    confusedWithSpeciesIds: [],
  },

  // --- confused with wild garlic: the deadliest plant confusions here ---
  {
    id: 'colchicum-autumnale',
    scientificName: 'Colchicum autumnale',
    category: 'plant',
    severity: 'lethal',
    reasonKey: 'toxicity.mechanisms.colchicine',
    checkKeys: ['toxicity.checks.smell', 'toxicity.checks.leafArrangement'],
    confusedWithSpeciesIds: ['garlic'],
  },
  {
    id: 'convallaria-majalis',
    scientificName: 'Convallaria majalis',
    category: 'plant',
    severity: 'lethal',
    reasonKey: 'toxicity.mechanisms.cardiacGlycoside',
    checkKeys: ['toxicity.checks.smell', 'toxicity.checks.leafArrangement'],
    confusedWithSpeciesIds: ['garlic'],
  },
  {
    id: 'arum-maculatum',
    scientificName: 'Arum maculatum',
    category: 'plant',
    severity: 'toxic',
    reasonKey: 'toxicity.mechanisms.calciumOxalate',
    checkKeys: ['toxicity.checks.smell', 'toxicity.checks.leafShape'],
    confusedWithSpeciesIds: ['garlic'],
  },

  // --- confused with masterwort (Apiaceae confusions kill) ---
  {
    id: 'conium-maculatum',
    scientificName: 'Conium maculatum',
    category: 'plant',
    severity: 'lethal',
    reasonKey: 'toxicity.mechanisms.coniine',
    checkKeys: ['toxicity.checks.stemMarkings', 'toxicity.checks.smell'],
    confusedWithSpeciesIds: ['masterwort'],
  },
  {
    id: 'aethusa-cynapium',
    scientificName: 'Aethusa cynapium',
    category: 'plant',
    severity: 'lethal',
    reasonKey: 'toxicity.mechanisms.coniine',
    checkKeys: ['toxicity.checks.stemMarkings', 'toxicity.checks.smell'],
    confusedWithSpeciesIds: ['masterwort'],
  },

  // --- confused with berries ---
  {
    id: 'atropa-bella-donna',
    scientificName: 'Atropa bella-donna',
    category: 'berry',
    severity: 'lethal',
    reasonKey: 'toxicity.mechanisms.tropane',
    checkKeys: [
      'toxicity.checks.berryArrangement',
      'toxicity.checks.plantHabit',
    ],
    confusedWithSpeciesIds: ['blueberry', 'lingonb'],
  },
  {
    id: 'sambucus-ebulus',
    scientificName: 'Sambucus ebulus',
    category: 'berry',
    severity: 'toxic',
    reasonKey: 'toxicity.mechanisms.giIrritant',
    checkKeys: [
      'toxicity.checks.plantHabit',
      'toxicity.checks.berryArrangement',
    ],
    confusedWithSpeciesIds: ['elderberry', 'elderflower'],
  },
];

/** Exact-match lookup table. Built once; the matcher never scans the array. */
export const TOXIC_BY_SCIENTIFIC_NAME: ReadonlyMap<string, ToxicSpecies> =
  new Map(TOXIC_SPECIES.map(t => [t.scientificName, t]));

export const getToxicByScientificName = (
  name: string
): ToxicSpecies | undefined => TOXIC_BY_SCIENTIFIC_NAME.get(name);
