import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
import {
  appPages,
  appShell,
  atlasPages,
  buildPages,
  renderPage,
  sitemap,
} from '../../scripts/seo-pages';

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

describe('every page the site serves', () => {
  const ORIGIN = 'https://www.fung.es';
  const shell =
    '<html lang="en"><head><title>x</title>\n<meta name="description" content="y" />\n</head><body><div id="root"></div></body></html>';
  const indexed = buildPages();
  const apps = appPages();
  const pages = [...indexed, ...apps];
  const page = (p: string) => pages.find(x => x.path === p)!;

  // Each of these once got a copy of the front page in the deploy, or a
  // reload, a shared link or a morning alert landed on 404.html.
  it('writes every route the app has, in its own folder', () => {
    const paths = new Set(pages.map(p => p.path));
    for (const route of [
      'data',
      'data/seasons',
      'delete-account',
      'huerta',
      'huerta/account',
      'huerta/instructions',
      'huerta/settings',
      'huerta/map',
      'huerta/garden-planner',
      'huerta/signin',
      'huerta/crops',
      'huerta/planting-calendar',
      'de/huerta/pflanzen',
      'de/huerta/karte',
      'de/huerta/gartenplaner',
      'de/huerta/pflanzkalender',
      'identify',
      'impressum',
      'instructions',
      'map',
      'offline',
      'privacy-policy',
      'recipes',
      'settings',
      'species',
      'support',
      'termsuse',
      'worth-foraging-now',
    ])
      expect(paths.has(`/${route}/`), route).toBe(true);
  });

  it('gives each app page its own title and a description that fits', () => {
    const titles = pages.map(p => p.title);
    expect(titles.filter((t, i) => titles.indexOf(t) !== i)).toEqual([]);
    for (const p of apps) {
      expect(p.title, p.path).not.toBe(page('/').title);
      expect(p.description.length, p.path).toBeGreaterThan(20);
      expect(p.description.length, p.path).toBeLessThanOrEqual(160);
    }
    expect(page('/de/huerta/karte/').lang).toBe('de');
    expect(page('/map/').hreflang).toBe(false);
    expect(page('/huerta/crops/').hreflang).toBe(true);
  });

  it('lists what search engines may index, and nothing else', () => {
    const xml = sitemap(pages, ORIGIN);
    for (const p of ['/settings/', '/offline/', '/huerta/crops/'])
      expect(xml, p).not.toContain(`<loc>${ORIGIN}${p}</loc>`);
    expect(xml).toContain(`<loc>${ORIGIN}/map/</loc>`);
    expect(xml).toContain(`<loc>${ORIGIN}/huerta/instructions/</loc>`);
    expect(xml).toContain(
      `<loc>${ORIGIN}/huerta/planting-calendar/</loc>\n    <xhtml:link rel="alternate" hreflang="en"`
    );
    expect(xml).toContain(
      `hreflang="de" href="${ORIGIN}/de/huerta/pflanzkalender/"`
    );
  });

  it('writes share tags with full URLs, and noindex where asked', () => {
    const map = renderPage(shell, page('/map/'), ORIGIN);
    expect(map).toContain(`property="og:image" content="${ORIGIN}/share.jpg"`);
    expect(map).toContain('name="twitter:card" content="summary_large_image"');
    expect(map).not.toContain('hreflang');
    expect(map).not.toContain('noindex');
    expect(renderPage(shell, page('/settings/'), ORIGIN)).toContain(
      '<meta name="robots" content="noindex" />'
    );
    expect(appShell(shell)).toContain(
      '<meta name="robots" content="noindex" />'
    );
  });

  it("tells search engines the site's name, and each guide's place in it", () => {
    const front = renderPage(shell, page('/'), ORIGIN);
    const data = JSON.parse(
      /<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/.exec(
        front
      )![1]
    );
    expect(data['@graph'][0]).toMatchObject({
      '@type': 'WebSite',
      name: 'Funges',
    });
    expect(front).toContain('rel="canonical" href="https://www.fung.es/"');
    expect(front).toContain('rel="preload" as="image" href="/landing/');
    const porcini = renderPage(shell, page('/de/species/mushroom/'), ORIGIN);
    expect(porcini).toContain('"item":"https://www.fung.es/de/terra/"');
    expect(porcini).toContain('"name":"Steinpilz"');
  });

  it("names a species' photo and shares it, when the build knows it", () => {
    const [chant] = buildPages(
      new Map([['chant', '/assets/chant-x.webp']])
    ).filter(p => p.path === '/species/chant/');
    const html = renderPage(shell, chant, ORIGIN);
    expect(html).toContain(
      '<img src="/assets/chant-x.webp" alt="Golden Chanterelle (Cantharellus cibarius)"'
    );
    expect(html).toContain(
      `property="og:image" content="${ORIGIN}/assets/chant-x.webp"`
    );
    expect(html).toContain('name="twitter:card" content="summary"');
  });

  it("writes the season atlas's pages from its files, none without them", () => {
    const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-'));
    expect(atlasPages(dist)).toEqual([]);
    const atlas = path.join(dist, 'season-atlas');
    fs.mkdirSync(atlas);
    fs.writeFileSync(
      path.join(atlas, 'index.json'),
      JSON.stringify({
        places: [
          {
            id: 'czechia',
            kind: 'country',
            iso: 'CZ',
            name: 'Czech Republic',
            continent: 'EU',
            species: ['mushroom', 'chant'],
          },
        ],
        slugs: { mushroom: 'porcini' },
      })
    );
    const autumn = [0, 0, 0, 0, 0, 0.1, 0.6, 1, 0.8, 0.5, 0, 0];
    fs.writeFileSync(
      path.join(atlas, 'czechia.json'),
      JSON.stringify({
        species: {
          mushroom: { records: 1996, curve: autumn },
          chant: { records: 3, curve: autumn },
        },
      })
    );
    const [porcini, chant] = atlasPages(dist);
    expect(porcini.path).toBe('/data/seasons/czechia/porcini/');
    // The country's name as the app shows it, so the built title is the app's.
    expect(porcini.title).toBe('Porcini season in Czechia · Funges');
    expect(porcini.description).toBe(
      'Porcini season in Czechia. It peaks in August. The main season is Jul–Oct. Based on 1,996 recorded finds since 2010.'
    );
    expect(porcini.noindex).toBe(false);
    // Hardly ever recorded there: kept out of search engines and the sitemap.
    expect(chant.path).toBe('/data/seasons/czechia/chant/');
    expect(chant.noindex).toBe(true);
    const xml = sitemap([porcini, chant], 'https://www.fung.es');
    expect(xml).toContain('/data/seasons/czechia/porcini/');
    expect(xml).not.toContain('/data/seasons/czechia/chant/');
  });
});
