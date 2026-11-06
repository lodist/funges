import { describe, expect, it } from 'vitest';
import { SPECIES_DATA } from '@/data/species';

const LOCALES = ['en', 'de', 'es', 'fr', 'it', 'pt'] as const;
const REQUIRED = [
  'identify',
  'habitat',
  'season',
  'picking',
  'kitchen',
  'source',
];

type SpeciesFile = {
  list_of_species: Record<string, { guide?: Record<string, string> }>;
};
const files = import.meta.glob<SpeciesFile>('../i18n/locales/*/species.json', {
  eager: true,
  import: 'default',
});
const list = (locale: string) =>
  files[`../i18n/locales/${locale}/species.json`].list_of_species;

describe('species guides', () => {
  for (const species of SPECIES_DATA) {
    const key = species.nameKey.replace(/\.name$/, '');
    it(`${species.id} has the same complete guide in every language`, () => {
      const en = list('en')[key]?.guide;
      expect(en, 'en guide').toBeDefined();
      for (const part of REQUIRED)
        expect(en?.[part]?.trim(), part).toBeTruthy();
      for (const locale of LOCALES) {
        const guide = list(locale)[key]?.guide ?? {};
        expect(Object.keys(guide).sort(), locale).toEqual(
          Object.keys(en ?? {}).sort()
        );
        for (const text of Object.values(guide)) {
          expect(text).not.toContain('—');
          expect(text).not.toContain('{{');
        }
      }
    });
  }
});
