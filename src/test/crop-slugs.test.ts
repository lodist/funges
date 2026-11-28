import { describe, expect, it } from 'vitest';
import { CROP_SLUGS } from '@/lib/crop-slugs';
import { CROPS } from '@/lib/huerta';
import de from '@/i18n/locales/de/huerta.json';
import fr from '@/i18n/locales/fr/huerta.json';
import es from '@/i18n/locales/es/huerta.json';
import it_ from '@/i18n/locales/it/huerta.json';
import pt from '@/i18n/locales/pt/huerta.json';

const NAMES = { de, fr, es, it: it_, pt };

// The name as a path word: lower case, umlauts and ligatures written out
// (Swiss German has no ß), other accents dropped, anything else between
// words a hyphen.
const word = (name: string) =>
  name
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

describe("crops' path words", () => {
  for (const [lang, slugs] of Object.entries(CROP_SLUGS))
    it(`${lang}: one for every crop, each its name, none twice`, () => {
      expect(Object.keys(slugs).sort()).toEqual(CROPS.map(c => c.id).sort());
      const names = NAMES[lang as keyof typeof NAMES].crops as Record<
        string,
        string
      >;
      for (const [id, slug] of Object.entries(slugs))
        expect(slug, id).toBe(word(names[id]));
      const words = Object.values(slugs);
      expect(new Set(words).size).toBe(words.length);
    });
});
