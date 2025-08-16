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
 * Check if offline features should be visible
 * Hidden in development mode
 */
export const shouldShowOfflineFeatures = isDevelopment;

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
