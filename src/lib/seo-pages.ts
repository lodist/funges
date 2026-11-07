/**
 * The pages search engines index, in their languages: English at today's URLs,
 * German under /de. Shared by the app (canonical, hreflang, titles) and the
 * build step that writes each page's static HTML (scripts/seo-pages.ts), so it
 * imports nothing through `@/`.
 */
import { CROP_DE } from './crop-slugs';

export const INDEXED_LANGUAGES = ['en', 'de'] as const;
export type IndexedLanguage = (typeof INDEXED_LANGUAGES)[number];

const withSlash = (path: string) => (path.endsWith('/') ? path : `${path}/`);

/** The language a path is in when it has a language prefix; null for English. */
export function pathLanguage(pathname: string): IndexedLanguage | null {
  const first = pathname.split('/')[1];
  return INDEXED_LANGUAGES.find(l => l !== 'en' && l === first) ?? null;
}

/** The indexed language a page's links use for an app language: its own
 *  (de-CH reads as de), or English. */
export const indexedLanguage = (lang: string): IndexedLanguage =>
  INDEXED_LANGUAGES.find(l => l === lang.split('-')[0]) ?? 'en';

/** The path without its language prefix, ending in a slash. */
export function stripLanguage(pathname: string): string {
  const lang = pathLanguage(pathname);
  return withSlash(lang ? pathname.slice(lang.length + 1) || '/' : pathname);
}

/** Huerta's pages, each in the language's own words: German under /de. */
export const HUERTA_PAGES = {
  crops: { en: '/huerta/crops', de: '/de/huerta/pflanzen' },
  map: { en: '/huerta/map', de: '/de/huerta/karte' },
  planner: { en: '/huerta/garden-planner', de: '/de/huerta/gartenplaner' },
  calendar: {
    en: '/huerta/planting-calendar',
    de: '/de/huerta/pflanzkalender',
  },
} as const satisfies Record<string, Record<IndexedLanguage, string>>;
/** A Huerta page's path for an app language: German words in German. */
export const huertaPage = (page: keyof typeof HUERTA_PAGES, language: string) =>
  HUERTA_PAGES[page][indexedLanguage(language)];
const HUERTA_PAGE = new Map(
  Object.values(HUERTA_PAGES).flatMap(page =>
    INDEXED_LANGUAGES.map(lang => [stripLanguage(page[lang]), page] as const)
  )
);

// A crop's page has the language's own words in its path, which search
// engines read: /huerta/crops/broad-beans/, /de/huerta/pflanzen/dicke-bohnen/
// (a hyphen keeps two words apart, an underscore runs them together).
const CROP_PAGE = /^\/huerta\/(crops|pflanzen)\/([^/]+)\/$/;
const CROP_IDS = new Set(Object.keys(CROP_DE));
const CROP_BY_DE = new Map(
  Object.entries(CROP_DE).map(([id, word]) => [word, id])
);
const CROP_PATH: Record<IndexedLanguage, (id: string) => string> = {
  en: id => `/huerta/crops/${id.replace(/_/g, '-')}/`,
  de: id => `/de/huerta/pflanzen/${CROP_DE[id]}/`,
};

/** The crop a page's path is for, in any language and under its older
 *  forms (its id, the English words under /de); null for any other page. */
export function cropOfPath(pathname: string): string | null {
  const match = CROP_PAGE.exec(stripLanguage(pathname));
  if (!match) return null;
  const [, list, word] = match;
  const id =
    list === 'pflanzen' ? CROP_BY_DE.get(word) : word.replace(/-/g, '_');
  return id && CROP_IDS.has(id) ? id : null;
}

/** A page's path in a language, ending in a slash (GitHub Pages serves folders). */
export function localizedPath(path: string, lang: IndexedLanguage): string {
  const bare = stripLanguage(path);
  const crop = cropOfPath(bare);
  if (crop) return CROP_PATH[lang](crop);
  const huerta = HUERTA_PAGE.get(bare);
  if (huerta) return withSlash(huerta[lang]);
  return lang === 'en' ? bare : `/${lang}${bare}`;
}

/** hreflang links for a page: each indexed language, then x-default = English. */
export function alternates(path: string, origin: string) {
  return [
    ...INDEXED_LANGUAGES.map(lang => ({
      hreflang: lang,
      href: origin + localizedPath(path, lang),
    })),
    { hreflang: 'x-default', href: origin + localizedPath(path, 'en') },
  ];
}

/** The app's own pages, beside the ones written from the catalog. The build
 *  gives each its own head, so a shared link or a search engine reading the
 *  HTML sees the page, not the front page: `title` and `description` are the
 *  `namespace:key` its <SEO> shows. Huerta's pages in HUERTA_PAGES are written
 *  in every indexed language. `noindex` keeps a page out of search engines and
 *  the sitemap. */
export interface AppPage {
  path: string;
  title: string;
  description: string;
  noindex?: boolean;
}
export const APP_PAGES: AppPage[] = [
  { path: '/map/', title: 'map:title', description: 'map:description' },
  {
    path: '/worth-foraging-now/',
    title: 'common:worthForagingNow.seoTitle',
    description: 'common:worthForagingNow.description',
  },
  {
    path: '/identify/',
    title: 'identify:page.seoTitle',
    description: 'identify:page.seoDescription',
  },
  {
    path: '/recipes/',
    title: 'recipes:seoTitle',
    description: 'recipes:description',
  },
  {
    path: '/species/',
    title: 'species:seoTitle',
    description: 'species:description',
  },
  {
    path: '/data/',
    title: 'common:data.seoTitle',
    description: 'common:data.seoDescription',
  },
  {
    path: '/instructions/',
    title: 'instructions:seoTitle',
    description: 'instructions:seoDescription',
  },
  {
    path: '/support/',
    title: 'support:seoTitle',
    description: 'support:seoDescription',
  },
  {
    path: '/impressum/',
    title: 'impressum:title',
    description: 'impressum:seoDescription',
  },
  {
    path: '/privacy-policy/',
    title: 'privacy:title',
    description: 'privacy:seoDescription',
  },
  {
    path: '/termsuse/',
    title: 'terms:title',
    description: 'terms:seoDescription',
  },
  // Behind sign-in (HuertaGate): a search engine would see the sign-in
  // screen. The public crop pages and the calendar are the ones to find.
  {
    path: '/huerta/crops/',
    title: 'huerta:seoTitle',
    description: 'huerta:description',
    noindex: true,
  },
  {
    path: '/huerta/map/',
    title: 'huerta:map.title',
    description: 'huerta:map.description',
    noindex: true,
  },
  {
    path: '/huerta/garden-planner/',
    title: 'huerta:planner.seoTitle',
    description: 'huerta:planner.description',
    noindex: true,
  },
  {
    path: '/huerta/instructions/',
    title: 'instructions:huerta.seoTitle',
    description: 'instructions:huerta.subtitle',
  },
  // Opens the atlas's first place and species, whose page is the one to find.
  {
    path: '/data/seasons/',
    title: 'common:data.tabs.seasons',
    description: 'common:data.atlas.subtitle',
    noindex: true,
  },
  {
    path: '/settings/',
    title: 'settings:title',
    description: 'common:common.appDescription',
    noindex: true,
  },
  {
    path: '/offline/',
    title: 'offline:title',
    description: 'offline:description',
    noindex: true,
  },
  {
    path: '/delete-account/',
    title: 'privacy:deleteAccount.title',
    description: 'privacy:deleteAccount.intro',
    noindex: true,
  },
  {
    path: '/huerta/signin/',
    title: 'huerta:page.signIn',
    description: 'common:common.appDescription',
    noindex: true,
  },
  {
    path: '/huerta/account/',
    title: 'sidebar:account',
    description: 'common:common.appDescription',
    noindex: true,
  },
];

/** The languages a page is written in: Huerta's pages in each, the rest in
 *  English (the app shows them in the visitor's language at the same URL). */
export const pageLanguages = (path: string): readonly IndexedLanguage[] =>
  HUERTA_PAGE.has(stripLanguage(path)) ? INDEXED_LANGUAGES : ['en'];

/** "<title> · Funges"; `bare` for a title that already names Funges. */
export const pageTitle = (title: string, { bare = false } = {}) =>
  bare ? title : `${title} · Funges`;

/** A description search engines show in full: the text up to its last whole
 *  sentence within 160 characters (all of it when shorter). */
export function cropPageDescription(text: string, max = 160): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('.'));
  return end > 40
    ? cut.slice(0, end + 1)
    : `${cut.slice(0, max - 1).trimEnd()}…`;
}
