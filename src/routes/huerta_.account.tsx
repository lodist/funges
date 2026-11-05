import { createFileRoute } from '@tanstack/react-router';
import { HuertaGate } from '@/components/HuertaGate';
import HuertaAccountPage from '@/pages/HuertaAccountPage';

export const Route = createFileRoute('/huerta_/account')({
  component: () => (
    <HuertaGate>
      <HuertaAccountPage />
    </HuertaGate>
  ),
});
