import { shouldShowHuerta } from '@/lib/feature-flags';

/**
 * Funges is one site with spaces a visitor moves between: Terra, the foraging
 * app, and Huerta, the garden. Each has its own pages and its own brand colour
 * (index.css, the space blocks); the space is decided by the path.
 */
export type Space = 'terra' | 'huerta';

/** Where a space opens when it has not been visited yet. */
export const SPACE_HOME: Record<Space, string> = {
  terra: '/map',
  huerta: '/huerta/map',
};

/** The spaces a visitor can switch between: Huerta only where it is shown. */
export const visibleSpaces = (): Space[] =>
  shouldShowHuerta ? ['terra', 'huerta'] : ['terra'];

/** Pages every space shares (the phone hub, help, legal): no space of their own. */
const SHARED =
  /(^|\/)(settings|support|impressum|privacy-policy|termsuse)(\/|$)/;

/** The space a path belongs to (a `huerta` segment, wherever the base path
 *  puts it; no Terra route has one), or null for a shared page. */
export const spaceForPath = (pathname: string): Space | null =>
  /(^|\/)huerta(\/|$)/.test(pathname)
    ? 'huerta'
    : SHARED.test(pathname)
      ? null
      : 'terra';

let lastSpace: Space = 'terra';

/** The space a page shows: its own, or on a shared page the one the visitor
 *  came from, so the hub opened from Huerta stays in Huerta's colours. */
export const currentSpace = (pathname: string): Space => {
  lastSpace = spaceForPath(pathname) ?? lastSpace;
  return lastSpace;
};

const lastPathKey = (space: Space) => `space-last-path:${space}`;

/** Remember the page a visitor is on, so switching back returns them to it. */
export const rememberPath = (pathname: string) => {
  const space = spaceForPath(pathname);
  if (!space) return;
  try {
    localStorage.setItem(lastPathKey(space), pathname);
  } catch {
    // Private mode or blocked storage: switching opens the space's home.
  }
};

/** A garden planned on this device: Huerta then opens on it, the page a
 *  gardener comes back to each week. Read straight from lib/gardens' key, so
 *  every page's bundle needn't carry the gardens code. */
const hasGarden = () => {
  try {
    return (
      JSON.parse(localStorage.getItem('huerta-gardens') ?? '[]') as {
        plan?: unknown;
      }[]
    ).some(garden => garden.plan);
  } catch {
    return false;
  }
};

/** Where switching to `space` should go: the page last seen there, else home
 *  (for Huerta with a garden planned, the garden). */
export const pathForSpace = (space: Space): string => {
  try {
    const last = localStorage.getItem(lastPathKey(space));
    if (last && spaceForPath(last) === space) return last;
  } catch {
    // As above.
  }
  return space === 'huerta' && hasGarden()
    ? '/huerta/planner'
    : SPACE_HOME[space];
};
