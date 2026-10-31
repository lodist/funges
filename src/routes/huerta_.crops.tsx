import { createFileRoute } from '@tanstack/react-router';
import { HuertaGate } from '@/components/HuertaGate';
import HuertaPage from '@/pages/HuertaPage';

export const Route = createFileRoute('/huerta_/crops')({
  component: () => (
    <HuertaGate>
      <HuertaPage />
    </HuertaGate>
  ),
});
