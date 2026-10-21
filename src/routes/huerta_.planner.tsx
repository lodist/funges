import { createFileRoute, redirect } from '@tanstack/react-router';
import HuertaPlannerPage from '@/pages/HuertaPlannerPage';
import { shouldShowHuerta } from '@/lib/feature-flags';

export const Route = createFileRoute('/huerta_/planner')({
  beforeLoad: () => {
    if (!shouldShowHuerta) {
      throw redirect({ to: '/map' });
    }
  },
  component: HuertaPlannerPage,
});
