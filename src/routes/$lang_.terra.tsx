import { createFileRoute, notFound } from '@tanstack/react-router';
import LandingPage from '@/pages/LandingPage';
import { pathLanguage } from '@/lib/seo-pages';

// Terra's front page in another language, for search: the path sets the language.
export const Route = createFileRoute('/$lang_/terra')({
  beforeLoad: ({ location }) => {
    if (!pathLanguage(location.pathname)) throw notFound();
  },
  component: LandingPage,
});
