import { createFileRoute, notFound, redirect } from '@tanstack/react-router';
import CropPage from '@/pages/CropPage';
import { cropOfPath } from '@/lib/seo-pages';
import { shouldShowHuerta } from '@/lib/feature-flags';

// Public, unlike the garden pages around it: how to grow one crop.
export const Route = createFileRoute('/huerta_/crops_/$id')({
  beforeLoad: ({ location }) => {
    if (!shouldShowHuerta) throw redirect({ to: '/map' });
    if (!cropOfPath(location.pathname)) throw notFound();
  },
  component: CropPage,
});
