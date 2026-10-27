/**
 * The static HTML of every page search engines index, written at build time:
 * each species and crop page and the space front pages, in English and German
 * (src/lib/seo-pages.ts). A page is the built index.html with its own title,
 * description, canonical and hreflang links and its text as plain HTML inside
 * #root, which the app replaces when it starts. Also writes sitemap.xml.
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
import {
  INDEXED_LANGUAGES,
  alternates,
  cropPageDescription,
  localizedPath,
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
}

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
  return { t, list };
}

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
      href: localizedPath(`/huerta/species/${crop.id}/`, lang),
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
  lang: IndexedLanguage
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
    `<p>${escape(t('species', `list_of_species.${key}.description`))}</p>`,
    ...GUIDE_PARTS.map(p => part(t('species', `guide.${p}`), guide(p))),
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
    description: t('species', 'page.description', vars),
    body: `<main data-static>${body.join('')}</main>`,
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
          `${t('huerta', 'grow.facts.water')}: ${t('huerta', `grow.water.${guide.water}`)}. ${t('huerta', `grow.${crop.id}.water`)} ${t('huerta', 'grow.facts.feed')}: ${t('huerta', `grow.feed.${guide.feed}`)}. ${t('huerta', `grow.${crop.id}.feed`)}`
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
  return {
    path: localizedPath(`/huerta/species/${crop.id}/`, lang),
    lang,
    title: pageTitle(
      t('huerta', 'page.title', {
        name,
        start: t('huerta', `page.start.${crop.how}`),
        end: t('huerta', `page.end.${crop.kind}`),
      })
    ),
    description: cropPageDescription(about),
    body: `<main data-static>${body.join('')}</main>`,
  };
}

function frontPage(path_: '/' | '/huerta/', lang: IndexedLanguage): Page {
  const { t } = translator(lang);
  const home = path_ === '/';
  // The front page's title names Funges and what it does; its heading is the
  // headline the page shows.
  const [ns, title, text, heading, intro] = home
    ? [
        'common',
        'home.metaTitle',
        'home.metaDescription',
        'home.headline',
        'home.description',
      ]
    : [
        'huerta',
        'landing.headline',
        'landing.intro',
        'landing.headline',
        'landing.intro',
      ];
  return {
    path: localizedPath(path_, lang),
    lang,
    title: pageTitle(t(ns, title), { bare: home }),
    description: t(ns, text),
    body: `<main data-static><h1>${escape(t(ns, heading))}</h1><p>${escape(t(ns, intro))}</p>${
      home ? speciesLinks(lang) + cropLinks(lang) : cropLinks(lang)
    }</main>`,
  };
}

/** Every indexed page, in every indexed language. */
export function buildPages(): Page[] {
  return INDEXED_LANGUAGES.flatMap(lang => [
    frontPage('/', lang),
    frontPage('/huerta/', lang),
    ...GENERATED_SPECIES_DATA.map(species => speciesPage(species, lang)),
    ...CROPS.map(crop => cropPage(crop, lang)),
  ]);
}

/** The built index.html, made into one page's own HTML. */
export function renderPage(shell: string, page: Page, origin: string): string {
  const head = [
    `<link rel="canonical" href="${origin}${page.path}" />`,
    ...alternates(page.path, origin).map(
      a => `<link rel="alternate" hreflang="${a.hreflang}" href="${a.href}" />`
    ),
    `<meta property="og:title" content="${escape(page.title)}" />`,
    `<meta property="og:description" content="${escape(page.description)}" />`,
    `<meta property="og:url" content="${origin}${page.path}" />`,
  ].join('\n    ');
  return shell
    .replace(/<html lang="[^"]*"/, `<html lang="${page.lang}"`)
    .replace(/<title>[^<]*<\/title>/, `<title>${escape(page.title)}</title>`)
    .replace(
      /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/,
      `<meta name="description" content="${escape(page.description)}" />`
    )
    .replace('</head>', `    ${head}\n  </head>`)
    .replace('<div id="root"></div>', `<div id="root">${page.body}</div>`);
}

/** sitemap.xml: the indexed pages with their language versions, then the
 *  app's other pages (English only). */
export function sitemap(
  pages: Page[],
  others: string[],
  origin: string
): string {
  const url = (loc: string, links = '') =>
    `  <url>\n    <loc>${origin}${loc}</loc>${links}\n  </url>`;
  const indexed = pages.map(page =>
    url(
      page.path,
      alternates(page.path, origin)
        .map(
          a =>
            `\n    <xhtml:link rel="alternate" hreflang="${a.hreflang}" href="${a.href}" />`
        )
        .join('')
    )
  );
  const paths = new Set(pages.map(p => p.path));
  const rest = others
    .map(p => localizedPath(p, 'en'))
    .filter(p => !paths.has(p))
    .map(p => url(p));
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${[...indexed, ...rest].join('\n')}
</urlset>
`;
}

/** Writes every indexed page and sitemap.xml once the build is done. The
 *  front page '/' keeps the built index.html itself, whose head is the home
 *  page's: the app shell every other route is copied from must not carry the
 *  home page's text. */
export function seoPages({
  origin,
  others,
}: {
  origin: string;
  others: string[];
}): Plugin {
  let outDir = path.join(ROOT, 'dist');
  return {
    name: 'seo-pages',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const shell = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8');
      const pages = buildPages();
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
        sitemap(pages, others, origin)
      );
    },
  };
}
