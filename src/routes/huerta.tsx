import { createFileRoute, redirect } from '@tanstack/react-router';
import HuertaPage from '@/pages/HuertaPage';
import { shouldShowHuerta } from '@/lib/feature-flags';

export const Route = createFileRoute('/huerta')({
  beforeLoad: () => {
    if (!shouldShowHuerta) {
      throw redirect({ to: '/map' });
    }
  },
  component: HuertaPage,
});
