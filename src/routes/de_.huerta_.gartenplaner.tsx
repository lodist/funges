import { createFileRoute, redirect } from '@tanstack/react-router';
import { HuertaGate } from '@/components/HuertaGate';
import HuertaPlannerPage from '@/pages/HuertaPlannerPage';
import { shouldShowHuerta } from '@/lib/feature-flags';

// In German, for German visitors: the path sets the language.
export const Route = createFileRoute('/de_/huerta_/gartenplaner')({
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
