import { createFileRoute } from '@tanstack/react-router';
import RecipesPage from '@/pages/RecipesPage';
// zod's mini build: the same checks, a fraction of the entry chunk.
import * as z from 'zod/mini';

export const Route = createFileRoute('/recipes')({
  component: RecipesPage,
  validateSearch: z.object({
    q: z.optional(z.string()),
  }),
});
