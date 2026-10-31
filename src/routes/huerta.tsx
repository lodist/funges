import { createFileRoute } from '@tanstack/react-router';
import HuertaLandingPage from '@/pages/HuertaLandingPage';

// Huerta's front page: open to everyone, unlike the garden pages behind it.
export const Route = createFileRoute('/huerta')({
  component: HuertaLandingPage,
});
