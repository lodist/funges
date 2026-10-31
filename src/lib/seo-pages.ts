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

/** The indexed language a page's links use for an app language: its own, or
 *  English. */
export const indexedLanguage = (lang: string): IndexedLanguage =>
  INDEXED_LANGUAGES.find(l => l === lang) ?? 'en';

/** The path without its language prefix, ending in a slash. */
export function stripLanguage(pathname: string): string {
  const lang = pathLanguage(pathname);
  return withSlash(lang ? pathname.slice(lang.length + 1) || '/' : pathname);
}

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
