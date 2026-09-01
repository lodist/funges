/** Species-category colour, the single source of truth for both the map markers
 *  and the DataPage charts. DataPage and AdvancedMap used to hardcode a
 *  contradictory palette each for the same five categories.
 *
 *  The values live in `src/index.css` as `--category-*` so they follow the
 *  theme. Anything rendered through CSS or SVG should read them directly as
 *  `var(--category-plant)` / `text-category-plant`; only APIs that need a
 *  resolved literal (maplibre marker colours, canvas fills) go through
 *  `categoryColor()`. */
export const CATEGORIES = [
  'plant',
  'mushroom',
  'berry',
  'flower',
  'nut',
] as const;

export type Category = (typeof CATEGORIES)[number];

const ALIASES: Record<string, Category> = {
  herb: 'plant',
  herbs: 'plant',
  plants: 'plant',
  mushrooms: 'mushroom',
  berries: 'berry',
  flowers: 'flower',
  nuts: 'nut',
};

/** Normalise a free-form species category onto the five that have a colour.
 *  Anything unrecognised falls back to `plant`, the most common case. */
export function toCategory(raw: string | undefined | null): Category {
  const key = (raw ?? '').trim().toLowerCase();
  if ((CATEGORIES as readonly string[]).includes(key)) return key as Category;
  return ALIASES[key] ?? 'plant';
}

/** CSS custom-property reference — preferred wherever CSS can resolve it. */
export function categoryVar(category: Category): string {
  return `var(--category-${category})`;
}

/** Resolved colour for APIs that cannot take a `var()`, notably maplibre's
 *  `Marker({ color })`, which writes the value into an SVG fill attribute. */
export function categoryColor(raw: string | undefined | null): string {
  const category = toCategory(raw);
  if (typeof window === 'undefined') return '';
  return getComputedStyle(document.documentElement)
    .getPropertyValue(`--category-${category}`)
    .trim();
}
