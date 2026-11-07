import i18n from '@/i18n';

/**
 * Keeps <html lang> on the app's language. A page's title, description and
 * share tags are its own: the build writes them (scripts/seo-pages.ts) and its
 * <SEO> keeps them, so nothing here may write one for the whole site.
 */
const updateHtmlLanguage = () => {
  document.documentElement.lang = i18n.language;
};

export const initializeHtmlLocalization = () => {
  if (i18n.isInitialized) updateHtmlLanguage();
  else i18n.on('initialized', updateHtmlLanguage);
  i18n.on('languageChanged', updateHtmlLanguage);
};

export const setHtmlLanguage = async (language: string) => {
  try {
    await i18n.changeLanguage(language);
  } catch (error) {
    console.error('Failed to change language:', error);
  }
};
