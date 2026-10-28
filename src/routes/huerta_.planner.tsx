import { createFileRoute } from '@tanstack/react-router';
import { HuertaGate } from '@/components/HuertaGate';
import HuertaPlannerPage from '@/pages/HuertaPlannerPage';

export const Route = createFileRoute('/huerta_/planner')({
  component: () => (
    <HuertaGate>
      <HuertaPlannerPage />
    </HuertaGate>
  ),
});
