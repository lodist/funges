import { createFileRoute } from '@tanstack/react-router';
import RecipesPage from '@/pages/RecipesPage';

export const Route = createFileRoute('/recipes')({
  component: RecipesPage,
});
