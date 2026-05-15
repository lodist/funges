import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { getRecipeImage } from '@/lib/utils';

export interface RecipeStep {
  step: number;
  instruction: string;
  warning?: string;
  tip?: string;
  duration?: string;
}

export interface Recipe {
  id: string;
  title: string;
  ingredients: string[];
  instructions: string[];
  steps: RecipeStep[];
  warnings: string[];
  species: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  prepTime: string;
  cookTime: string;
  servings: string;
  tags: string[];
  safetyNotes: string[];
  image: string | null; // Add image field back
}

// Base recipe data without translations
export const RECIPES_DATA: string[] = [
  'amaranth-wild-greens-patties',
  'black-chanterelle-cream-sauce',
  'chanterelle-herb-tart',
  'chickweed-sorrel-salad-with-walnut-vinaigrette',
  'chestnut-mushroom-soup',
  'dandelion-flower-syrup',
  'nettle-soup',
  'parasol-mushroom-schnitzel',
  'masterwort-infused-honey-glaze',
  'morel-chestnut-stuffing',
  'nettle-potato-frittata',
  'st-george-s-mushroom-spring-frittata',
  'walnut-lingonberry-wild-tapenade',
  'wild-artichoke-lemon-pasta',
  'wild-asparagus-dandelion-stir-fry',
  'wild-garlic-pesto',
  'wild-strawberry-sorrel-cooler',
];

// Hook for React components
export const useRecipesData = (): Recipe[] => {
  const { t } = useTranslation('recipes', { keyPrefix: 'list_of_recipes' });
  return useMemo(
    () =>
      RECIPES_DATA.map(recipeId => {
        if (
          typeof t(`${recipeId}.ingredients`, {
            returnObjects: true,
          }) === 'string'
        ) {
          return;
        }

        const difficulty = t(`${recipeId}.difficulty`);
        const validDifficulty =
          difficulty && ['easy', 'medium', 'hard'].includes(difficulty)
            ? (difficulty as 'easy' | 'medium' | 'hard')
            : 'medium';

        const ingredients = t(`${recipeId}.ingredients`, {
          returnObjects: true,
        }) as string[];

        const species = t(`${recipeId}.species`, {
          returnObjects: true,
        }) as string[];

        const defaultTags: string[] = [];
        if (
          ingredients.some(
            ing =>
              ing.toLowerCase().includes('egg') ||
              ing.toLowerCase().includes('cream') ||
              ing.toLowerCase().includes('butter')
          )
        ) {
          defaultTags.push('vegetarian');
        }
        if (ingredients.some(ing => ing.toLowerCase().includes('pasta'))) {
          defaultTags.push('pasta');
        }
        if (
          ingredients.some(
            ing =>
              ing.toLowerCase().includes('soup') ||
              ingredients.join(' ').toLowerCase().includes('broth')
          )
        ) {
          defaultTags.push('soup');
        }
        if (ingredients.some(ing => ing.toLowerCase().includes('salad'))) {
          defaultTags.push('salad');
        }
        if (validDifficulty === 'easy') {
          defaultTags.push('easy');
        }
        if (validDifficulty === 'medium') {
          defaultTags.push('medium');
        }
        if (validDifficulty === 'hard') {
          defaultTags.push('hard');
        }

        const recipe: Recipe = {
          id: recipeId,
          title: t(`${recipeId}.title`),
          ingredients,
          instructions: t(`${recipeId}.instructions`, {
            returnObjects: true,
          }) as string[],
          steps: t(`${recipeId}.steps`, {
            returnObjects: true,
          }) as RecipeStep[],
          warnings: t(`${recipeId}.warnings`, {
            returnObjects: true,
          }) as string[],
          species,
          difficulty: validDifficulty,
          prepTime: t(`${recipeId}.prepTime`) || '30 min',
          cookTime: t(`${recipeId}.cookTime`) || '45 min',
          servings: t(`${recipeId}.servings`) || '4 servings',
          tags:
            (t(`${recipeId}.tags`, { returnObjects: true }) as string[]) ||
            defaultTags,
          safetyNotes:
            (t(`${recipeId}.safetyNotes`, {
              returnObjects: true,
            }) as string[]) || [],
          image: getRecipeImage(recipeId),
        };

        return recipe;
      }).filter(recipe => recipe !== undefined) as Recipe[],
    [t]
  );
};

// Utility functions for non-React usage
export const getRecipeById = (
  id: string,
  recipes: Recipe[]
): Recipe | undefined => {
  return recipes.find(recipe => recipe.id === id);
};

export const getRecipesBySpecies = (
  speciesId: string,
  recipes: Recipe[]
): Recipe[] => {
  return recipes.filter(recipe => recipe.species.includes(speciesId));
};

export const getAllRecipes = (recipes: Recipe[]): Recipe[] => {
  return recipes;
};

export const getRecipesByCategory = (
  category: string,
  recipes: Recipe[]
): Recipe[] => {
  return recipes.filter(recipe => recipe.tags.includes(category));
};
