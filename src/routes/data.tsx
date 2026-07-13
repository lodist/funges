import { createFileRoute } from '@tanstack/react-router';
import DataPage from '@/pages/DataPage';
import { z } from 'zod';

export const Route = createFileRoute('/data')({
  component: DataPage,
  validateSearch: z.object({
    region: z.enum(['NE', 'SE', 'USE', 'USW']).optional(),
  }),
});
