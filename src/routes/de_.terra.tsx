import { createFileRoute } from '@tanstack/react-router';
import LandingPage from '@/pages/LandingPage';

// Terra's front page in German, for search: the path sets the language.
export const Route = createFileRoute('/de_/terra')({
  component: LandingPage,
});
