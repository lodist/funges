import { createFileRoute, redirect } from '@tanstack/react-router';
import HuertaInstructionsPage from '@/pages/HuertaInstructionsPage';
import { shouldShowHuerta } from '@/lib/feature-flags';

// Public, as Terra's: how Huerta works, before anyone signs in.
export const Route = createFileRoute('/huerta_/instructions')({
  beforeLoad: () => {
    if (!shouldShowHuerta) {
      throw redirect({ to: '/map' });
    }
  },
  component: HuertaInstructionsPage,
});
