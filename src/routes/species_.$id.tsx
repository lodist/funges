import { createFileRoute, notFound } from '@tanstack/react-router';
import SpeciesDetailPage from '@/pages/SpeciesDetailPage';
import { SPECIES_DATA } from '@/data/species';

export const Route = createFileRoute('/species_/$id')({
  beforeLoad: ({ params }) => {
    if (!SPECIES_DATA.some(s => s.id === params.id)) throw notFound();
  },
  component: SpeciesDetailPage,
});
