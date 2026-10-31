import { createFileRoute, redirect } from '@tanstack/react-router';
import HuertaYearPage from '@/pages/HuertaYearPage';
import { shouldShowHuerta } from '@/lib/feature-flags';
// zod's mini build: the same checks, a fraction of the entry chunk.
import * as z from 'zod/mini';

// Public: the calendar of any place, without an account (the Worker's
// /v1/year and /v1/towns answer anyone).
export const Route = createFileRoute('/huerta_/planting-calendar')({
  beforeLoad: () => {
    if (!shouldShowHuerta) {
      throw redirect({ to: '/map' });
    }
  },
  // A crop's sheet opens it on that crop.
  validateSearch: z.object({
    crop: z.optional(z.string()),
  }),
  component: HuertaYearPage,
});
