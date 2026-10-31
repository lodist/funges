import { createFileRoute } from '@tanstack/react-router';
import FrontPage from '@/pages/FrontPage';

// The front page in German, for search: the path sets the language.
export const Route = createFileRoute('/de')({
  component: FrontPage,
});
