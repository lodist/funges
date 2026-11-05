import { createFileRoute, notFound } from '@tanstack/react-router';
import CropPage from '@/pages/CropPage';
import { cropOfPath } from '@/lib/seo-pages';

// The public crop page in German, for search: the path sets the language.
export const Route = createFileRoute('/de_/huerta_/pflanzen_/$id')({
  beforeLoad: ({ location }) => {
    if (!cropOfPath(location.pathname)) throw notFound();
  },
  component: CropPage,
});
