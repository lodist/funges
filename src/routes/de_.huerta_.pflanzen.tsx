import { createFileRoute } from '@tanstack/react-router';
import { HuertaGate } from '@/components/HuertaGate';
import HuertaPage from '@/pages/HuertaPage';

// In German, for German visitors: the path sets the language.
export const Route = createFileRoute('/de_/huerta_/pflanzen')({
  component: () => (
    <HuertaGate>
      <HuertaPage />
    </HuertaGate>
  ),
});
