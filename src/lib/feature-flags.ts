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
 * Offline maps stay opt-in until complete regional packages have been built
 * and published. Set this only for package QA or when the catalog is live.
 */
export const shouldShowOfflineFeatures =
  import.meta.env.VITE_OFFLINE_MAPS_ENABLED === 'true';

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
