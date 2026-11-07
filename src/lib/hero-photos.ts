/**
 * Each space's photograph follows the season (meteorological, the same on both
 * continents). Terra: oyster mushrooms in winter, morel in spring, chanterelles
 * in summer, the porcino in autumn (shared with Support). Huerta: frosted kale,
 * peas going in, tomatoes, garlic. Its front page and its door on the shared
 * front page show it, and the build preloads it (scripts/seo-pages.ts), so this
 * imports nothing through `@/`. Files in public/landing/.
 */
const HERO_PHOTOS = {
  terra: ['hero-winter', 'hero-spring', 'hero-summer', 'astra-porcini'],
  huerta: [
    'huerta-hero-winter',
    'huerta-hero-spring',
    'huerta-hero-summer',
    'huerta-hero-autumn',
  ],
} as const;

/** The space's photograph today, under the site's base: `landing/….webp`. */
export const heroPhoto = (
  space: keyof typeof HERO_PHOTOS,
  date = new Date()
): string =>
  `landing/${HERO_PHOTOS[space][Math.floor(((date.getMonth() + 1) % 12) / 3)]}.webp`;
