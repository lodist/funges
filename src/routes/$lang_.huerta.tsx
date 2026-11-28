import { createFileRoute, notFound } from '@tanstack/react-router';
import HuertaLandingPage from '@/pages/HuertaLandingPage';
import { pathLanguage } from '@/lib/seo-pages';

// Huerta's front page in another language, for search: the path sets the language.
export const Route = createFileRoute('/$lang_/huerta')({
  beforeLoad: ({ location }) => {
    if (!pathLanguage(location.pathname)) throw notFound();
  },
  component: HuertaLandingPage,
});
