import { createFileRoute } from '@tanstack/react-router';
import SpeciesPage from '@/pages/SpeciesPage';
import { z } from 'zod';

export const Route = createFileRoute('/species')({
  component: SpeciesPage,
  validateSearch: z.object({
    q: z.string().optional(),
  }),
});
