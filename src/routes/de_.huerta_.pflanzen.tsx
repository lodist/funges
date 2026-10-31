import { createFileRoute, redirect } from '@tanstack/react-router';
import { HuertaGate } from '@/components/HuertaGate';
import HuertaPage from '@/pages/HuertaPage';
import { shouldShowHuerta } from '@/lib/feature-flags';

// In German, for German visitors: the path sets the language.
export const Route = createFileRoute('/de_/huerta_/pflanzen')({
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
