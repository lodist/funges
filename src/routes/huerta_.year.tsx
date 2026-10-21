import { createFileRoute, redirect } from '@tanstack/react-router';
import HuertaYearPage from '@/pages/HuertaYearPage';
import { shouldShowHuerta } from '@/lib/feature-flags';

export const Route = createFileRoute('/huerta_/year')({
  beforeLoad: () => {
    if (!shouldShowHuerta) {
      throw redirect({ to: '/map' });
    }
  },
  component: HuertaYearPage,
});
