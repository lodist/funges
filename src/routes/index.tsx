import { createFileRoute, redirect } from '@tanstack/react-router';
import FrontPage from '@/pages/FrontPage';
import LandingPage from '@/pages/LandingPage';
import { shouldShowHuerta } from '@/lib/feature-flags';
import { lastDoor } from '@/lib/spaces';
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

// The Play app and a typed-in address open here. Opened here, the page goes
// straight through the door the visitor last took; reached from inside the
// app (the logo), it stays.
let opened = window.location.pathname === import.meta.env.BASE_URL;

// The front page every space opens from; Terra's own until Huerta launches.
export const Route = createFileRoute('/')({
  component: shouldShowHuerta ? FrontPage : LandingPage,
  validateSearch: legacyMapSearch,
  beforeLoad: ({ search, preload }) => {
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
    if (preload) return;
    const door = opened && shouldShowHuerta ? lastDoor() : null;
    opened = false;
    if (door) throw redirect({ href: door, replace: true });
  },
});
