import { createFileRoute } from '@tanstack/react-router';
import InstructionsPage from '@/pages/InstructionsPage';

export const Route = createFileRoute('/instructions')({
  component: InstructionsPage,
});
