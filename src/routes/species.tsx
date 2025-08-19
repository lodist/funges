import { createFileRoute } from '@tanstack/react-router';
import SpeciesPage from '@/pages/SpeciesPage';

export const Route = createFileRoute('/species')({
  component: SpeciesPage,
});
