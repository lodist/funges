// Where the user came from, for the one screen that cares: the map flies in
// when it is entered from the landing page. Recorded during the root render
// (idempotent per pathname) so a child mounting in the same commit already
// sees it; an effect in the root would run after the children's effects.
export const navHistory: { previous: string | null; current: string | null } = {
  previous: null,
  current: null,
};

export function recordPath(pathname: string): void {
  if (navHistory.current === pathname) return;
  navHistory.previous = navHistory.current;
  navHistory.current = pathname;
}

/** True when `pathname` is the landing page (`/`, or the deploy base). */
export function isLandingPath(pathname: string | null): boolean {
  if (pathname === null) return false;
  const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
  return pathname.replace(/\/+$/, '') === base;
}
