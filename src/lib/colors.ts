// Centralized color system for Fung.es application
// This is the single source of truth for all colors in the application

// Base color palette using OKLCH color space
export const colors = {
  // Primary brand colors (green theme)
  primary: {
    50: '#f0f9f4', // oklch(0.9711 0.0074 80.7211)
    100: '#dcf2e3', // oklch(0.9370 0.0142 74.4218)
    200: '#b8e4c7', // oklch(0.8952 0.0504 146.0366)
    300: '#94d6ab', // oklch(0.8579 0.0174 76.0955)
    400: '#70c88f', // oklch(0.6731 0.1624 144.2083)
    500: '#4cba73', // oklch(0.5234 0.1347 144.1672) - main brand color
    600: '#3d955c', // oklch(0.5752 0.1446 144.1813)
    700: '#2e7045', // oklch(0.4254 0.1159 144.3078)
    800: '#1f4a2e', // oklch(0.3942 0.0265 142.9926)
    900: '#102517', // oklch(0.2157 0.0453 145.7256)
  },

  // Neutral grays
  neutral: {
    50: '#fafafa', // oklch(0.9711 0.0074 80.7211)
    100: '#f5f5f5', // oklch(0.9370 0.0142 74.4218)
    200: '#e5e5e5', // oklch(0.8805 0.0208 74.6428)
    300: '#d4d4d4', // oklch(0.8579 0.0174 76.0955)
    400: '#a3a3a3', // oklch(0.4495 0.0486 39.2110)
    500: '#737373', // oklch(0.3000 0.0358 30.2042)
    600: '#525252', // oklch(0.4495 0.0486 39.2110)
    700: '#404040', // oklch(0.3942 0.0265 142.9926)
    800: '#262626', // oklch(0.3327 0.0271 146.9867)
    900: '#171717', // oklch(0.2683 0.0279 150.7681)
  },

  // Status colors
  status: {
    success: '#4cba73', // Same as primary-500
    warning: '#f59e0b', // Amber
    error: '#ef4444', // Red
    info: '#3b82f6', // Blue
  },

  // Semantic colors for light theme
  light: {
    text: {
      primary: '#1a1a1a', // oklch(0.3000 0.0358 30.2042)
      secondary: '#525252', // oklch(0.4495 0.0486 39.2110)
      tertiary: '#6b7280', // oklch(0.4495 0.0486 39.2110)
      inverse: '#ffffff', // oklch(1.0000 0 0)
    },
    background: {
      primary: '#fafafa', // oklch(0.9711 0.0074 80.7211)
      secondary: 'rgba(250, 250, 250, 0.9)',
      tertiary: '#f5f5f5', // oklch(0.9370 0.0142 74.4218)
      overlay: 'rgba(0, 0, 0, 0.8)',
    },
    hover: {
      primary: '#e5f7ed', // Light green hover
      secondary: '#d1f2e1', // Medium light green hover
    },
  },

  // Semantic colors for dark theme
  dark: {
    text: {
      primary: '#f5f5f5', // oklch(0.9423 0.0097 72.6595)
      secondary: '#a3a3a3', // oklch(0.8579 0.0174 76.0955)
      tertiary: '#d1d5db', // oklch(0.8579 0.0174 76.0955)
      inverse: '#0a0a0a', // oklch(0.3327 0.0271 146.9867)
    },
    background: {
      primary: '#171717', // oklch(0.2683 0.0279 150.7681)
      secondary: 'rgba(23, 23, 23, 0.9)',
      tertiary: '#0a0a0a', // oklch(0.3327 0.0271 146.9867)
      overlay: 'rgba(0, 0, 0, 0.8)',
    },
    hover: {
      primary: '#1f2937', // Dark hover
      secondary: '#374151', // Medium dark hover
    },
  },

  // Map-specific colors
  map: {
    mushrooms: {
      light: ['#ffffcc', '#ffe4b5', '#fbae7e', '#fb6d51', '#a60310', '#800020'],
      dark: ['#2d2d00', '#4d3d1a', '#6d4d2a', '#8d5d3a', '#ad6d4a', '#cd7d5a'],
    },
    berries: {
      light: ['#f0f8ff', '#e6f3ff', '#b3d9ff', '#80bfff', '#4da6ff', '#1a8cff'],
      dark: ['#0a1a2e', '#1a2a3e', '#2a3a4e', '#3a4a5e', '#4a5a6e', '#5a6a7e'],
    },
    herbs: {
      light: ['#f0f9f4', '#dcf2e3', '#b8e4c7', '#94d6ab', '#70c88f', '#4cba73'],
      dark: ['#0a1a0e', '#1a2a1e', '#2a3a2e', '#3a4a3e', '#4a5a4e', '#5a6a5e'],
    },
    nuts: {
      light: ['#fff8dc', '#ffe4b5', '#ffd700', '#ffa500', '#ff8c00', '#ff4500'],
      dark: ['#3a2d1a', '#4a3d2a', '#5a4d3a', '#6a5d4a', '#7a6d5a', '#8a7d6a'],
    },
    ui: {
      border: { light: '#666666', dark: '#999999' },
      hover: { light: '#000000', dark: '#ffffff' },
      pin: { light: '#4cba73', dark: '#4cba73' },
    },
  },

  // Score colors for confidence indicators
  score: {
    excellent: { light: '#4cba73', dark: '#4cba73' },
    good: { light: '#70c88f', dark: '#70c88f' },
    fair: { light: '#f59e0b', dark: '#f59e0b' },
    poor: { light: '#ef4444', dark: '#ef4444' },
  },
} as const;

// Type definitions
export type ColorTheme = 'light' | 'dark';
export type SpeciesType = 'mushrooms' | 'berries' | 'herbs' | 'nuts';
