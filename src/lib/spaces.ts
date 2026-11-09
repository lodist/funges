import {
  cropOfPath,
  localizedPath,
  pathLanguage,
  stripLanguage,
  type IndexedLanguage,
} from '@/lib/seo-pages';

/**
 * Funges is one site with spaces a visitor moves between: Terra, the foraging
 * app, and Huerta, the garden. Each has its own pages and its own brand colour
 * (index.css, the space blocks); the space is decided by the path.
 */
export type Space = 'terra' | 'huerta';

/** Huerta's pages took names that say what they are (31 Oct 2026, before
 *  launch); links, morning alerts and pages remembered from before land on
 *  the new path, in the same language and with the same query. */
const RENAMED: Record<string, string> = {
  species: 'crops',
  planner: 'garden-planner',
  year: 'planting-calendar',
};
export function renamedPath(path: string) {
  const renamed = path.replace(
    /(^|\/)huerta\/(species|planner|year)(?=\/|$)/,
    (_, before: string, page: string) => `${before}huerta/${RENAMED[page]}`
  );
  // A crop's page under an older path (its id's underscore, English words
  // under /de): the path its language gives it now.
  if (!cropOfPath(renamed)) return renamed;
  const page = localizedPath(renamed, pathLanguage(renamed) ?? 'en');
  const bare = (p: string) => p.replace(/\/$/, '');
  return bare(page) === bare(renamed) ? renamed : page;
}

/** Where a space opens when it has not been visited yet. */
export const SPACE_HOME: Record<Space, string> = {
  terra: '/map',
  huerta: '/huerta/map',
};

/** The spaces a visitor can switch between. */
export const visibleSpaces = (): Space[] => ['terra', 'huerta'];

/** Pages every space shares (help, legal, the game): no space of their own. */
const SHARED =
  /(^|\/)(support|impressum|privacy-policy|termsuse|delete-account|play)(\/|$)/;

/** Each space's Settings, the phone hub. Switching spaces there opens the
 *  other space's Settings, not the page last seen in it. */
const SETTINGS: Record<Space, string> = {
  terra: '/settings',
  huerta: '/huerta/settings',
};
const isSettings = (pathname: string) => /(^|\/)settings\/?$/.test(pathname);

/** The space a path belongs to (a `huerta` segment, wherever the base path
 *  puts it; no Terra route has one), or null for a shared page: the front
 *  page every space opens from is one. */
export const spaceForPath = (pathname: string): Space | null =>
  /(^|\/)huerta(\/|$)/.test(pathname)
    ? 'huerta'
    : SHARED.test(pathname) || stripLanguage(pathname) === '/'
      ? null
      : 'terra';

let lastSpace: Space = 'terra';

/** The space a page shows: its own, or on a shared page the one the visitor
 *  came from, so help opened from Huerta stays in Huerta's colours. */
export const currentSpace = (pathname: string): Space => {
  lastSpace = spaceForPath(pathname) ?? lastSpace;
  return lastSpace;
};

const lastPathKey = (space: Space) => `space-last-path:${space}`;
const LAST_SPACE = 'space-last';

/** Remember the page a visitor is on, so switching back returns them to it,
 *  and its space, so the front page can open straight into it next time. */
export const rememberPath = (pathname: string) => {
  const space = spaceForPath(pathname);
  if (!space) return;
  try {
    // Not Settings: switching from another page still opens a page of the space.
    if (!isSettings(pathname))
      localStorage.setItem(lastPathKey(space), pathname);
    localStorage.setItem(LAST_SPACE, space);
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

/** Where switching to `space` from the page at `from` should go: from
 *  Settings, that space's Settings; else the page last seen there, else home
 *  (for Huerta with a garden planned, the garden). */
export const pathForSpace = (space: Space, from = ''): string => {
  if (isSettings(from)) return SETTINGS[space];
  try {
    const last = localStorage.getItem(lastPathKey(space));
    if (last && spaceForPath(last) === space) return last;
  } catch {
    // As above.
  }
  return space === 'huerta' && hasGarden()
    ? '/huerta/garden-planner'
    : SPACE_HOME[space];
};

/** Where a space's door on the front page leads: the space's own front page. */
export const spaceDoor = (space: Space, lang: IndexedLanguage = 'en'): string =>
  localizedPath(`/${space}/`, lang);

/** The door the visitor last went through (the space last used), if any. */
export const lastDoor = (): string | null => {
  try {
    const space = localStorage.getItem(LAST_SPACE);
    return space === 'terra' || space === 'huerta' ? spaceDoor(space) : null;
  } catch {
    return null;
  }
};
