import { createFileRoute } from '@tanstack/react-router';
// zod's mini build: the same checks, a fraction of the entry chunk.
import * as z from 'zod/mini';
import { HuertaGate } from '@/components/HuertaGate';
import HuertaYearPage from '@/pages/HuertaYearPage';

export const Route = createFileRoute('/huerta_/planting-calendar')({
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
