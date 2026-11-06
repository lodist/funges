import { createFileRoute } from '@tanstack/react-router';
import LandingPage from '@/pages/LandingPage';

// Terra's front page, one door in from the shared front page.
export const Route = createFileRoute('/terra')({
  component: LandingPage,
});
