import { createFileRoute } from '@tanstack/react-router';
import { HuertaGate } from '@/components/HuertaGate';
import HuertaYearPage from '@/pages/HuertaYearPage';

export const Route = createFileRoute('/huerta_/year')({
  component: () => (
    <HuertaGate>
      <HuertaYearPage />
    </HuertaGate>
  ),
});
