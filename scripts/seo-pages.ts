/**
 * The HTML of every page the site serves, written at build time: each species
 * and crop page and the space front pages in English and German, the app's
 * own pages (src/lib/seo-pages.ts) and the season atlas. A page is the built
 * index.html with its own title, description, canonical, share tags and
 * structured data, and for the indexed pages their text as plain HTML inside
 * #root, which the app replaces when it starts. GitHub Pages serves a folder's
 * index.html with a 200 (anything else gets 404.html). Also writes sitemap.xml.
 *
 * Reads the same files the app reads (translations, the species catalog, the
 * crop table), so imports are relative: vite.config.ts loads this file.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';
import { GENERATED_SPECIES_DATA } from '../src/generated/species-catalog';
import { TOXIC_SPECIES } from '../src/data/toxic-species';
import { CROPS } from '../src/lib/huerta';
import { GUIDES } from '../src/lib/crop-guides';
import { heroPhoto } from '../src/lib/hero-photos';
import {
  type AtlasIndex,
  type AtlasPlace,
  RARE_RECORDS,
  type Say,
  atlasDescription,
  placeLabel,
} from '../src/lib/season-atlas';
import {
  APP_PAGES,
  INDEXED_LANGUAGES,
  alternates,
  cropPageDescription,
  localizedPath,
  pageLanguages,
  pageTitle,
  type IndexedLanguage,
} from '../src/lib/seo-pages';

export interface Page {
  /** Ends in a slash: /de/species/mushroom/ */
  path: string;
  lang: IndexedLanguage;
  title: string;
  description: string;
  /** The text, as escaped plain HTML, in a <main data-static> the app
   *  replaces when it starts. */
  body: string;
  /** Written in each indexed language: hreflang links, in the sitemap too. */
  hreflang?: boolean;
  /** Kept out of search engines and the sitemap. */
  noindex?: boolean;
  /** The picture a shared link shows, a path on the site; the share card
   *  when the page has none of its own. */
  image?: string;
  /** The picture the page opens with, fetched before the app asks for it. */
  preload?: string;
  /** schema.org data for search engines, given the site's origin. */
  jsonLd?: (origin: string) => object;
}

/** A species' photo by its id: the built file's path (scripts/seo-pages.ts
 *  learns them from the bundle). */
export type Photos = ReadonlyMap<string, string>;

/** What a shared link shows for a page without a picture: the logo on the
 *  app's sand, 1200×630. */
const SHARE_CARD = '/share.jpg';
const OG_LOCALE = { en: 'en_US', de: 'de_DE' } as const;
const PLAY_URL = 'https://play.google.com/store/apps/details?id=es.fung.app';
const GITHUB_URL = 'https://github.com/lodist/funges';

// npm run build and vitest both run from the repo root (in jsdom,
// import.meta.url is no file: URL).
const ROOT = process.cwd();
type Tree = { [key: string]: string | Tree | Tree[] };
const files = new Map<string, Tree>();
function namespace(lang: string, ns: string): Tree {
  const key = `${lang}/${ns}`;
  if (!files.has(key)) {
    const file = path.join(ROOT, 'src/i18n/locales', lang, `${ns}.json`);
    files.set(key, JSON.parse(fs.readFileSync(file, 'utf8')) as Tree);
  }
  return files.get(key)!;
}

/** i18next's lookup, as far as these pages need it: a dotted key, {{vars}},
 *  English when the language lacks the key. */
function translator(lang: IndexedLanguage) {
  const find = (l: string, ns: string, key: string) =>
    key
      .split('.')
      .reduce<unknown>(
        (node, part) => (node as Record<string, unknown> | undefined)?.[part],
        namespace(l, ns)
      );
  const t = (ns: string, key: string, vars: Record<string, string> = {}) => {
    const value = find(lang, ns, key) ?? find('en', ns, key);
    if (typeof value !== 'string') return '';
    return value.replace(
      /\{\{(\w+)\}\}/g,
      (_, name: string) => vars[name] ?? ''
    );
  };
  const list = (ns: string, key: string) =>
    (find(lang, ns, key) ?? find('en', ns, key) ?? []) as {
      name: string;
      fix: string;
    }[];
  /** A `namespace:key`, as the app writes one. */
  const text = (ref: string) => {
    const [ns, key] = ref.split(/:(.*)/s);
    return t(ns, key);
  };
  return { t, list, text };
}

/** schema.org breadcrumbs: each step a name and a path, the page itself last
 *  and without one. */
const breadcrumbs = (origin: string, steps: [string, string?][]) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: steps.map(([name, href], i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name,
    ...(href ? { item: origin + href } : {}),
  })),
});

const escape = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const part = (title: string, text: string) =>
  text
    ? `<section><h2>${escape(title)}</h2><p>${escape(text)}</p></section>`
    : '';

/** Links to every species or crop page, A to Z: what lets a crawler reach
 *  them all from any one page. */
const links = (title: string, items: { href: string; name: string }[]) =>
  `<nav><h2>${escape(title)}</h2><ul>${items
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(item => `<li><a href="${item.href}">${escape(item.name)}</a></li>`)
    .join('')}</ul></nav>`;

function speciesLinks(lang: IndexedLanguage) {
  const { t } = translator(lang);
  return links(
    t('species', 'page.allSpecies'),
    GENERATED_SPECIES_DATA.map(species => ({
      href: localizedPath(`/species/${species.id}/`, lang),
      name: t('species', `list_of_species.${species.nameKey}`),
    }))
  );
}

function cropLinks(lang: IndexedLanguage) {
  const { t } = translator(lang);
  return links(
    t('huerta', 'page.allCrops'),
    CROPS.map(crop => ({
      href: localizedPath(`/huerta/crops/${crop.id}/`, lang),
      name: t('huerta', `crops.${crop.id}`),
    }))
  );
}

const SEVERITY_LABEL = {
  lethal: 'results.lethalLabel',
  toxic: 'results.toxicLabel',
  inedible: 'results.inedibleLabel',
} as const;
const SEVERITY_ORDER = ['lethal', 'toxic', 'inedible'];
const GUIDE_PARTS = [
  'identify',
  'habitat',
  'season',
  'picking',
  'kitchen',
  'keeps',
];

function speciesPage(
  species: (typeof GENERATED_SPECIES_DATA)[number],
  lang: IndexedLanguage,
  photo?: string
): Page {
  const { t } = translator(lang);
  const key = species.nameKey.replace(/\.name$/, '');
  const name = t('species', `list_of_species.${key}.name`);
  const vars = { name, latin: species.scientificName };
  const guide = (p: string) =>
    t('species', `list_of_species.${key}.guide.${p}`);
  // A composite (Chanterelles, Boletus) warns of its members' look-alikes.
  const ids = [species.id, ...(species.compositeOf ?? [])];
  // Deadliest first, as the sheet lists them.
  const lookalikes = TOXIC_SPECIES.filter(toxic =>
    toxic.confusedWithSpeciesIds.some(id => ids.includes(id))
  ).sort(
    (a, b) =>
      SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
  );
  const body = [
    `<h1>${escape(name)}</h1>`,
    `<p><i>${escape(species.scientificName)}</i></p>`,
    photo
      ? `<img src="${photo}" alt="${escape(`${name} (${species.scientificName})`)}" />`
      : '',
    `<p>${escape(t('species', `list_of_species.${key}.description`))}</p>`,
    ...GUIDE_PARTS.map(p =>
      part(
        t(
          'species',
          p === 'kitchen' && species.psychoactive
            ? 'guide.medicine'
            : `guide.${p}`
        ),
        guide(p)
      )
    ),
    lookalikes.length
      ? `<section><h2>${escape(t('species', 'sheet.lookalikes'))}</h2><ul>${lookalikes
          .map(
            toxic =>
              `<li><i>${escape(toxic.scientificName)}</i> · ${escape(
                t('identify', SEVERITY_LABEL[toxic.severity])
              )}</li>`
          )
          .join('')}</ul></section>`
      : '',
    guide('source')
      ? `<p>${escape(`${t('species', 'guide.source')}: ${guide('source')}`)}</p>`
      : '',
    `<p>${escape(t('species', 'safetyWarning'))}</p>`,
    speciesLinks(lang),
  ];
  return {
    path: localizedPath(`/species/${species.id}/`, lang),
    lang,
    title: pageTitle(t('species', 'page.title', vars)),
    description: t(
      'species',
      species.psychoactive
        ? 'page.descriptionPsychoactive'
        : 'page.description',
      vars
    ),
    body: `<main data-static>${body.join('')}</main>`,
    hreflang: true,
    image: photo,
    preload: photo,
    jsonLd: origin =>
      breadcrumbs(origin, [['Terra', localizedPath('/terra/', lang)], [name]]),
  };
}

function cropPage(crop: (typeof CROPS)[number], lang: IndexedLanguage): Page {
  const { t, list } = translator(lang);
  const name = t('huerta', `crops.${crop.id}`);
  const about = t('huerta', `grow.${crop.id}.about`);
  const guide = GUIDES[crop.id];
  const problems = list('huerta', `grow.${crop.id}.problems`);
  const harvest = [
    t('huerta', `grow.${crop.id}.harvest`),
    t('huerta', `grow.${crop.id}.keeps`),
  ]
    .filter(Boolean)
    .join(' ');
  const body = [
    `<h1>${escape(name)}</h1>`,
    `<p><i>${escape(crop.scientific)}</i></p>`,
    about ? `<p>${escape(about)}</p>` : '',
    guide
      ? part(
          t('huerta', 'grow.care'),
          `${t('huerta', 'grow.facts.water')}: ${t('huerta', `grow.${crop.id}.water`)} ${t('huerta', 'grow.facts.feed')}: ${t('huerta', `grow.${crop.id}.feed`)}`
        )
      : '',
    part(t('huerta', `grow.harvest.${crop.kind}`), harvest),
    problems.length
      ? `<section><h2>${escape(t('huerta', 'grow.problems'))}</h2><ul>${problems
          .map(p => `<li>${escape(`${p.name}. ${p.fix}`)}</li>`)
          .join('')}</ul></section>`
      : '',
    `<p>${escape(
      `${t('huerta', 'sheet.source')} ${t('huerta', `grow.${crop.id}.source`)}`.trim()
    )}</p>`,
    `<p>${escape(t('huerta', 'page.signIn'))}</p>`,
    cropLinks(lang),
  ];
  const vars = {
    name,
    start: t('huerta', `page.start.${crop.how}`),
    end: t('huerta', `page.end.${crop.kind}`),
  };
  return {
    path: localizedPath(`/huerta/crops/${crop.id}/`, lang),
    lang,
    title: pageTitle(t('huerta', 'page.title', vars)),
    // What the page covers, then the crop in its own words (as CropPage).
    description: cropPageDescription(
      `${t('huerta', 'page.description', vars)} ${about}`.trim()
    ),
    body: `<main data-static>${body.join('')}</main>`,
    hreflang: true,
    jsonLd: origin =>
      breadcrumbs(origin, [
        ['Huerta', localizedPath('/huerta/', lang)],
        [name],
      ]),
  };
}

/** The planting calendar, public: a place's year once one is chosen. For
 *  search, what it is and the crops it covers. */
function calendarPage(lang: IndexedLanguage): Page {
  const { t } = translator(lang);
  const description = t('huerta', 'year.description');
  return {
    path: localizedPath('/huerta/planting-calendar/', lang),
    lang,
    title: pageTitle(t('huerta', 'year.seoTitle')),
    description,
    // The page's own heading, as the app shows it.
    body: `<main data-static><h1>${escape(t('huerta', 'year.title'))}</h1><p>${escape(description)}</p><p>${escape(t('huerta', 'year.note'))}</p>${cropLinks(lang)}</main>`,
    hreflang: true,
  };
}

/** The front page's schema.org data: the site's name (what search results
 *  show for it), its logo and the app. */
const site = (origin: string, lang: IndexedLanguage) => ({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': `${origin}/#website`,
      name: 'Funges',
      alternateName: 'fung.es',
      url: `${origin}/`,
      inLanguage: lang,
      publisher: { '@id': `${origin}/#organization` },
    },
    {
      '@type': 'Organization',
      '@id': `${origin}/#organization`,
      name: 'Funges',
      url: `${origin}/`,
      logo: `${origin}/icons/logo_1.png`,
      sameAs: [PLAY_URL, GITHUB_URL],
    },
  ],
});

/** The front pages: the shared one every space opens from, then each
 *  space's own. Each says what it is and links the pages it leads to. */
function frontPage(
  path_: '/' | '/terra/' | '/huerta/',
  lang: IndexedLanguage
): Page {
  const { t } = translator(lang);
  const [title, description, heading, intro, links] = {
    '/': [
      pageTitle(t('common', 'home.metaTitle'), { bare: true }),
      t('common', 'home.metaDescription'),
      t('common', 'common.appDescription'),
      t('common', 'home.metaDescription'),
      speciesLinks(lang) + cropLinks(lang),
    ],
    '/terra/': [
      pageTitle(t('common', 'home.headline')),
      t('common', 'home.description'),
      t('common', 'home.headline'),
      t('common', 'home.description'),
      speciesLinks(lang),
    ],
    '/huerta/': [
      pageTitle(t('huerta', 'landing.headline')),
      t('huerta', 'landing.intro'),
      t('huerta', 'landing.headline'),
      t('huerta', 'landing.intro'),
      cropLinks(lang),
    ],
  }[path_];
  return {
    path: localizedPath(path_, lang),
    lang,
    title,
    description,
    body: `<main data-static><h1>${escape(heading)}</h1><p>${escape(intro)}</p>${links}</main>`,
    hreflang: true,
    // The photo the page opens on: the shared front page's first door is
    // Terra's. ponytail: picked on the day of the build; the site builds
    // several times a day, so a new season's photo is at most hours late.
    // Pick it in an inline script if builds ever get rarer.
    preload: `/${heroPhoto(path_ === '/huerta/' ? 'huerta' : 'terra')}`,
    jsonLd: path_ === '/' ? origin => site(origin, lang) : undefined,
  };
}

/** Every indexed page, in every indexed language. */
export function buildPages(photos: Photos = new Map()): Page[] {
  return INDEXED_LANGUAGES.flatMap(lang => [
    frontPage('/', lang),
    frontPage('/terra/', lang),
    frontPage('/huerta/', lang),
    calendarPage(lang),
    ...GENERATED_SPECIES_DATA.map(species =>
      speciesPage(species, lang, photos.get(species.id))
    ),
    ...CROPS.map(crop => cropPage(crop, lang)),
  ]);
}

/** The app's own pages (APP_PAGES): a head and no text, the app draws them. */
export function appPages(): Page[] {
  return APP_PAGES.flatMap(page => {
    const languages = pageLanguages(page.path);
    return languages.map(lang => {
      const { text } = translator(lang);
      return {
        path: localizedPath(page.path, lang),
        lang,
        title: pageTitle(text(page.title)),
        description: text(page.description),
        body: '',
        hreflang: languages.length > 1,
        noindex: page.noindex,
      };
    });
  });
}

/** The season atlas's pages, each place's species, from the files the deploy
 *  builds into the site before the build (none without them). English only.
 *  A species hardly ever recorded in a place shows another climate's season,
 *  so that page stays out of search engines. */
export function atlasPages(outDir: string): Page[] {
  const dir = path.join(outDir, 'season-atlas');
  const read = <T>(name: string): T | undefined => {
    const file = path.join(dir, name);
    return fs.existsSync(file)
      ? (JSON.parse(fs.readFileSync(file, 'utf8')) as T)
      : undefined;
  };
  const index = read<AtlasIndex>('index.json');
  if (!index) return [];
  const { t } = translator('en');
  const say: Say = (key, vars) => t('common', `data.${key}`, vars);
  const names = new Map(
    GENERATED_SPECIES_DATA.map(s => [
      s.id,
      t('species', `list_of_species.${s.nameKey}`),
    ])
  );
  return index.places.flatMap(place => {
    const curves = read<AtlasPlace>(`${place.id}.json`)?.species ?? {};
    return place.species.map(id => {
      const title = t('common', 'data.atlas.title', {
        species: names.get(id) ?? id,
        place: placeLabel(place, 'en', say),
      });
      const entry = curves[id];
      return {
        path: `/data/seasons/${place.id}/${index.slugs[id] ?? id}/`,
        lang: 'en' as const,
        title: pageTitle(title),
        description: entry
          ? atlasDescription(title, entry, 'en', say)
          : t('common', 'data.atlas.subtitle'),
        body: '',
        noindex: !entry || entry.records < RARE_RECORDS,
      };
    });
  });
}

/** The built index.html, made into one page's own HTML. The app drops the
 *  tags its <SEO> writes again when it starts (main.tsx), so they are there
 *  once; the robots tag, the preload and the schema.org data stay. */
export function renderPage(shell: string, page: Page, origin: string): string {
  const head = [
    `<link rel="canonical" href="${origin}${page.path}" />`,
    ...(page.hreflang
      ? alternates(page.path, origin).map(
          a =>
            `<link rel="alternate" hreflang="${a.hreflang}" href="${a.href}" />`
        )
      : []),
    ...(page.noindex ? ['<meta name="robots" content="noindex" />'] : []),
    '<meta property="og:type" content="website" />',
    '<meta property="og:site_name" content="Funges" />',
    `<meta property="og:locale" content="${OG_LOCALE[page.lang]}" />`,
    `<meta property="og:title" content="${escape(page.title)}" />`,
    `<meta property="og:description" content="${escape(page.description)}" />`,
    `<meta property="og:url" content="${origin}${page.path}" />`,
    `<meta property="og:image" content="${origin}${page.image ?? SHARE_CARD}" />`,
    // A species photo is square: the small card. The share card is wide.
    `<meta name="twitter:card" content="${page.image ? 'summary' : 'summary_large_image'}" />`,
    ...(page.preload
      ? [
          `<link rel="preload" as="image" href="${page.preload}" fetchpriority="high" />`,
        ]
      : []),
    // Not JavaScript, but Rocket Loader is told to leave it alone anyway.
    ...(page.jsonLd
      ? [
          `<script type="application/ld+json" data-cfasync="false">${JSON.stringify(
            page.jsonLd(origin)
          ).replace(/</g, '\\u003c')}</script>`,
        ]
      : []),
  ].join('\n    ');
  // Replacer functions, not strings: page text may hold `$&` or `$'`, which a
  // replacement string would expand into pieces of the shell.
  return shell
    .replace(/<html lang="[^"]*"/, () => `<html lang="${page.lang}"`)
    .replace(
      /<title>[^<]*<\/title>/,
      () => `<title>${escape(page.title)}</title>`
    )
    .replace(
      /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/,
      () => `<meta name="description" content="${escape(page.description)}" />`
    )
    .replace('</head>', () => `    ${head}\n  </head>`)
    .replace(
      '<div id="root"></div>',
      () => `<div id="root">${page.body}</div>`
    );
}

/** sitemap.xml: every page search engines may index, with its language
 *  versions where it has them. */
export function sitemap(pages: Page[], origin: string): string {
  const urls = pages
    .filter(page => !page.noindex)
    .map(
      page =>
        `  <url>\n    <loc>${origin}${page.path}</loc>${
          page.hreflang
            ? alternates(page.path, origin)
                .map(
                  a =>
                    `\n    <xhtml:link rel="alternate" hreflang="${a.hreflang}" href="${a.href}" />`
                )
                .join('')
            : ''
        }\n  </url>`
    );
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('\n')}
</urlset>
`;
}

/** The app's shell for the service worker, which answers every page it opens
 *  with it (vite.config.ts): the built index.html without a page of its own. */
export const appShell = (shell: string) =>
  shell.replace(
    '</head>',
    () => '    <meta name="robots" content="noindex" />\n  </head>'
  );

/** Writes every page and sitemap.xml. The built index.html becomes the front
 *  page, and app.html keeps the shell, both while the bundle is still open,
 *  so the service worker's precache has them; the rest when it is written. */
export function seoPages({ origin }: { origin: string }): Plugin {
  let outDir = path.join(ROOT, 'dist');
  let shell = '';
  const photos = new Map<string, string>();
  return {
    name: 'seo-pages',
    apply: 'build',
    // After vite:build-html, which emits index.html.
    enforce: 'post',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    generateBundle(_, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type !== 'asset') continue;
        for (const name of file.originalFileNames) {
          const id = /assets\/species\/([^/]+)\.webp$/.exec(name)?.[1];
          if (id) photos.set(id, `/${file.fileName}`);
        }
      }
      const html = bundle['index.html'];
      if (html?.type !== 'asset') return;
      shell = String(html.source);
      html.source = renderPage(shell, frontPage('/', 'en'), origin);
      this.emitFile({
        type: 'asset',
        fileName: 'app.html',
        source: appShell(shell),
      });
    },
    closeBundle() {
      if (!shell) return;
      const pages = [
        ...buildPages(photos),
        ...appPages(),
        ...atlasPages(outDir),
      ];
      for (const page of pages) {
        if (page.path === '/') continue;
        const dir = path.join(outDir, page.path);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(
          path.join(dir, 'index.html'),
          renderPage(shell, page, origin)
        );
      }
      fs.writeFileSync(
        path.join(outDir, 'sitemap.xml'),
        sitemap(pages, origin)
      );
    },
  };
}
