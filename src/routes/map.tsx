import { createFileRoute } from '@tanstack/react-router';
import MapPage from '@/pages/MapPage';
// zod's mini build: the same checks, a fraction of the entry chunk.
import * as z from 'zod/mini';

export const Route = createFileRoute('/map')({
  component: MapPage,
  validateSearch: z.object({
    species: z.optional(z.string()),
    lat: z.optional(z.coerce.number()),
    lng: z.optional(z.coerce.number()),
    zoom: z.optional(z.coerce.number()),
    // Landing-page deep link: opens the photo identification panel on arrival.
    identify: z.optional(z.coerce.boolean()),
  }),
});
