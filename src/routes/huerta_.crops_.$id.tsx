import { createFileRoute, notFound, redirect } from '@tanstack/react-router';
import CropPage from '@/pages/CropPage';
import { CROPS } from '@/lib/huerta';
import { shouldShowHuerta } from '@/lib/feature-flags';

// Public, unlike the garden pages around it: how to grow one crop.
export const Route = createFileRoute('/huerta_/crops_/$id')({
  beforeLoad: ({ params }) => {
    if (!shouldShowHuerta) throw redirect({ to: '/map' });
    if (!CROPS.some(c => c.id === params.id)) throw notFound();
  },
  component: CropPage,
});
