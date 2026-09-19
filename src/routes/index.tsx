import { createFileRoute, redirect } from '@tanstack/react-router';
import LandingPage from '@/pages/LandingPage';
import { z } from 'zod';

// The map used to live at `/`, and shared links still carry its search params
// (`/?species=chant&lat=…`). Anything that looks like one goes to /map.
// `.catch(undefined)` drops a value that does not parse instead of failing the
// route: `?lng=de` is i18next's language switch, not a longitude.
const legacyMapSearch = z.object({
  species: z.string().optional().catch(undefined),
  lat: z.coerce.number().optional().catch(undefined),
  lng: z.coerce.number().optional().catch(undefined),
  zoom: z.coerce.number().optional().catch(undefined),
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
