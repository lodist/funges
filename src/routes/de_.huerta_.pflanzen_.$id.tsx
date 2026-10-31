import { createFileRoute, notFound, redirect } from '@tanstack/react-router';
import CropPage from '@/pages/CropPage';
import { cropOfPath } from '@/lib/seo-pages';
import { shouldShowHuerta } from '@/lib/feature-flags';

// The public crop page in German, for search: the path sets the language.
export const Route = createFileRoute('/de_/huerta_/pflanzen_/$id')({
  beforeLoad: ({ location }) => {
    if (!shouldShowHuerta) throw redirect({ to: '/map' });
    if (!cropOfPath(location.pathname)) throw notFound();
  },
  component: CropPage,
});
