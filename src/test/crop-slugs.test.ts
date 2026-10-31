import { describe, expect, it } from 'vitest';
import { CROP_DE } from '@/lib/crop-slugs';
import { CROPS } from '@/lib/huerta';
import de from '@/i18n/locales/de/huerta.json';

// The German name as a path word: lower case, umlauts written out (Swiss
// German has no ß), anything else between words a hyphen.
const word = (name: string) =>
  name
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

describe("crops' German path words", () => {
  it('has one for every crop, each its German name, none twice', () => {
    expect(Object.keys(CROP_DE).sort()).toEqual(CROPS.map(c => c.id).sort());
    const names = de.crops as Record<string, string>;
    for (const [id, slug] of Object.entries(CROP_DE))
      expect(slug, id).toBe(word(names[id]));
    const words = Object.values(CROP_DE);
    expect(new Set(words).size).toBe(words.length);
  });
});
