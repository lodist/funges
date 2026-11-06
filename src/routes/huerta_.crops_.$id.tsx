import { createFileRoute, notFound } from '@tanstack/react-router';
import CropPage from '@/pages/CropPage';
import { cropOfPath } from '@/lib/seo-pages';

// Public, unlike the garden pages around it: how to grow one crop.
export const Route = createFileRoute('/huerta_/crops_/$id')({
  beforeLoad: ({ location }) => {
    if (!cropOfPath(location.pathname)) throw notFound();
  },
  component: CropPage,
});
