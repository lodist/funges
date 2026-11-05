import { createFileRoute } from '@tanstack/react-router';
import HuertaInstructionsPage from '@/pages/HuertaInstructionsPage';

// Public, as Terra's: how Huerta works, before anyone signs in.
export const Route = createFileRoute('/huerta_/instructions')({
  component: HuertaInstructionsPage,
});
