import * as React from 'react';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';

/**
 * Mounts a story inside a memory-history router.
 *
 * Its own file rather than a local in `decorators.tsx` because this is the one
 * piece of the decorator set that needs hooks — and a module that exports a
 * component alongside the plain `withX` decorator functions trips
 * `react-refresh/only-export-components`, which the lint gate treats as an
 * error.
 */
export const RouterHost = ({ Story }: { Story: React.ComponentType }) => {
  // Built once per mount: `createRouter` owns mutable navigation state, so a
  // shared instance would leak one story's location into the next.
  const router = React.useMemo(() => {
    const rootRoute = createRootRoute();
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => <Story />,
    });
    // Anything rendering a `Link` to a real app path needs somewhere for that
    // path to resolve, or the router logs a failed match for every link.
    const catchAllRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '$',
      component: () => <Story />,
    });

    return createRouter({
      routeTree: rootRoute.addChildren([indexRoute, catchAllRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    });
  }, [Story]);

  // The typed route tree is the application's, not this ad-hoc one, so the
  // generated `Link`/`useLocation` types don't line up. Stories only need the
  // runtime context.
  return <RouterProvider router={router as never} />;
};
