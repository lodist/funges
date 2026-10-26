import { createFileRoute } from '@tanstack/react-router';
import SpeciesPage from '@/pages/SpeciesPage';
// zod's mini build: the same checks, a fraction of the entry chunk.
import * as z from 'zod/mini';

export const Route = createFileRoute('/species')({
  component: SpeciesPage,
  validateSearch: z.object({
    q: z.optional(z.string()),
  }),
});
