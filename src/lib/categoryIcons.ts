import all from '@/assets/categories/all.webp';
import berry from '@/assets/categories/berry.webp';
import flower from '@/assets/categories/flower.webp';
import mushroom from '@/assets/categories/mushroom.webp';
import nut from '@/assets/categories/nut.webp';
import plant from '@/assets/categories/plant.webp';
import spectacle from '@/assets/categories/spectacle.webp';

/** Our own type icons, in place of the system emoji the filters used to show
 * (🍃 🍄 🌿 🫐 🌰 🌸 ✨), which look different on every platform. Keyed by species
 * category, plus the two values only the filters have: `all` and `spectacle`.
 * Kept out of `@/data/species` so that module stays free of asset imports. */
export const CATEGORY_ICONS = {
  all,
  mushroom,
  plant,
  berry,
  nut,
  flower,
  spectacle,
} as const;

export type CategoryIconKey = keyof typeof CATEGORY_ICONS;
