import { createFileRoute } from '@tanstack/react-router';
import HuertaLandingPage from '@/pages/HuertaLandingPage';

// Huerta's front page in German, for search: the path sets the language.
export const Route = createFileRoute('/de_/huerta')({
  component: HuertaLandingPage,
});
