import { createFileRoute, redirect } from '@tanstack/react-router';
import { HuertaGate } from '@/components/HuertaGate';
import HuertaPage from '@/pages/HuertaPage';
import { shouldShowHuerta } from '@/lib/feature-flags';

export const Route = createFileRoute('/huerta_/in-season')({
  beforeLoad: () => {
    if (!shouldShowHuerta) {
      throw redirect({ to: '/map' });
    }
  },
  component: () => (
    <HuertaGate>
      <HuertaPage />
    </HuertaGate>
  ),
});
