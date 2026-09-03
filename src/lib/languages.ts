export const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'it', name: 'Italiano' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'es', name: 'Español' },
  { code: 'pt', name: 'Português' },
] as const;

export type Language = (typeof LANGUAGES)[number];

// i18next returns the detected tag with its region (`it-IT`), so an exact match
// falls through to English while the app already renders Italian.
export const resolveLanguage = (tag: string | undefined): Language =>
  LANGUAGES.find(l => l.code === tag?.split('-')[0]) ?? LANGUAGES[0];
