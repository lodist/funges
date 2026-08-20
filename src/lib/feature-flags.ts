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

/**
 * Offline maps stay opt-in in production until regional basemap packages have
 * been published. Development keeps the page visible without extra setup.
 */
export const shouldShowOfflineFeatures =
  isDevelopment || import.meta.env.VITE_OFFLINE_MAPS_ENABLED === 'true';

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
