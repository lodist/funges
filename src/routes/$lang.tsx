import { createFileRoute, notFound } from '@tanstack/react-router';
import FrontPage from '@/pages/FrontPage';
import { pathLanguage } from '@/lib/seo-pages';

// The front page in another language (/de, /fr…), for search: the path sets
// the language. Any other first word is no page.
export const Route = createFileRoute('/$lang')({
  beforeLoad: ({ location }) => {
    if (!pathLanguage(location.pathname)) throw notFound();
  },
  component: FrontPage,
});
