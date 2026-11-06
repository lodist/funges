import { createFileRoute } from '@tanstack/react-router';
import { HuertaGate } from '@/components/HuertaGate';
import HuertaPlannerPage from '@/pages/HuertaPlannerPage';

// In German, for German visitors: the path sets the language.
export const Route = createFileRoute('/de_/huerta_/gartenplaner')({
  component: () => (
    <HuertaGate>
      <HuertaPlannerPage />
    </HuertaGate>
  ),
});
