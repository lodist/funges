import { createFileRoute, notFound } from '@tanstack/react-router';
import CropPage from '@/pages/CropPage';
import { CROPS } from '@/lib/huerta';

// Public, unlike the garden pages around it: how to grow one crop.
export const Route = createFileRoute('/huerta_/species_/$id')({
  beforeLoad: ({ params }) => {
    if (!CROPS.some(c => c.id === params.id)) throw notFound();
  },
  component: CropPage,
});
