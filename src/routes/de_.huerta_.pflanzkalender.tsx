import { createFileRoute } from '@tanstack/react-router';
// zod's mini build: the same checks, a fraction of the entry chunk.
import * as z from 'zod/mini';
import HuertaYearPage from '@/pages/HuertaYearPage';

// Public: the calendar of any place, without an account (the Worker's
// /v1/year and /v1/towns answer anyone).
export const Route = createFileRoute('/de_/huerta_/pflanzkalender')({
  // A crop's sheet opens it on that crop.
  validateSearch: z.object({
    crop: z.optional(z.string()),
  }),
  component: HuertaYearPage,
});
