/**
 * Feature flags utility for controlling feature visibility across environments
 */

/**
 * Check if the current environment is development
 */
export const isDevelopment = import.meta.env.DEV;

/**
 * Check if the current environment is production
 */
export const isProduction = import.meta.env.PROD;

/** The complete regional basemap packages are published and ready for use. */
export const shouldShowOfflineFeatures = true;

/** Huerta, the garden space, stays hidden on the live site (and so in the Play
 *  app, which loads it) until launch: it shows on staging and in development. */
export const shouldShowHuerta =
  typeof window !== 'undefined' &&
  !/(^|\.)fung\.es$/.test(window.location.hostname);

/**
 * Check if a feature is enabled based on environment
 */
export const isFeatureEnabled = (feature: string): boolean => {
  switch (feature) {
    case 'offline':
      return shouldShowOfflineFeatures;
    default:
      return true;
  }
};
