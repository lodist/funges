// PROTOTYPE route for issue #213 — throwaway, not linked from app nav.
// Visit /atoms-213 directly. See src/prototypes/atoms-213/README.md.
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import AtomsKitchenSink from '@/prototypes/atoms-213/AtomsKitchenSink';

export const Route = createFileRoute('/atoms-213')({
  component: AtomsKitchenSink,
  validateSearch: z.object({
    variant: z.enum(['trailhead', 'ridge']).default('trailhead'),
  }),
});
