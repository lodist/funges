import { createFileRoute, redirect } from '@tanstack/react-router';
import HuertaLandingPage from '@/pages/HuertaLandingPage';
import { shouldShowHuerta } from '@/lib/feature-flags';

// Huerta's front page in German, for search: the path sets the language.
export const Route = createFileRoute('/de_/huerta')({
  beforeLoad: () => {
    if (!shouldShowHuerta) {
      throw redirect({ to: '/map' });
    }
  },
  component: HuertaLandingPage,
});
