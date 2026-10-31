import { createFileRoute } from '@tanstack/react-router';
import { HuertaGate } from '@/components/HuertaGate';
import HuertaMapPage from '@/pages/HuertaMapPage';

export const Route = createFileRoute('/huerta_/map')({
  component: () => (
    <HuertaGate>
      <HuertaMapPage />
    </HuertaGate>
  ),
});
