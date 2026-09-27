import { describe, expect, it } from 'vitest';
import en from '@/i18n/locales/en/species.json';
import { SPECIES_DATA, speciesNameKey } from '@/data/species';

// The map selector, its fullscreen list and the map popup look names up by
// species id. Locale keys follow the manifest's translationKey, which differs
// from the id for a few species (chicken-of-the-woods -> chickenOfTheWoods), so
// `${id}.name` rendered the raw key once those species reached the map.
describe('species name keys', () => {
  it('resolves a name for every catalog species id', () => {
    const names = en.list_of_species as Record<string, { name?: string }>;
    for (const { id } of SPECIES_DATA) {
      const [key] = speciesNameKey(id).split('.');
      expect(names[key]?.name, id).toBeTruthy();
    }
  });
});
