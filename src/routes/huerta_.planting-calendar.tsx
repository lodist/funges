import { createFileRoute, redirect } from '@tanstack/react-router';
import { HuertaGate } from '@/components/HuertaGate';
import HuertaYearPage from '@/pages/HuertaYearPage';
import { shouldShowHuerta } from '@/lib/feature-flags';
// zod's mini build: the same checks, a fraction of the entry chunk.
import * as z from 'zod/mini';

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
  component: () => (
    <HuertaGate>
      <HuertaYearPage />
    </HuertaGate>
  ),
});
