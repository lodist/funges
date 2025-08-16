import { createFileRoute } from '@tanstack/react-router';
import ImpressumPage from '@/pages/ImpressumPage';

export const Route = createFileRoute('/impressum')({
  component: ImpressumPage,
});
