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

  // --- promoted from tier 2 (2026-07): all 13 were in the model vocabulary
  // already, showing as "not in this app's catalog - no safety information".
  // Two of them turned up in a real result set during device testing with no
  // warning attached: Taxus baccata and Omphalotus illudens. ---

  // The false truffles. Added together with Tuber melanosporum, never after it:
  // an edible truffle label without these would let a poisonous find surface as
  // an edible row. The decisive check is cutting it open - a truffle is marbled
  // with pale veins, a Scleroderma is a solid dark mass.
  {
    id: 'scleroderma-citrinum',
    scientificName: 'Scleroderma citrinum',
    category: 'mushroom',
    severity: 'toxic',
    reasonKey: 'toxicity.mechanisms.giIrritant',
    checkKeys: [
      'toxicity.checks.interiorPattern',
      'toxicity.checks.capStructure',
    ],
    confusedWithSpeciesIds: ['truffle_b'],
    criticalConfusions: [
      { catalogId: 'truffle_b', noteKey: 'toxicity.critical.trufflePair' },
    ],
  },
  {
    id: 'scleroderma-polyrhizum',
    scientificName: 'Scleroderma polyrhizum',
    category: 'mushroom',
    severity: 'toxic',
    reasonKey: 'toxicity.mechanisms.giIrritant',
    checkKeys: [
      'toxicity.checks.interiorPattern',
      'toxicity.checks.capStructure',
    ],
    confusedWithSpeciesIds: ['truffle_b'],
    criticalConfusions: [
      { catalogId: 'truffle_b', noteKey: 'toxicity.critical.trufflePair' },
    ],
  },

  // Yew. The seed inside the red aril is the lethal part, which is why "it
  // looked like a berry" is not a defence.
  {
    id: 'taxus-baccata',
    scientificName: 'Taxus baccata',
    category: 'berry',
    severity: 'lethal',
    reasonKey: 'toxicity.mechanisms.taxine',
    checkKeys: [
      'toxicity.checks.berryArrangement',
      'toxicity.checks.leafShape',
      'toxicity.checks.plantHabit',
    ],
    confusedWithSpeciesIds: ['lingonb'],
  },

  // Brown roll-rim. Eaten for decades in parts of Europe before the mechanism
  // was understood: poisoning is an immune reaction that builds over repeated
  // meals, so "I have always eaten it" is exactly the wrong reassurance.
  {
    id: 'paxillus-involutus',
    scientificName: 'Paxillus involutus',
    category: 'mushroom',
    severity: 'lethal',
    reasonKey: 'toxicity.mechanisms.immuneHaemolysis',
    checkKeys: [
      'toxicity.checks.capStructure',
      'toxicity.checks.gillAttachment',
      'toxicity.checks.fleshBruising',
    ],
    confusedWithSpeciesIds: [],
  },

  // Foxglove. The rosette leaves are the risk, not the flowers.
  {
    id: 'digitalis-purpurea',
    scientificName: 'Digitalis purpurea',
    category: 'plant',
    severity: 'lethal',
    reasonKey: 'toxicity.mechanisms.cardiacGlycoside',
    checkKeys: [
      'toxicity.checks.leafArrangement',
      'toxicity.checks.leafShape',
      'toxicity.checks.plantHabit',
    ],
    confusedWithSpeciesIds: [],
  },

  {
    id: 'amanita-pantherina',
    scientificName: 'Amanita pantherina',
    category: 'mushroom',
    severity: 'toxic',
    reasonKey: 'toxicity.mechanisms.isoxazole',
    checkKeys: [
      'toxicity.checks.volva',
      'toxicity.checks.capWarts',
      'toxicity.checks.ringAndStem',
    ],
    confusedWithSpeciesIds: ['parasol'],
  },

  // Jack-o-lanterns. O. olearius was already flagged; these three were not,
  // which made the warning depend on which species the model happened to name.
  {
    id: 'omphalotus-illudens',
    scientificName: 'Omphalotus illudens',
    category: 'mushroom',
    severity: 'toxic',
    reasonKey: 'toxicity.mechanisms.giIrritant',
    checkKeys: [
      'toxicity.checks.gillVsRidges',
      'toxicity.checks.gillAttachment',
      'toxicity.checks.capAttachment',
    ],
    confusedWithSpeciesIds: ['chant', 'oyster-mushroom'],
  },
  {
    id: 'omphalotus-olivascens',
    scientificName: 'Omphalotus olivascens',
    category: 'mushroom',
    severity: 'toxic',
    reasonKey: 'toxicity.mechanisms.giIrritant',
    checkKeys: [
      'toxicity.checks.gillVsRidges',
      'toxicity.checks.gillAttachment',
      'toxicity.checks.capAttachment',
    ],
    confusedWithSpeciesIds: ['chant', 'oyster-mushroom'],
  },
  {
    id: 'omphalotus-subilludens',
    scientificName: 'Omphalotus subilludens',
    category: 'mushroom',
    severity: 'toxic',
    reasonKey: 'toxicity.mechanisms.giIrritant',
    checkKeys: [
      'toxicity.checks.gillVsRidges',
      'toxicity.checks.gillAttachment',
      'toxicity.checks.capAttachment',
    ],
    confusedWithSpeciesIds: ['chant', 'oyster-mushroom'],
  },

  // Yellow-stainer. Bruises chrome yellow at the stem base and smells of ink or
  // carbolic - the two checks that separate it from an edible field mushroom.
  {
    id: 'agaricus-xanthodermus',
    scientificName: 'Agaricus xanthodermus',
    category: 'mushroom',
    severity: 'toxic',
    reasonKey: 'toxicity.mechanisms.giIrritant',
    checkKeys: [
      'toxicity.checks.fleshBruising',
      'toxicity.checks.smell',
      'toxicity.checks.ringAndStem',
    ],
    confusedWithSpeciesIds: [],
  },

  // Sulphur tuft. One of the most common toxic mushrooms in Europe, in dense
  // clusters on stumps where people look for edible clustered species.
  {
    id: 'hypholoma-fasciculare',
    scientificName: 'Hypholoma fasciculare',
    category: 'mushroom',
    severity: 'toxic',
    reasonKey: 'toxicity.mechanisms.giIrritant',
    checkKeys: [
      'toxicity.checks.gillColour',
      'toxicity.checks.capAttachment',
      'toxicity.checks.smell',
    ],
    confusedWithSpeciesIds: ['oyster-mushroom'],
  },

  {
    id: 'daphne-mezereum',
    scientificName: 'Daphne mezereum',
    category: 'berry',
    severity: 'toxic',
    reasonKey: 'toxicity.mechanisms.giIrritant',
    checkKeys: [
      'toxicity.checks.berryArrangement',
      'toxicity.checks.leafArrangement',
      'toxicity.checks.plantHabit',
    ],
    confusedWithSpeciesIds: ['lingonb'],
  },

  // Herb paris. A single dark berry above a whorl of four leaves, in the same
  // damp woodland as bilberry.
  {
    id: 'paris-quadrifolia',
    scientificName: 'Paris quadrifolia',
    category: 'berry',
    severity: 'toxic',
    reasonKey: 'toxicity.mechanisms.giIrritant',
    checkKeys: [
      'toxicity.checks.leafArrangement',
      'toxicity.checks.berryArrangement',
      'toxicity.checks.plantHabit',
    ],
    confusedWithSpeciesIds: ['blueberry'],
  },

  // --- lethal species surfaced by --stage audit-danger when tier 2 grew from
  // 1005 to 4873 (2026-07). All were rendering as "no safety information".
  // Amanita bisporigera is the destroying angel; Pleurocybella porrigens
  // killed foragers in Japan and looks like an oyster mushroom; Veratrum
  // album among ramsons is the classic fatal wild-garlic confusion. ---
  {
    id: 'amanita-bisporigera',
    scientificName: 'Amanita bisporigera',
    category: 'mushroom',
    severity: 'lethal',
    reasonKey: 'toxicity.mechanisms.amatoxin',
    checkKeys: [
      'toxicity.checks.volva',
      'toxicity.checks.gillColour',
      'toxicity.checks.ringAndStem',
      'toxicity.checks.sporePrint',
    ],
    confusedWithSpeciesIds: [],
  },
  {
    id: 'amanita-ocreata',
    scientificName: 'Amanita ocreata',
    category: 'mushroom',
    severity: 'lethal',
    reasonKey: 'toxicity.mechanisms.amatoxin',
    checkKeys: [
      'toxicity.checks.volva',
      'toxicity.checks.gillColour',
      'toxicity.checks.ringAndStem',
      'toxicity.checks.sporePrint',
    ],
    confusedWithSpeciesIds: [],
  },
  {
    id: 'amanita-smithiana',
    scientificName: 'Amanita smithiana',
    category: 'mushroom',
    severity: 'lethal',
    reasonKey: 'toxicity.mechanisms.nephrotoxic',
    checkKeys: [
      'toxicity.checks.volva',
      'toxicity.checks.ringAndStem',
      'toxicity.checks.capWarts',
    ],
    confusedWithSpeciesIds: [],
  },
  {
    id: 'galerina-badipes',
    scientificName: 'Galerina badipes',
    category: 'mushroom',
    severity: 'lethal',
    reasonKey: 'toxicity.mechanisms.amatoxin',
    checkKeys: [
      'toxicity.checks.capAttachment',
      'toxicity.checks.sporePrint',
      'toxicity.checks.overallSize',
    ],
    confusedWithSpeciesIds: [],
  },
  {
    id: 'lepiota-cristata',
    scientificName: 'Lepiota cristata',
    category: 'mushroom',
    severity: 'lethal',
    reasonKey: 'toxicity.mechanisms.amatoxin',
    checkKeys: [
      'toxicity.checks.overallSize',
      'toxicity.checks.ringAndStem',
      'toxicity.checks.smell',
    ],
    confusedWithSpeciesIds: ['parasol'],
  },
  {
    id: 'lepiota-subincarnata',
    scientificName: 'Lepiota subincarnata',
    category: 'mushroom',
    severity: 'lethal',
    reasonKey: 'toxicity.mechanisms.amatoxin',
    checkKeys: [
      'toxicity.checks.overallSize',
      'toxicity.checks.ringAndStem',
      'toxicity.checks.sporePrint',
    ],
    confusedWithSpeciesIds: ['parasol'],
  },
  {
    id: 'pholiotina-rugosa',
    scientificName: 'Pholiotina rugosa',
    category: 'mushroom',
    severity: 'lethal',
    reasonKey: 'toxicity.mechanisms.amatoxin',
    checkKeys: [
      'toxicity.checks.overallSize',
      'toxicity.checks.cortina',
      'toxicity.checks.sporePrint',
    ],
    confusedWithSpeciesIds: [],
  },
  {
    id: 'tricholoma-equestre',
    scientificName: 'Tricholoma equestre',
    category: 'mushroom',
    severity: 'lethal',
    reasonKey: 'toxicity.mechanisms.rhabdomyolysis',
    checkKeys: ['toxicity.checks.gillColour', 'toxicity.checks.capStructure'],
    confusedWithSpeciesIds: [],
  },
  {
    id: 'pleurocybella-porrigens',
    scientificName: 'Pleurocybella porrigens',
    category: 'mushroom',
    severity: 'lethal',
    reasonKey: 'toxicity.mechanisms.encephalopathy',
    checkKeys: [
      'toxicity.checks.gillAttachment',
      'toxicity.checks.capStructure',
      'toxicity.checks.capAttachment',
    ],
    confusedWithSpeciesIds: ['oyster-mushroom'],
    criticalConfusions: [
      {
        catalogId: 'oyster-mushroom',
        noteKey: 'toxicity.critical.angelWingPair',
      },
    ],
  },
  {
    id: 'aconitum-columbianum',
    scientificName: 'Aconitum columbianum',
    category: 'plant',
    severity: 'lethal',
    reasonKey: 'toxicity.mechanisms.aconitine',
    checkKeys: [
      'toxicity.checks.leafShape',
      'toxicity.checks.leafArrangement',
      'toxicity.checks.plantHabit',
    ],
    confusedWithSpeciesIds: [],
  },
  {
    id: 'cicuta-virosa',
    scientificName: 'Cicuta virosa',
    category: 'plant',
    severity: 'lethal',
    reasonKey: 'toxicity.mechanisms.cicutoxin',
    checkKeys: [
      'toxicity.checks.leafShape',
      'toxicity.checks.hollowStem',
      'toxicity.checks.stemMarkings',
      'toxicity.checks.smell',
    ],
    confusedWithSpeciesIds: ['masterwort'],
  },
  {
    id: 'oenanthe-crocata',
    scientificName: 'Oenanthe crocata',
    category: 'plant',
    severity: 'lethal',
    reasonKey: 'toxicity.mechanisms.cicutoxin',
    checkKeys: [
      'toxicity.checks.leafShape',
      'toxicity.checks.hollowStem',
      'toxicity.checks.smell',
    ],
    confusedWithSpeciesIds: ['masterwort'],
  },
  {
    id: 'digitalis-grandiflora',
    scientificName: 'Digitalis grandiflora',
    category: 'plant',
    severity: 'lethal',
    reasonKey: 'toxicity.mechanisms.cardiacGlycoside',
    checkKeys: [
      'toxicity.checks.leafArrangement',
      'toxicity.checks.leafShape',
      'toxicity.checks.plantHabit',
    ],
    confusedWithSpeciesIds: [],
  },
  {
    id: 'nerium-oleander',
    scientificName: 'Nerium oleander',
    category: 'plant',
    severity: 'lethal',
    reasonKey: 'toxicity.mechanisms.cardiacGlycoside',
    checkKeys: [
      'toxicity.checks.leafArrangement',
      'toxicity.checks.leafShape',
      'toxicity.checks.plantHabit',
    ],
    confusedWithSpeciesIds: [],
  },
  {
    id: 'datura-stramonium',
    scientificName: 'Datura stramonium',
    category: 'plant',
    severity: 'lethal',
    reasonKey: 'toxicity.mechanisms.tropane',
    checkKeys: [
      'toxicity.checks.leafShape',
      'toxicity.checks.plantHabit',
      'toxicity.checks.smell',
    ],
    confusedWithSpeciesIds: [],
  },
  {
    id: 'datura-wrightii',
    scientificName: 'Datura wrightii',
    category: 'plant',
    severity: 'lethal',
    reasonKey: 'toxicity.mechanisms.tropane',
    checkKeys: [
      'toxicity.checks.leafShape',
      'toxicity.checks.plantHabit',
      'toxicity.checks.smell',
    ],
    confusedWithSpeciesIds: [],
  },
  {
    id: 'hyoscyamus-niger',
    scientificName: 'Hyoscyamus niger',
    category: 'plant',
    severity: 'lethal',
    reasonKey: 'toxicity.mechanisms.tropane',
    checkKeys: [
      'toxicity.checks.leafShape',
      'toxicity.checks.plantHabit',
      'toxicity.checks.smell',
    ],
    confusedWithSpeciesIds: [],
  },
  {
    id: 'ricinus-communis',
    scientificName: 'Ricinus communis',
    category: 'plant',
    severity: 'lethal',
    reasonKey: 'toxicity.mechanisms.ricin',
    checkKeys: [
      'toxicity.checks.leafShape',
      'toxicity.checks.plantHabit',
      'toxicity.checks.berryArrangement',
    ],
    confusedWithSpeciesIds: [],
  },
  {
    id: 'abrus-precatorius',
    scientificName: 'Abrus precatorius',
    category: 'berry',
    severity: 'lethal',
    reasonKey: 'toxicity.mechanisms.ricin',
    checkKeys: [
      'toxicity.checks.berryArrangement',
      'toxicity.checks.leafArrangement',
      'toxicity.checks.plantHabit',
    ],
    confusedWithSpeciesIds: [],
  },
  {
    id: 'taxus-brevifolia',
    scientificName: 'Taxus brevifolia',
    category: 'berry',
    severity: 'lethal',
    reasonKey: 'toxicity.mechanisms.taxine',
    checkKeys: [
      'toxicity.checks.berryArrangement',
      'toxicity.checks.leafShape',
      'toxicity.checks.plantHabit',
    ],
    confusedWithSpeciesIds: ['lingonb'],
  },
  {
    id: 'laburnum-anagyroides',
    scientificName: 'Laburnum anagyroides',
    category: 'plant',
    severity: 'lethal',
    reasonKey: 'toxicity.mechanisms.cytisine',
    checkKeys: [
      'toxicity.checks.berryArrangement',
      'toxicity.checks.leafArrangement',
      'toxicity.checks.plantHabit',
    ],
    confusedWithSpeciesIds: [],
  },
  {
    id: 'kalmia-latifolia',
    scientificName: 'Kalmia latifolia',
    category: 'plant',
    severity: 'lethal',
    reasonKey: 'toxicity.mechanisms.grayanotoxin',
    checkKeys: [
      'toxicity.checks.leafArrangement',
      'toxicity.checks.leafShape',
      'toxicity.checks.plantHabit',
    ],
    confusedWithSpeciesIds: [],
  },
  {
    id: 'rhododendron-ponticum',
    scientificName: 'Rhododendron ponticum',
    category: 'plant',
    severity: 'lethal',
    reasonKey: 'toxicity.mechanisms.grayanotoxin',
    checkKeys: [
      'toxicity.checks.leafArrangement',
      'toxicity.checks.leafShape',
      'toxicity.checks.plantHabit',
    ],
    confusedWithSpeciesIds: [],
  },
  {
    id: 'veratrum-album',
    scientificName: 'Veratrum album',
    category: 'plant',
    severity: 'lethal',
    reasonKey: 'toxicity.mechanisms.veratrumAlkaloid',
    checkKeys: [
      'toxicity.checks.leafArrangement',
      'toxicity.checks.leafShape',
      'toxicity.checks.smell',
    ],
    confusedWithSpeciesIds: ['garlic'],
    criticalConfusions: [
      { catalogId: 'garlic', noteKey: 'toxicity.critical.veratrumPair' },
    ],
  },
  {
    id: 'veratrum-viride',
    scientificName: 'Veratrum viride',
    category: 'plant',
    severity: 'lethal',
    reasonKey: 'toxicity.mechanisms.veratrumAlkaloid',
    checkKeys: [
      'toxicity.checks.leafArrangement',
      'toxicity.checks.leafShape',
      'toxicity.checks.smell',
    ],
    confusedWithSpeciesIds: ['garlic'],
  },
  {
    id: 'veratrum-californicum',
    scientificName: 'Veratrum californicum',
    category: 'plant',
    severity: 'lethal',
    reasonKey: 'toxicity.mechanisms.veratrumAlkaloid',
    checkKeys: [
      'toxicity.checks.leafArrangement',
      'toxicity.checks.leafShape',
      'toxicity.checks.smell',
    ],
    confusedWithSpeciesIds: ['garlic'],
  },

  // --- sibling species in wholly-dangerous genera. A test asserting that
  // every Scleroderma is toxic went red when the vocabulary expanded, which
  // is the Omphalotus fault repeating: flag one member, miss the rest, and
  // the warning depends on which one the model names. ---
  {
    id: 'scleroderma-areolatum',
    scientificName: 'Scleroderma areolatum',
    category: 'mushroom',
    severity: 'toxic',
    reasonKey: 'toxicity.mechanisms.giIrritant',
    checkKeys: [
      'toxicity.checks.interiorPattern',
      'toxicity.checks.capStructure',
    ],
    confusedWithSpeciesIds: ['truffle_b'],
  },
  {
    id: 'scleroderma-verrucosum',
    scientificName: 'Scleroderma verrucosum',
    category: 'mushroom',
    severity: 'toxic',
    reasonKey: 'toxicity.mechanisms.giIrritant',
    checkKeys: [
      'toxicity.checks.interiorPattern',
      'toxicity.checks.capStructure',
    ],
    confusedWithSpeciesIds: ['truffle_b'],
  },
  {
    id: 'rubroboletus-rhodoxanthus',
    scientificName: 'Rubroboletus rhodoxanthus',
    category: 'mushroom',
    severity: 'toxic',
    reasonKey: 'toxicity.mechanisms.giIrritant',
    checkKeys: [
      'toxicity.checks.poreColour',
      'toxicity.checks.fleshBruising',
      'toxicity.checks.stemNetwork',
    ],
    confusedWithSpeciesIds: ['mushroom'],
  },
  {
    id: 'kalmia-procumbens',
    scientificName: 'Kalmia procumbens',
    category: 'plant',
    severity: 'toxic',
    reasonKey: 'toxicity.mechanisms.grayanotoxin',
    checkKeys: [
      'toxicity.checks.leafArrangement',
      'toxicity.checks.leafShape',
      'toxicity.checks.plantHabit',
    ],
    confusedWithSpeciesIds: [],
  },
];

/** Exact-match lookup table. Built once; the matcher never scans the array. */
export const TOXIC_BY_SCIENTIFIC_NAME: ReadonlyMap<string, ToxicSpecies> =
  new Map(TOXIC_SPECIES.map(t => [t.scientificName, t]));

export const getToxicByScientificName = (
  name: string
): ToxicSpecies | undefined => TOXIC_BY_SCIENTIFIC_NAME.get(name);
