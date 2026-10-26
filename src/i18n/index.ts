import i18n, { type BackendModule, type ResourceKey } from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Every translation file, each loaded on demand as its own small chunk: the
// visitor's language (and English, the fallback) before the first render, any
// other on a switch. Imported up front, all six languages were about half of
// the entry chunk every visitor downloads. The service worker still precaches
// them all, so a language switch works offline.
const files = import.meta.glob<ResourceKey>('./locales/*/*.json', {
  import: 'default',
});

/** The namespaces, one per file name: all loaded with a language. */
const NAMESPACES = [
  ...new Set(
    Object.keys(files).map(path => path.split('/').pop()!.slice(0, -5))
  ),
];

const lazyLocales: BackendModule = {
  type: 'backend',
  init: () => {},
  read(language, namespace, done) {
    const load = files[`./locales/${language}/${namespace}.json`];
    // A language or namespace with no file (a region code, say): nothing to
    // add, as when the resources were bundled.
    if (!load) return done(null, {});
    load().then(
      resource => done(null, resource),
      (error: Error) => done(error, null)
    );
  },
};

/** Settles once the visitor's language is loaded: render after it. */
export const i18nReady = i18n
  .use(LanguageDetector)
  .use(lazyLocales)
  .use(initReactI18next)
  .init({
    ns: NAMESPACES,
    defaultNS: 'translation',
    fallbackLng: 'en',
    debug: process.env.NODE_ENV === 'development',

    interpolation: {
      escapeValue: false, // React already escapes values
    },

    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
    },
  });

export default i18n;
