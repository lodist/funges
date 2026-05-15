import { createFileRoute } from '@tanstack/react-router';
import RecipesPage from '@/pages/RecipesPage';
import { z } from 'zod';

export const Route = createFileRoute('/recipes')({
  component: RecipesPage,
  validateSearch: z.object({
    q: z.string().optional(),
  }),
});
