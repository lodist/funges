import { createFileRoute } from '@tanstack/react-router';
import LandingPage from '@/pages/LandingPage';

// The front page in German, for search: the path sets the language.
export const Route = createFileRoute('/de')({
  component: LandingPage,
});
