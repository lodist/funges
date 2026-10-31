import { createFileRoute, redirect } from '@tanstack/react-router';
import { HuertaGate } from '@/components/HuertaGate';
import HuertaPlannerPage from '@/pages/HuertaPlannerPage';
import { shouldShowHuerta } from '@/lib/feature-flags';

export const Route = createFileRoute('/huerta_/garden-planner')({
  beforeLoad: () => {
    if (!shouldShowHuerta) {
      throw redirect({ to: '/map' });
    }
  },
  component: () => (
    <HuertaGate>
      <HuertaPlannerPage />
    </HuertaGate>
  ),
});
