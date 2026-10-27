/**
 * The pages search engines index, in their languages: English at today's URLs,
 * German under /de. Shared by the app (canonical, hreflang, titles) and the
 * build step that writes each page's static HTML (scripts/seo-pages.ts), so it
 * imports nothing through `@/`.
 */
export const INDEXED_LANGUAGES = ['en', 'de'] as const;
export type IndexedLanguage = (typeof INDEXED_LANGUAGES)[number];

const withSlash = (path: string) => (path.endsWith('/') ? path : `${path}/`);

/** The language a path is in when it has a language prefix; null for English. */
export function pathLanguage(pathname: string): IndexedLanguage | null {
  const first = pathname.split('/')[1];
  return INDEXED_LANGUAGES.find(l => l !== 'en' && l === first) ?? null;
}

/** The path without its language prefix, ending in a slash. */
export function stripLanguage(pathname: string): string {
  const lang = pathLanguage(pathname);
  return withSlash(lang ? pathname.slice(lang.length + 1) || '/' : pathname);
}

/** A page's path in a language, ending in a slash (GitHub Pages serves folders). */
export function localizedPath(path: string, lang: IndexedLanguage): string {
  const bare = stripLanguage(path);
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
