import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

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
