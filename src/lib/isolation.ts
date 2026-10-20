/**
 * Which routes run in a cross-origin-isolated document.
 *
 * Photo ID runs its model on several CPU threads only when the page is
 * cross-origin isolated, and a page is isolated only by the headers it was
 * loaded with: a client-side route change cannot switch it on or off. So the
 * edge adds COOP/COEP to /identify alone, and moving between /identify and
 * any other route must load a fresh document.
 *
 * Scoped to one route on purpose. Isolating the whole site left returning
 * visitors (service worker in control) stuck on the map's loading screen on
 * 18 Oct 2026, while fresh visitors were fine.
 */

const base = import.meta.env.BASE_URL || '/';

/** The isolated route, without a trailing slash: `/identify`. */
export const IDENTIFY_PATH = `${base}identify`;

/** Link target for the isolated route. The trailing slash is the folder
 *  GitHub Pages serves with HTTP 200; without it every link is a 301. */
export const IDENTIFY_HREF = `${IDENTIFY_PATH}/`;

export function isIsolatedPath(pathname: string): boolean {
  return pathname === IDENTIFY_PATH || pathname.startsWith(`${IDENTIFY_PATH}/`);
}

/**
 * True when the route just navigated to belongs on the other side of the
 * isolation line from the document that is showing it.
 *
 * Compared against the path the document was LOADED at, not the previous
 * route, so a reload can never loop: after it, the two always agree.
 */
export function crossesIsolationBoundary(
  documentPath: string,
  nextPath: string
): boolean {
  return isIsolatedPath(documentPath) !== isIsolatedPath(nextPath);
}
