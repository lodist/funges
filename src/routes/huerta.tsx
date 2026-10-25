import { createFileRoute, redirect } from '@tanstack/react-router';
import HuertaLandingPage from '@/pages/HuertaLandingPage';
import { shouldShowHuerta } from '@/lib/feature-flags';

// Huerta's front page: open to everyone, unlike the garden pages behind it.
export const Route = createFileRoute('/huerta')({
  beforeLoad: () => {
    if (!shouldShowHuerta) {
      throw redirect({ to: '/map' });
    }
  },
  component: HuertaLandingPage,
});
