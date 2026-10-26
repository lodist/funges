import { createFileRoute } from '@tanstack/react-router';
import DataPage from '@/pages/DataPage';
// zod's mini build: the same checks, a fraction of the entry chunk.
import * as z from 'zod/mini';

export const Route = createFileRoute('/data')({
  component: DataPage,
  validateSearch: z.object({
    region: z.optional(z.enum(['NE', 'SE', 'USE', 'USW'])),
  }),
});
