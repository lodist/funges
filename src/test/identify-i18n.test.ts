import { describe, expect, it } from 'vitest';
import { TOXIC_SPECIES } from '@/data/toxic-species';
import de from '@/i18n/locales/de/identify.json';
import en from '@/i18n/locales/en/identify.json';
import es from '@/i18n/locales/es/identify.json';
import fr from '@/i18n/locales/fr/identify.json';
// Aliased: a bare `it` would shadow vitest's own `it`, and the whole file
// silently collects zero tests.
import itIT from '@/i18n/locales/it/identify.json';
import pt from '@/i18n/locales/pt/identify.json';

/**
 * Guards the identify namespace across all six languages.
 *
 * A missing key does not throw — i18next renders the raw dotted path, so a user
 * would see "toxicity.mechanisms.amatoxin" where the explanation of a lethal
 * toxin should be. In this namespace that is a safety failure, not a cosmetic
 * one, which is why key parity is asserted rather than assumed.
 */

type Json = Record<string, unknown>;

const BUNDLES: Record<string, Json> = { en, de, es, fr, it: itIT, pt };
const OTHERS = ['de', 'es', 'fr', 'it', 'pt'] as const;

function flatten(value: Json, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, child] of Object.entries(value)) {
    const path = `${prefix}${key}`;
    if (child && typeof child === 'object') {
      Object.assign(out, flatten(child as Json, `${path}.`));
    } else {
      out[path] = String(child);
    }
  }
  return out;
}

const FLAT = Object.fromEntries(
  Object.entries(BUNDLES).map(([lang, bundle]) => [lang, flatten(bundle)])
) as Record<string, Record<string, string>>;

const placeholders = (s: string) =>
  [...s.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]).sort();

describe('identify namespace parity', () => {
  it.each(OTHERS)('%s has exactly the same keys as en', lang => {
    const expected = Object.keys(FLAT.en).sort();
    const actual = Object.keys(FLAT[lang]).sort();

    expect(actual).toEqual(expected);
  });

  it.each(OTHERS)('%s has no empty strings', lang => {
    const empty = Object.entries(FLAT[lang])
      .filter(([, v]) => v.trim().length === 0)
      .map(([k]) => k);

    expect(empty).toEqual([]);
  });

  // A dropped {{size}} or {{percent}} renders the literal braces to the user.
  it.each(OTHERS)('%s preserves every interpolation placeholder', lang => {
    const drifted: string[] = [];
    for (const [key, english] of Object.entries(FLAT.en)) {
      const want = placeholders(english);
      if (want.length === 0) continue;
      const got = placeholders(FLAT[lang][key] ?? '');
      if (want.join(',') !== got.join(',')) {
        drifted.push(`${key}: expected ${want} got ${got}`);
      }
    }

    expect(drifted).toEqual([]);
  });
});

describe('every language can explain every toxic species', () => {
  // The species table references these keys by name. If a language is missing
  // one, that species' danger is described to the user as a dotted path.
  it.each(['en', ...OTHERS])(
    '%s resolves all mechanism and check keys',
    lang => {
      const missing: string[] = [];
      for (const species of TOXIC_SPECIES) {
        const keys = [
          species.reasonKey,
          ...species.checkKeys,
          ...(species.criticalConfusions ?? []).map(c => c.noteKey),
        ];
        for (const key of keys) {
          const value = FLAT[lang][key];
          if (!value || value.trim().length === 0) {
            missing.push(`${species.id}: ${key}`);
          }
        }
      }

      expect(missing).toEqual([]);
    }
  );
});

describe('safety framing survives translation', () => {
  // The feature narrows candidates and never confirms edibility. Each language's
  // "do not eat" labels are what the UI shows on a toxic row, so they must be
  // present and distinct from the neutral one.
  it.each(['en', ...OTHERS])(
    '%s distinguishes lethal from merely inedible',
    lang => {
      const flat = FLAT[lang];

      expect(flat['results.toxicLabel']).toBeTruthy();
      expect(flat['results.lethalLabel']).toBeTruthy();
      expect(flat['results.inedibleLabel']).toBeTruthy();
      // Collapsing these would either overstate a bitter bolete or understate a
      // death cap.
      expect(flat['results.lethalLabel']).not.toBe(
        flat['results.inedibleLabel']
      );
      expect(flat['results.toxicLabel']).not.toBe(
        flat['results.inedibleLabel']
      );
    }
  );

  it.each(['en', ...OTHERS])('%s keeps the three disclaimer strings', lang => {
    const flat = FLAT[lang];

    expect(flat['disclaimer.beforeCapture']).toBeTruthy();
    expect(flat['disclaimer.aboveResults']).toBeTruthy();
    expect(flat['disclaimer.neverEat']).toBeTruthy();
  });
});
