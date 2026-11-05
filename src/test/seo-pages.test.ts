import { describe, expect, it } from 'vitest';
import {
  alternates,
  cropOfPath,
  cropPageDescription,
  huertaPage,
  localizedPath,
  pageTitle,
  pathLanguage,
  stripLanguage,
} from '@/lib/seo-pages';
import { SPECIES_DATA } from '@/data/species';
import { CROPS } from '@/lib/huerta';
import { buildPages, renderPage } from '../../scripts/seo-pages';

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

  it("gives Huerta's pages the language's words", () => {
    expect(localizedPath('/huerta/map', 'de')).toBe('/de/huerta/karte/');
    expect(localizedPath('/de/huerta/gartenplaner/', 'en')).toBe(
      '/huerta/garden-planner/'
    );
    expect(localizedPath('/huerta/planting-calendar/', 'de')).toBe(
      '/de/huerta/pflanzkalender/'
    );
    expect(localizedPath('/de/huerta/pflanzen', 'en')).toBe('/huerta/crops/');
    expect(huertaPage('crops', 'de-CH')).toBe('/de/huerta/pflanzen');
    expect(huertaPage('calendar', 'fr')).toBe('/huerta/planting-calendar');
  });

  it("gives a crop's page the language's words, hyphens between them", () => {
    expect(localizedPath('/huerta/crops/broad_beans/', 'en')).toBe(
      '/huerta/crops/broad-beans/'
    );
    expect(localizedPath('/huerta/crops/broad_beans/', 'de')).toBe(
      '/de/huerta/pflanzen/dicke-bohnen/'
    );
    expect(localizedPath('/de/huerta/pflanzen/moehre/', 'en')).toBe(
      '/huerta/crops/carrot/'
    );
    expect(
      alternates('/de/huerta/pflanzen/dicke-bohnen/', 'https://www.fung.es')
    ).toEqual(alternates('/huerta/crops/broad-beans/', 'https://www.fung.es'));
    // Its crop from any form of its path; none for an unknown word.
    expect(cropOfPath('/huerta/crops/brussels-sprouts')).toBe(
      'brussels_sprouts'
    );
    expect(cropOfPath('/de/huerta/pflanzen/rosenkohl/')).toBe(
      'brussels_sprouts'
    );
    expect(cropOfPath('/de/huerta/crops/tomato/')).toBe('tomato');
    for (const path of [
      '/huerta/crops/',
      '/huerta/crops/constructor/',
      '/de/huerta/pflanzen/tomato/',
      '/species/porcini/',
    ])
      expect(cropOfPath(path), path).toBeNull();
  });

  it('reads the language from the path, null when unprefixed', () => {
    expect(pathLanguage('/de/huerta/crops/tomato/')).toBe('de');
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

describe('buildPages', () => {
  const pages = buildPages();

  it('has every species and crop in English and German', () => {
    for (const lang of ['en', 'de'] as const) {
      for (const s of SPECIES_DATA)
        expect(
          pages.some(p => p.path === localizedPath(`/species/${s.id}/`, lang)),
          `${lang} ${s.id}`
        ).toBe(true);
      for (const c of CROPS)
        expect(
          pages.some(
            p => p.path === localizedPath(`/huerta/crops/${c.id}/`, lang)
          ),
          `${lang} ${c.id}`
        ).toBe(true);
    }
  });

  it('gives each page a unique title and a description under 160 characters', () => {
    const titles = pages.map(p => p.title);
    expect(titles.filter((t, i) => titles.indexOf(t) !== i)).toEqual([]);
    for (const p of pages) {
      expect(p.title, p.path).not.toMatch(/^ ·|\{\{/);
      expect(p.description.length, p.path).toBeGreaterThan(0);
      expect(p.description.length, p.path).toBeLessThanOrEqual(160);
    }
  });

  it('writes each page in its language with its links and text', () => {
    const shell =
      '<html lang="en"><head><title>x</title>\n<meta name="description" content="y" />\n</head><body><div id="root"></div></body></html>';
    const page = pages.find(p => p.path === '/de/species/mushroom/')!;
    const html = renderPage(shell, page, 'https://www.fung.es');
    expect(html).toContain('<html lang="de"');
    expect(html).toContain('<h1>Steinpilz</h1>');
    expect(html).toContain(
      'rel="canonical" href="https://www.fung.es/de/species/mushroom/"'
    );
    expect(html).toContain('hreflang="x-default"');
    expect(html).not.toContain('<title>x</title>');
  });

  it("writes a page's text as it is, dollar signs too", () => {
    const shell =
      '<html lang="en"><head><title>x</title>\n<meta name="description" content="y" />\n</head><body><div id="root"></div></body></html>';
    const page = { ...pages[0], body: "<p>$& $' $$ $1</p>" };
    expect(renderPage(shell, page, 'https://www.fung.es')).toContain(
      `<div id="root"><p>$& $' $$ $1</p></div>`
    );
  });
});
