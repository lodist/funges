import i18n from '@/i18n';

/**
 * Updates HTML meta tags and document properties based on the current language
 */
const updateHtmlLocalization = () => {
  // Check if i18n is initialized
  if (!i18n.isInitialized) {
    console.warn('i18n not initialized yet, skipping HTML localization update');
    return;
  }

  // Use the common namespace since html translations are in common.json
  const t = (key: string) => {
    try {
      return i18n.t(key, { ns: 'common' });
    } catch (error) {
      console.warn(`Translation key not found: ${key}`, error);
      return key; // Fallback to the key itself
    }
  };

  // Update document title
  document.title = t('html.title');

  // Update HTML lang attribute
  document.documentElement.lang = i18n.language;

  // Update meta description
  updateMetaTag('description', t('html.description'));

  // Update meta keywords
  updateMetaTag('keywords', t('html.keywords'));

  // Update meta author
  updateMetaTag('author', t('html.author'));

  // Update Open Graph tags
  updateMetaTag('og:title', t('html.ogTitle'));
  updateMetaTag('og:description', t('html.ogDescription'));
  updateMetaTag('og:type', t('html.ogType'));
  updateMetaTag('og:image', t('html.ogImage'));

  // Update Twitter Card tags
  updateMetaTag('twitter:card', t('html.twitterCard'));
  updateMetaTag('twitter:title', t('html.twitterTitle'));
  updateMetaTag('twitter:description', t('html.twitterDescription'));
  updateMetaTag('twitter:image', t('html.twitterImage'));
};

/**
 * Updates a meta tag by name or property
 */
const updateMetaTag = (nameOrProperty: string, content: string) => {
  // Try to find by name first
  let metaTag = document.querySelector(
    `meta[name="${nameOrProperty}"]`
  ) as HTMLMetaElement;

  // If not found by name, try by property (for Open Graph and Twitter tags)
  if (!metaTag) {
    metaTag = document.querySelector(
      `meta[property="${nameOrProperty}"]`
    ) as HTMLMetaElement;
  }

  // If still not found, create a new meta tag
  if (!metaTag) {
    metaTag = document.createElement('meta');

    // Determine if it's a property or name attribute
    if (
      nameOrProperty.startsWith('og:') ||
      nameOrProperty.startsWith('twitter:')
    ) {
      metaTag.setAttribute('property', nameOrProperty);
    } else {
      metaTag.setAttribute('name', nameOrProperty);
    }

    document.head.appendChild(metaTag);
  }

  // Update the content
  metaTag.setAttribute('content', content);
};

/**
 * Initializes HTML localization and sets up language change listener
 */
export const initializeHtmlLocalization = () => {
  // Wait for i18n to be initialized
  if (i18n.isInitialized) {
    // Update immediately if already initialized
    updateHtmlLocalization();
  } else {
    // Wait for initialization
    i18n.on('initialized', () => {
      updateHtmlLocalization();
    });
  }

  // Listen for language changes
  i18n.on('languageChanged', () => {
    updateHtmlLocalization();
  });
};

/**
 * Updates HTML localization for a specific language
 */
export const setHtmlLanguage = async (language: string) => {
  try {
    await i18n.changeLanguage(language);
    updateHtmlLocalization();
  } catch (error) {
    console.error('Failed to change language:', error);
  }
};
