import { createFileRoute } from '@tanstack/react-router';
import FrontPage from '@/pages/FrontPage';
import LandingPage from '@/pages/LandingPage';
import { shouldShowHuerta } from '@/lib/feature-flags';

// The front page in German, for search: the path sets the language.
export const Route = createFileRoute('/de')({
  component: shouldShowHuerta ? FrontPage : LandingPage,
});
