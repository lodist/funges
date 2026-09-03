import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// `--radius-card` is a project token, so tailwind-merge did not know
// `rounded-card` belonged to the radius group and let it coexist with a
// built-in step instead of replacing it. Both classes survived `cn`, the
// cascade picked the winner, and a caller could not override an atom's
// radius: `rounded-card` next to a base `rounded-md` rendered 6px.
const twMerge = extendTailwindMerge({
  // `extend`, not a top-level `theme`: the latter replaces the scale instead
  // of adding to it, and silently changed nothing. This form also covers the
  // directional groups, so `rounded-l-card` replaces `rounded-l-md` too.
  extend: { theme: { radius: ['card'] } },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Utility function to get species image
export const getSpeciesImage = (speciesId: string): string | null => {
  try {
    // Try to import the image dynamically
    const imageModule = new URL(
      `../assets/species/${speciesId}.webp`,
      import.meta.url
    );
    return imageModule.href;
  } catch (error) {
    // Return null if image doesn't exist
    console.error('Error loading species image:', error);
    return null;
  }
};

// Utility function to get recipe image
export const getRecipeImage = (recipeId: string): string | null => {
  try {
    // Try to import the image dynamically
    const imageModule = new URL(
      `../assets/recipes/${recipeId}.webp`,
      import.meta.url
    );
    return imageModule.href;
  } catch (error) {
    // Return null if image doesn't exist
    console.error('Error loading recipe image:', error);
    return null;
  }
};
