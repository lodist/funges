import { createFileRoute, redirect } from '@tanstack/react-router';
import HuertaMapPage from '@/pages/HuertaMapPage';
import { shouldShowHuerta } from '@/lib/feature-flags';

export const Route = createFileRoute('/huerta_/map')({
  beforeLoad: () => {
    if (!shouldShowHuerta) {
      throw redirect({ to: '/map' });
    }
  },
  component: HuertaMapPage,
});
