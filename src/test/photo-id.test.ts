import { describe, expect, it, beforeEach } from 'vitest';
import { SPECIES_DATA } from '@/data/species';
import { TOXIC_SPECIES } from '@/data/toxic-species';
import {
  findCriticalConfusions,
  hasToxicCandidate,
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
  it('has 22 toxic species with unique ids and names', () => {
    expect(TOXIC_SPECIES).toHaveLength(22);
    expect(new Set(TOXIC_SPECIES.map(t => t.id)).size).toBe(22);
    expect(new Set(TOXIC_SPECIES.map(t => t.scientificName)).size).toBe(22);
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
