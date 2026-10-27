import { createFileRoute, notFound } from '@tanstack/react-router';
import SpeciesDetailPage from '@/pages/SpeciesDetailPage';
import { SPECIES_DATA } from '@/data/species';

// The species page in German, for search: the path sets the language.
export const Route = createFileRoute('/de_/species_/$id')({
  beforeLoad: ({ params }) => {
    if (!SPECIES_DATA.some(s => s.id === params.id)) throw notFound();
  },
  component: SpeciesDetailPage,
});
