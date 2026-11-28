import { createFileRoute, notFound } from '@tanstack/react-router';
import SpeciesDetailPage from '@/pages/SpeciesDetailPage';
import { SPECIES_DATA } from '@/data/species';
import { pathLanguage } from '@/lib/seo-pages';

// A species page in another language, for search: the path sets the language.
export const Route = createFileRoute('/$lang_/species_/$id')({
  beforeLoad: ({ location, params }) => {
    if (
      !pathLanguage(location.pathname) ||
      !SPECIES_DATA.some(s => s.id === params.id)
    )
      throw notFound();
  },
  component: SpeciesDetailPage,
});
