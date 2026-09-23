import { createFileRoute } from '@tanstack/react-router';
import MapPage from '@/pages/MapPage';
import { z } from 'zod';

export const Route = createFileRoute('/map')({
  component: MapPage,
  validateSearch: z.object({
    species: z.string().optional(),
    lat: z.coerce.number().optional(),
    lng: z.coerce.number().optional(),
    zoom: z.coerce.number().optional(),
    // Landing-page deep link: opens the photo identification panel on arrival.
    identify: z.coerce.boolean().optional(),
  }),
});
