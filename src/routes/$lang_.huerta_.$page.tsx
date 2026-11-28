import { lazy, Suspense } from 'react';
import { createFileRoute, notFound, useLocation } from '@tanstack/react-router';
// zod's mini build: the same checks, a fraction of the entry chunk.
import * as z from 'zod/mini';
import { HuertaGate } from '@/components/HuertaGate';
import { huertaPageOf } from '@/lib/seo-pages';

// Huerta's pages in another language, in its words (/de/huerta/karte,
// /fr/huerta/carte): the path sets the language. The calendar is public, the
// rest behind sign-in. Each page loads on its own, as under its English route.
const PAGES = {
  crops: lazy(() => import('@/pages/HuertaPage')),
  map: lazy(() => import('@/pages/HuertaMapPage')),
  planner: lazy(() => import('@/pages/HuertaPlannerPage')),
  calendar: lazy(() => import('@/pages/HuertaYearPage')),
};

export const Route = createFileRoute('/$lang_/huerta_/$page')({
  // A crop's sheet opens the map or the calendar on that crop.
  validateSearch: z.object({
    crop: z.optional(z.string()),
  }),
  beforeLoad: ({ location }) => {
    if (!huertaPageOf(location.pathname)) throw notFound();
  },
  component: function LocalHuertaPage() {
    const page = huertaPageOf(useLocation().pathname) ?? 'crops';
    const Page = PAGES[page];
    return (
      <Suspense>
        {page === 'calendar' ? (
          <Page />
        ) : (
          <HuertaGate key={page}>
            <Page />
          </HuertaGate>
        )}
      </Suspense>
    );
  },
});
