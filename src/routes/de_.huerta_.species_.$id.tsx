import { createFileRoute, notFound } from '@tanstack/react-router';
import CropPage from '@/pages/CropPage';
import { CROPS } from '@/lib/huerta';

// The public crop page in German, for search: the path sets the language.
export const Route = createFileRoute('/de_/huerta_/species_/$id')({
  beforeLoad: ({ params }) => {
    if (!CROPS.some(c => c.id === params.id)) throw notFound();
  },
  component: CropPage,
});
