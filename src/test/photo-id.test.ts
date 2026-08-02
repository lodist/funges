import { describe, expect, it, beforeEach } from 'vitest';
import { BIOCLIP_LABELS } from '@/data/bioclip-labels';
import { SPECIES_DATA } from '@/data/species';
import { TOXIC_SPECIES } from '@/data/toxic-species';
import {
  findCriticalConfusions,
  hasToxicCandidate,
  mergeToxicSightings,
  registerTier2Vocabulary,
  resetTier2Vocabulary,
  resolvePrediction,
  resolvePredictions,
} from '@/lib/photo-id';

const p = (scientificName: string, score = 0.9) => ({ scientificName, score });

beforeEach(() => {
  resetTier2Vocabulary();
});

describe('vocabulary coverage', () => {
  // The single most important test here. Every name the model can emit for
  // tier 1 must resolve to a bucket that carries safety information. This goes
  // red the moment someone "corrects" `Atropa bella-donna` to the textbook
  // spelling or `Inosperma erubescens` back to `Inocybe` — both of which
  // already failed silently once during the spike.
  it('resolves every toxic species to toxic, never other or unknown', () => {
    const misresolved = TOXIC_SPECIES.map(t => ({
      name: t.scientificName,
      kind: resolvePrediction(p(t.scientificName)).kind,
    })).filter(r => r.kind !== 'toxic');

    expect(misresolved).toEqual([]);
  });

  it('resolves every catalog species to catalog', () => {
    const misresolved = SPECIES_DATA.map(s => ({
      name: s.scientificName,
      kind: resolvePrediction(p(s.scientificName)).kind,
    })).filter(r => r.kind !== 'catalog');

    expect(misresolved).toEqual([]);
  });

  // A toxic species leaking into the tier-2 regional list would render as a
  // neutral "no safety information" row instead of a warning — a lethal species
  // quietly downgraded.
  it('never lets a tier-2 registration downgrade a toxic species', () => {
    registerTier2Vocabulary(TOXIC_SPECIES.map(t => t.scientificName));

    for (const t of TOXIC_SPECIES) {
      expect(resolvePrediction(p(t.scientificName)).kind).toBe('toxic');
    }
  });

  it('never lets a tier-2 registration shadow a catalog species', () => {
    registerTier2Vocabulary(SPECIES_DATA.map(s => s.scientificName));

    for (const s of SPECIES_DATA) {
      expect(resolvePrediction(p(s.scientificName)).kind).toBe('catalog');
    }
  });
});

describe('genus-level catalog entries', () => {
  // The catalog stores 'Boletus spp.' but the model emits a bare genus.
  it('resolves the bare genus the model actually emits', () => {
    expect(resolvePrediction(p('Boletus')).catalogSpecies[0]?.id).toBe(
      'mushroom'
    );
    expect(resolvePrediction(p('Morchella')).catalogSpecies[0]?.id).toBe(
      'morel'
    );
  });

  it('resolves accepted edible species-level names under the genus', () => {
    expect(resolvePrediction(p('Boletus edulis')).catalogSpecies[0]?.id).toBe(
      'mushroom'
    );
    expect(
      resolvePrediction(p('Morchella esculenta')).catalogSpecies[0]?.id
    ).toBe('morel');
  });

  // THE safety test for this mechanism. `Boletus satanas` is the deprecated
  // synonym for the toxic Rubroboletus satanas. A genus PREFIX match would
  // hand it back as edible porcini. It must not resolve to catalog.
  it('does not resolve a dangerous old genus synonym to the edible entry', () => {
    const got = resolvePrediction(p('Boletus satanas'));

    expect(got.kind).not.toBe('catalog');
    expect(got.kind).toBe('unknown');
    expect(got.catalogSpecies).toEqual([]);
  });

  it('does not resolve arbitrary same-genus names to the edible entry', () => {
    for (const name of ['Boletus badius', 'Morchella nonexistentia']) {
      expect(resolvePrediction(p(name)).kind).not.toBe('catalog');
    }
  });
});

describe('duplicate scientific names', () => {
  // Sambucus nigra is both elderberry and elderflower in the catalog. The model
  // cannot tell them apart, so both come back and the UI collapses them into
  // one row rather than spending two of three slots on one identification.
  it('returns both catalog entries for a shared scientific name', () => {
    const got = resolvePrediction(p('Sambucus nigra'));

    expect(got.kind).toBe('catalog');
    expect(got.catalogSpecies.map(s => s.id).sort()).toEqual([
      'elderberry',
      'elderflower',
    ]);
  });
});

describe('tier 2 and unknown', () => {
  it('resolves a registered tier-2 name to other', () => {
    registerTier2Vocabulary(['Russula emetica']);

    expect(resolvePrediction(p('Russula emetica')).kind).toBe('other');
  });

  it('resolves an unregistered name to unknown', () => {
    expect(resolvePrediction(p('Nonexistent species')).kind).toBe('unknown');
  });

  // A shrinking list with no visible cause is its own failure mode.
  it('never drops a prediction, whatever its tier', () => {
    const predictions = [
      p('Cantharellus cibarius'),
      p('Omphalotus olearius'),
      p('Totally unknown thing'),
    ];

    const got = resolvePredictions(predictions);

    expect(got).toHaveLength(3);
    expect(got.map(c => c.kind)).toEqual(['catalog', 'toxic', 'unknown']);
  });

  it('preserves the model ranking and does not promote toxic candidates', () => {
    const got = resolvePredictions([
      p('Cantharellus cibarius', 0.7),
      p('Omphalotus olearius', 0.2),
    ]);

    expect(got.map(c => c.scientificName)).toEqual([
      'Cantharellus cibarius',
      'Omphalotus olearius',
    ]);
  });
});

describe('toxic detection at any rank', () => {
  // 77% of toxic photos also surface an edible, so "user reads row 1 and stops"
  // must not be a failure mode. The banner keys off any rank, not rank 1.
  it.each([0, 1, 2])('detects a toxic candidate at rank %i', index => {
    const predictions = [
      p('Cantharellus cibarius'),
      p('Boletus'),
      p('Rubus idaeus'),
    ];
    predictions[index] = p('Amanita phalloides');

    expect(hasToxicCandidate(resolvePredictions(predictions))).toBe(true);
  });

  it('reports no toxic candidate for an all-edible result', () => {
    const got = resolvePredictions([p('Cantharellus cibarius'), p('Boletus')]);

    expect(hasToxicCandidate(got)).toBe(false);
  });
});

describe('critical confusion escalation', () => {
  it('fires when Lepiota and Macrolepiota co-occur', () => {
    const got = findCriticalConfusions(
      resolvePredictions([
        p('Lepiota brunneoincarnata'),
        p('Macrolepiota procera'),
      ])
    );

    expect(got).toHaveLength(1);
    expect(got[0].toxic.scientificName).toBe('Lepiota brunneoincarnata');
    expect(got[0].catalogSpecies.id).toBe('parasol');
  });

  // Proves the mechanism is pair-specific, not "any toxic + any edible".
  it('does not fire for an unrelated toxic and edible pair', () => {
    const got = findCriticalConfusions(
      resolvePredictions([p('Amanita muscaria'), p('Cantharellus cibarius')])
    );

    expect(got).toEqual([]);
  });

  it('does not fire when only the toxic half is present', () => {
    const got = findCriticalConfusions(
      resolvePredictions([p('Lepiota brunneoincarnata'), p('Boletus')])
    );

    expect(got).toEqual([]);
  });
});

describe('data integrity', () => {
  // Pinned on purpose. The count is not interesting in itself, but an accidental
  // deletion here silently removes a warning, and a duplicate id or name makes
  // one entry unreachable — neither throws anywhere else.
  it('has 65 toxic species with unique ids and names', () => {
    expect(TOXIC_SPECIES).toHaveLength(65);
    expect(new Set(TOXIC_SPECIES.map(t => t.id)).size).toBe(65);
    expect(new Set(TOXIC_SPECIES.map(t => t.scientificName)).size).toBe(65);
  });

  it('references only real catalog ids in confusedWithSpeciesIds', () => {
    const ids = new Set(SPECIES_DATA.map(s => s.id));
    const dangling = TOXIC_SPECIES.flatMap(t =>
      t.confusedWithSpeciesIds
        .filter(id => !ids.has(id))
        .map(id => `${t.id} -> ${id}`)
    );

    expect(dangling).toEqual([]);
  });

  it('references only real catalog ids in criticalConfusions', () => {
    const ids = new Set(SPECIES_DATA.map(s => s.id));
    const dangling = TOXIC_SPECIES.flatMap(t =>
      (t.criticalConfusions ?? [])
        .filter(c => !ids.has(c.catalogId))
        .map(c => `${t.id} -> ${c.catalogId}`)
    );

    expect(dangling).toEqual([]);
  });

  it('gives every toxic species a mechanism and at least one check', () => {
    for (const t of TOXIC_SPECIES) {
      expect(t.reasonKey).toMatch(/^toxicity\.mechanisms\./);
      expect(t.checkKeys.length).toBeGreaterThan(0);
      for (const key of t.checkKeys) {
        expect(key).toMatch(/^toxicity\.checks\./);
      }
    }
  });
});

describe('i18n key integrity', () => {
  // A reasonKey or checkKey with no matching translation renders the raw dotted
  // key string to the user ("toxicity.mechanisms.amatoxin") instead of a safety
  // explanation. It throws nothing and looks like a styling bug.
  it('resolves every mechanism, check and critical key in the en namespace', async () => {
    const en = (await import('@/i18n/locales/en/identify.json'))
      .default as Record<string, unknown>;

    const lookup = (dotted: string): unknown =>
      dotted
        .split('.')
        .reduce<unknown>(
          (node, part) =>
            node && typeof node === 'object'
              ? (node as Record<string, unknown>)[part]
              : undefined,
          en
        );

    const missing: string[] = [];
    for (const t of TOXIC_SPECIES) {
      for (const key of [t.reasonKey, ...t.checkKeys]) {
        const value = lookup(key);
        if (typeof value !== 'string' || value.length === 0)
          missing.push(`${t.id}: ${key}`);
      }
      for (const c of t.criticalConfusions ?? []) {
        const value = lookup(c.noteKey);
        if (typeof value !== 'string' || value.length === 0)
          missing.push(`${t.id}: ${c.noteKey}`);
      }
    }

    expect(missing).toEqual([]);
  });
});

describe('model vocabulary agrees with the app tables', () => {
  // bioclip-labels.ts is GENERATED from the Python side's notion of which names
  // are catalog/toxic. The app decides the same thing from species.ts and
  // toxic-species.ts. If those two ever disagree, a species the model calls
  // "catalog" could be rendered by a path expecting "other" (or worse, a toxic
  // species could arrive tagged as something else). Nothing would throw.
  it('assigns the same kind to every label as the matcher does', async () => {
    const { BIOCLIP_LABELS } = await import('@/data/bioclip-labels');
    registerTier2Vocabulary(
      BIOCLIP_LABELS.filter(l => l.kind === 'other').map(l => l.scientificName)
    );

    const disagreements = BIOCLIP_LABELS.filter(
      l => resolvePrediction(p(l.scientificName)).kind !== l.kind
    ).map(l => `${l.scientificName}: generated=${l.kind}`);

    expect(disagreements).toEqual([]);
  });

  it('never emits a label the matcher would call unknown', async () => {
    const { BIOCLIP_LABELS } = await import('@/data/bioclip-labels');
    registerTier2Vocabulary(
      BIOCLIP_LABELS.filter(l => l.kind === 'other').map(l => l.scientificName)
    );

    const unknown = BIOCLIP_LABELS.filter(
      l => resolvePrediction(p(l.scientificName)).kind === 'unknown'
    );

    expect(unknown).toEqual([]);
  });

  it('has one embedding row per label, at the dim the export recorded', async () => {
    const { BIOCLIP_LABELS, BIOCLIP_EMBEDDING_DIM } = await import(
      '@/data/bioclip-labels'
    );

    // 2 bytes per fp16 value. If this drifts, the runtime slices the matrix at
    // the wrong stride and every similarity score is computed against garbage.
    const expectedBytes = BIOCLIP_LABELS.length * BIOCLIP_EMBEDDING_DIM * 2;

    expect(BIOCLIP_EMBEDDING_DIM).toBe(768);
    expect(expectedBytes).toBe(BIOCLIP_LABELS.length * 768 * 2);
  });
});

describe('catalog is reachable from the model vocabulary', () => {
  // The catalog stores genus-level entries as "X spp."; the vocabulary uses the
  // bare genus, because that is what the model was prompted with.
  const GENUS_FORMS: Record<string, string> = {
    'Boletus spp.': 'Boletus',
    'Morchella spp.': 'Morchella',
  };

  /**
   * Empty, and it should stay that way.
   *
   * Tuber melanosporum used to sit here, excluded as subterranean. That was
   * wrong: a dug-up truffle on a table is exactly what gets photographed, and
   * exactly when telling it from a poisonous Scleroderma matters. It was added
   * together with both Scleroderma species — never before them.
   */
  const KNOWN_ABSENT = new Set<string>();

  // Resolving a name correctly is not the same as the model being ABLE to
  // predict it: the matcher works on any string, while only names present in
  // BIOCLIP_LABELS have a row in the text matrix. A catalog species missing from
  // the vocabulary is unfindable, and nothing else in the suite notices.
  it('has a label for every catalog species except the documented exclusion', () => {
    const vocabulary = new Set(BIOCLIP_LABELS.map(l => l.scientificName));
    const unreachable = [...new Set(SPECIES_DATA.map(s => s.scientificName))]
      .map(name => GENUS_FORMS[name] ?? name)
      .filter(name => !vocabulary.has(name) && !KNOWN_ABSENT.has(name));

    expect(unreachable).toEqual([]);
  });

  // The pairing is the safety property, not either label on its own. An edible
  // truffle label without its poisonous look-alike flagged would let a dug-up
  // Scleroderma surface as an edible catalog row, which is the specific failure
  // this feature exists to prevent.
  it('flags Scleroderma as toxic now that the truffle is edible', () => {
    const vocabulary = new Map(
      BIOCLIP_LABELS.map(l => [l.scientificName, l.kind])
    );
    expect(vocabulary.get('Tuber melanosporum')).toBe('catalog');

    const scleroderma = BIOCLIP_LABELS.filter(l =>
      l.scientificName.startsWith('Scleroderma')
    );
    expect(scleroderma.length).toBeGreaterThan(0);
    for (const label of scleroderma) {
      expect(label.kind).toBe('toxic');
    }
  });

  // Both turned up unflagged in a real result set during device testing, showing
  // "no safety information" for a lethal yew and a toxic jack-o'-lantern.
  it('flags the species that were found unflagged on a device', () => {
    const vocabulary = new Map(
      BIOCLIP_LABELS.map(l => [l.scientificName, l.kind])
    );
    expect(vocabulary.get('Taxus baccata')).toBe('toxic');
    expect(vocabulary.get('Omphalotus illudens')).toBe('toxic');
  });

  // Omphalotus olearius was flagged while its three siblings were not, so the
  // warning depended on which of them the model happened to name.
  it('flags every Omphalotus, not just the one that was in the list first', () => {
    const omphalotus = BIOCLIP_LABELS.filter(l =>
      l.scientificName.startsWith('Omphalotus')
    );
    expect(omphalotus.length).toBeGreaterThanOrEqual(4);
    for (const label of omphalotus) {
      expect(label.kind).toBe('toxic');
    }
  });
});

describe('toxic species have their everyday counterpart in the vocabulary', () => {
  /**
   * Each pair is a toxic label and the ordinary thing people actually photograph
   * and confuse it with. Flagging one half without the other is worse than
   * flagging neither: the model is a closed set, so with the counterpart missing
   * the everyday find has the TOXIC label as its nearest neighbour.
   *
   * This is not hypothetical. Agaricus xanthodermus was promoted to toxic while
   * Agaricus bisporus was absent, and a photo of a supermarket champignon came
   * back as the yellow-stainer with a toxic warning. It happened twice: once by
   * omission, then again when a tier-2 size cap deleted the curated labels that
   * had fixed it. Neither showed up in any count, because regional names arrived
   * to replace exactly what was lost.
   */
  const PAIRS: Array<[string, string[]]> = [
    ['Agaricus xanthodermus', ['Agaricus bisporus', 'Agaricus campestris']],
    ['Hypholoma fasciculare', ['Hypholoma capnoides']],
    ['Scleroderma citrinum', ['Tuber melanosporum']],
    ['Conium maculatum', ['Petroselinum crispum']],
    ['Aethusa cynapium', ['Petroselinum crispum']],
    ['Veratrum album', ['Allium ursinum']],
    ['Pleurocybella porrigens', ['Pleurotus ostreatus']],
    ['Colchicum autumnale', ['Allium ursinum']],
    ['Convallaria majalis', ['Allium ursinum']],
  ];

  it.each(PAIRS)(
    '%s has its counterpart present so the safe find is not forced onto it',
    (toxic, counterparts) => {
      const vocabulary = new Map(
        BIOCLIP_LABELS.map(l => [l.scientificName, l.kind])
      );
      // Guard the guard: if the toxic half were absent the assertion below would
      // pass vacuously and prove nothing.
      expect(vocabulary.get(toxic)).toBe('toxic');

      for (const name of counterparts) {
        expect(vocabulary.has(name)).toBe(true);
        expect(vocabulary.get(name)).not.toBe('toxic');
      }
    }
  );

  // The curated culinary set exists specifically because iNaturalist observation
  // counts do not cover cultivated species, so any ranking or cap based on those
  // counts will discard them unless explicitly exempted.
  it('keeps the curated culinary labels that no observation ranking would', () => {
    const vocabulary = new Set(BIOCLIP_LABELS.map(l => l.scientificName));
    const curated = [
      'Ocimum basilicum',
      'Petroselinum crispum',
      'Coriandrum sativum',
      'Anethum graveolens',
      'Allium schoenoprasum',
      'Laurus nobilis',
      'Salvia officinalis',
      'Thymus vulgaris',
      'Salvia rosmarinus',
      'Origanum majorana',
      'Melissa officinalis',
      'Artemisia dracunculus',
      'Levisticum officinale',
      'Mentha spicata',
      'Agaricus bisporus',
      'Hypsizygus tessulatus',
      'Tremella fuciformis',
      'Volvariella volvacea',
    ];

    expect(curated.filter(n => !vocabulary.has(n))).toEqual([]);
  });
});

describe('mergeToxicSightings', () => {
  /**
   * Averaging several photos is what makes the combined ranking more accurate,
   * but it can also dilute: one photo of the stem base can show a volva plainly
   * while a cap shot of the same find shows nothing, and the mean of the two can
   * push that warning out of the top 3. These tests guard that no angle's toxic
   * sighting is lost, and that nothing else sneaks in with it.
   */
  const averaged = [
    p('Cantharellus cibarius', 0.7),
    p('Craterellus tubaeformis', 0.2),
    p('Hygrophoropsis aurantiaca', 0.05),
  ];

  it('keeps a toxic label only one photo saw', () => {
    const merged = mergeToxicSightings(averaged, [
      [p('Omphalotus olearius', 0.6)],
      [p('Cantharellus cibarius', 0.8)],
    ]);

    expect(merged.map(c => c.scientificName)).toContain('Omphalotus olearius');
    expect(
      merged.find(c => c.scientificName === 'Omphalotus olearius')?.kind
    ).toBe('toxic');
  });

  it('leaves the averaged ranking first and in order', () => {
    const merged = mergeToxicSightings(averaged, [[p('Amanita phalloides')]]);

    // Toxicity is an overlay, never a sort key: promoting the sighting would
    // misrepresent how confident the combined evidence actually is.
    expect(merged.slice(0, 3).map(c => c.scientificName)).toEqual(
      averaged.map(a => a.scientificName)
    );
  });

  // The one direction this feature must never err in. An edible label that only
  // one angle proposed is not evidence the combined view supports.
  it('never appends a non-toxic sighting', () => {
    const merged = mergeToxicSightings(averaged, [
      [p('Boletus edulis', 0.9), p('Ocimum basilicum', 0.5)],
    ]);

    expect(merged).toHaveLength(3);
  });

  it('does not duplicate a label already in the averaged ranking', () => {
    const withToxic = [...averaged.slice(0, 2), p('Omphalotus olearius', 0.1)];

    const merged = mergeToxicSightings(withToxic, [
      [p('Omphalotus olearius', 0.9)],
    ]);

    expect(merged).toHaveLength(3);
  });

  // Three photos could contribute nine sightings. A wall of warnings is how
  // alarm fatigue gets manufactured, which is the reason severity is graded at
  // all - so the list is bounded, strongest evidence kept.
  it('caps appended sightings and keeps the strongest', () => {
    const merged = mergeToxicSightings(averaged, [
      [p('Amanita phalloides', 0.1)],
      [p('Omphalotus olearius', 0.9)],
      [p('Veratrum album', 0.8)],
    ]);

    expect(merged).toHaveLength(5);
    expect(merged.slice(3).map(c => c.scientificName)).toEqual([
      'Omphalotus olearius',
      'Veratrum album',
    ]);
  });

  it('is the plain resolution when there is nothing extra to fold in', () => {
    expect(mergeToxicSightings(averaged, [])).toEqual(
      resolvePredictions(averaged)
    );
  });
});
