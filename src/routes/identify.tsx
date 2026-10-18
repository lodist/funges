import { createFileRoute } from '@tanstack/react-router';
import IdentifyPage from '@/pages/IdentifyPage';

export const Route = createFileRoute('/identify')({
  component: IdentifyPage,
});
