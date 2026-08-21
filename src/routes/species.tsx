import { createFileRoute } from '@tanstack/react-router';
import SpeciesPage from '@/pages/SpeciesPage';
import { z } from 'zod';
// PROTOTYPE — #203 color palette & typography directions. Throwaway; see
// src/prototypes/visual-identity-203/README.md. Revert this import + the
// wrapper below once a direction is picked.
import { VisualIdentitySwitcher } from '@/prototypes/visual-identity-203/VisualIdentitySwitcher';

export const Route = createFileRoute('/species')({
  component: () => (
    <>
      <VisualIdentitySwitcher />
      <SpeciesPage />
    </>
  ),
  validateSearch: z.object({
    q: z.string().optional(),
    variant: z.string().optional(),
  }),
});
