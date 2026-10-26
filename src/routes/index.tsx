import { createFileRoute, redirect } from '@tanstack/react-router';
import LandingPage from '@/pages/LandingPage';
// zod's mini build: the same checks, a fraction of the entry chunk.
import * as z from 'zod/mini';

// The map used to live at `/`, and shared links still carry its search params
// (`/?species=chant&lat=…`). Anything that looks like one goes to /map.
// `.catch(undefined)` drops a value that does not parse instead of failing the
// route: `?lng=de` is i18next's language switch, not a longitude.
const legacyMapSearch = z.object({
  species: z.catch(z.optional(z.string()), undefined),
  lat: z.catch(z.optional(z.coerce.number()), undefined),
  lng: z.catch(z.optional(z.coerce.number()), undefined),
  zoom: z.catch(z.optional(z.coerce.number()), undefined),
});

export const Route = createFileRoute('/')({
  component: LandingPage,
  validateSearch: legacyMapSearch,
  beforeLoad: ({ search }) => {
    const { species, lat, lng, zoom } = search;
    if (
      species !== undefined ||
      lat !== undefined ||
      lng !== undefined ||
      zoom !== undefined
    ) {
      throw redirect({
        to: '/map',
        search: { species, lat, lng, zoom },
        replace: true,
      });
    }
  },
});
