import { createFileRoute } from '@tanstack/react-router';
import SeasonAtlasPage from '@/pages/SeasonAtlasPage';

// Outside /data (the trailing underscore): DataPage renders no outlet.
export const Route = createFileRoute('/data_/seasons/$place/$species')({
  component: SeasonAtlasPage,
});
