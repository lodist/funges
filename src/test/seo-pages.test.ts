import { describe, expect, it } from 'vitest';
import {
  alternates,
  cropPageDescription,
  localizedPath,
  pageTitle,
  pathLanguage,
  stripLanguage,
} from '@/lib/seo-pages';

describe('seo-pages', () => {
  it('puts English at the root and German under /de, always with a slash', () => {
    expect(localizedPath('/species/porcini', 'en')).toBe('/species/porcini/');
    expect(localizedPath('/species/porcini/', 'de')).toBe(
      '/de/species/porcini/'
    );
    expect(localizedPath('/de/species/porcini/', 'en')).toBe(
      '/species/porcini/'
    );
    expect(localizedPath('/', 'de')).toBe('/de/');
    expect(localizedPath('/', 'en')).toBe('/');
  });

  it('reads the language from the path, null when unprefixed', () => {
    expect(pathLanguage('/de/huerta/species/tomato/')).toBe('de');
    expect(pathLanguage('/de')).toBe('de');
    expect(pathLanguage('/species/porcini/')).toBeNull();
    expect(pathLanguage('/delete-account/')).toBeNull();
    expect(pathLanguage('/')).toBeNull();
    expect(stripLanguage('/de/species/porcini/')).toBe('/species/porcini/');
    expect(stripLanguage('/de')).toBe('/');
  });

  it('lists every language and x-default, the same set from each version', () => {
    const fromEn = alternates('/species/porcini/', 'https://www.fung.es');
    const fromDe = alternates('/de/species/porcini/', 'https://www.fung.es');
    expect(fromEn).toEqual(fromDe);
    expect(fromEn.map(a => a.hreflang)).toEqual(['en', 'de', 'x-default']);
    expect(fromEn[1].href).toBe('https://www.fung.es/de/species/porcini/');
    expect(fromEn[2].href).toBe('https://www.fung.es/species/porcini/');
  });

  it('formats titles once for the app and the static pages', () => {
    expect(pageTitle('Porcini')).toBe('Porcini · Funges');
    expect(
      pageTitle('Funges: foraging map and garden planner', { bare: true })
    ).toBe('Funges: foraging map and garden planner');
  });

  it('cuts a description at its last sentence within 160 characters', () => {
    const short = 'Grown for its fruit. Easy in a pot.';
    expect(cropPageDescription(short)).toBe(short);
    const long = `${'A'.repeat(100)}. ${'B'.repeat(100)}.`;
    expect(cropPageDescription(long)).toBe(`${'A'.repeat(100)}.`);
  });
});
