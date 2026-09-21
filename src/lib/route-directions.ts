/**
 * Real routed geometry and travel times for a Route-to-Dish plan.
 *
 * The plan itself — which stops, in which order — is still computed offline from
 * the forecast tiles. Only the LINE between those stops comes from here, so a
 * blocked, slow, or offline router degrades to the straight lines this feature
 * drew before rather than breaking the route.
 *
 * Default host is FOSSGIS's public OSRM, the same service openstreetmap.org
 * routes with: no key, CORS-enabled, fair use. Point `VITE_ROUTING_URL` at
 * another OSRM deployment if traffic ever outgrows that.
 */

import type { LngLat } from '@/lib/geo';

const ROUTER_BASE_URL =
  import.meta.env.VITE_ROUTING_URL || 'https://routing.openstreetmap.de';

export type RouteProfile = 'foot' | 'car';

/** FOSSGIS runs one OSRM instance per profile, each with its own path. */
const PROFILE_PATHS: Record<RouteProfile, string> = {
  foot: 'routed-foot/route/v1/foot',
  car: 'routed-car/route/v1/driving',
};

const REQUEST_TIMEOUT_MS = 12_000;

/**
 * Below this, the snap is just coordinate precision and drawing a connector for
 * it would litter the map with stubs. Above it, the stop genuinely sits off the
 * path network and the user needs to see that the last stretch is unrouted.
 */
const OFF_TRAIL_THRESHOLD_M = 40;

/** Public OSRM instances reject long waypoint lists; recipes never need many. */
const MAX_WAYPOINTS = 10;

const CACHE_LIMIT = 20;

export interface RouteLeg {
  /** Snapped path geometry for this hop, in order. */
  coordinates: LngLat[];
  distanceMeters: number;
  durationSeconds: number;
}

export interface WalkingRoute {
  legs: RouteLeg[];
  distanceMeters: number;
  durationSeconds: number;
  /**
   * Requested stop → where the router had to snap it, for stops with no path
   * nearby. Drawn dashed: it is the part of the walk no route can describe.
   *
   * Index-aligned with the requested waypoints (null where the snap was close
   * enough to ignore) so a caller revealing stops one by one can slice it.
   */
  offTrail: Array<[LngLat, LngLat] | null>;
}

interface OsrmStep {
  geometry?: { coordinates?: LngLat[] };
}

interface OsrmLeg {
  distance?: number;
  duration?: number;
  steps?: OsrmStep[];
}

interface OsrmResponse {
  code?: string;
  routes?: Array<{
    distance?: number;
    duration?: number;
    legs?: OsrmLeg[];
  }>;
  waypoints?: Array<{
    distance?: number;
    location?: LngLat;
  }>;
}

const routeCache = new Map<string, WalkingRoute>();
const inFlight = new Map<string, Promise<WalkingRoute | null>>();

function cacheKey(profile: RouteProfile, waypoints: LngLat[]): string {
  return `${profile}:${waypoints
    .map(([lng, lat]) => `${lng.toFixed(5)},${lat.toFixed(5)}`)
    .join(';')}`;
}

function rememberRoute(key: string, route: WalkingRoute): void {
  routeCache.set(key, route);
  // Map iterates in insertion order, so the first key is the oldest.
  while (routeCache.size > CACHE_LIMIT) {
    const oldest = routeCache.keys().next().value;
    if (oldest === undefined) break;
    routeCache.delete(oldest);
  }
}

function samePoint(a: LngLat, b: LngLat): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

/** Steps repeat the shared vertex at every joint; keep one copy. */
function joinStepGeometry(leg: OsrmLeg): LngLat[] {
  const coordinates: LngLat[] = [];

  (leg.steps ?? []).forEach(step => {
    (step.geometry?.coordinates ?? []).forEach(coordinate => {
      const previous = coordinates[coordinates.length - 1];
      if (previous && samePoint(previous, coordinate)) return;
      coordinates.push([coordinate[0], coordinate[1]]);
    });
  });

  return coordinates;
}

/**
 * Walking geometry through every waypoint in order — the line that is drawn.
 *
 * Resolves to `null` — never rejects — for every failure mode the caller treats
 * identically: offline, rate-limited, timed out, or no walkable route exists.
 */
export function fetchWalkingRoute(
  waypoints: LngLat[],
  signal?: AbortSignal
): Promise<WalkingRoute | null> {
  return fetchRoute('foot', waypoints, signal);
}

/**
 * How long the same stops take by car, as numbers only.
 *
 * Most foraging trips start with a drive, so the walking figure alone answers
 * half the question. The car route is never drawn — it would follow roads the
 * forager does not walk — so this asks for no geometry, which keeps the extra
 * request under a kilobyte.
 */
export async function fetchDrivingSummary(
  waypoints: LngLat[],
  signal?: AbortSignal
): Promise<{ distanceMeters: number; durationSeconds: number } | null> {
  const route = await fetchRoute('car', waypoints, signal);
  if (!route) return null;
  return {
    distanceMeters: route.distanceMeters,
    durationSeconds: route.durationSeconds,
  };
}

function fetchRoute(
  profile: RouteProfile,
  waypoints: LngLat[],
  signal?: AbortSignal
): Promise<WalkingRoute | null> {
  if (waypoints.length < 2 || waypoints.length > MAX_WAYPOINTS) {
    return Promise.resolve(null);
  }

  const key = cacheKey(profile, waypoints);
  const cached = routeCache.get(key);
  if (cached) return Promise.resolve(cached);

  // React re-runs effects in development StrictMode; without this the same
  // route is requested twice from a fair-use public service on every draw.
  const pending = inFlight.get(key);
  if (pending) return pending;

  const request = requestRoute(profile, waypoints, key, signal).finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, request);
  return request;
}

async function requestRoute(
  profile: RouteProfile,
  waypoints: LngLat[],
  key: string,
  signal?: AbortSignal
): Promise<WalkingRoute | null> {
  const path = waypoints
    .map(([lng, lat]) => `${lng.toFixed(6)},${lat.toFixed(6)}`)
    .join(';');
  // Steps carry the drawn geometry, so only the walking route pays for them.
  const steps = profile === 'foot';
  const url = `${ROUTER_BASE_URL}/${PROFILE_PATHS[profile]}/${path}?overview=false&geometries=geojson&steps=${steps}&alternatives=false`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const abortFromCaller = () => controller.abort();
  signal?.addEventListener('abort', abortFromCaller, { once: true });

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;

    const payload = (await response.json()) as OsrmResponse;
    const route = payload.routes?.[0];
    if (payload.code !== 'Ok' || !route?.legs?.length) return null;

    const snapped = payload.waypoints ?? [];
    const legs: RouteLeg[] = route.legs.map((leg, index) => {
      const coordinates = joinStepGeometry(leg);
      return {
        // A leg whose steps came back empty still has to connect its endpoints,
        // otherwise the drawn line silently skips that hop.
        coordinates:
          coordinates.length >= 2
            ? coordinates
            : [
                snapped[index]?.location ?? waypoints[index],
                snapped[index + 1]?.location ?? waypoints[index + 1],
              ],
        distanceMeters: leg.distance ?? 0,
        durationSeconds: leg.duration ?? 0,
      };
    });

    const offTrail = waypoints.map((waypoint, index) => {
      const snap = snapped[index];
      if (!snap?.location || (snap.distance ?? 0) < OFF_TRAIL_THRESHOLD_M) {
        return null;
      }
      return [waypoint, snap.location] as [LngLat, LngLat];
    });

    const walkingRoute: WalkingRoute = {
      legs,
      distanceMeters:
        route.distance ??
        legs.reduce((total, leg) => total + leg.distanceMeters, 0),
      durationSeconds:
        route.duration ??
        legs.reduce((total, leg) => total + leg.durationSeconds, 0),
      offTrail,
    };

    rememberRoute(key, walkingRoute);
    return walkingRoute;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abortFromCaller);
  }
}

/**
 * Planar segment length, good enough to animate with.
 *
 * Longitude is scaled by cos(lat) so an east-west leg is not drawn faster than
 * a north-south one of the same real length; absolute units do not matter here
 * because only the ratio between segments is used.
 */
function segmentLength(from: LngLat, to: LngLat): number {
  const meanLatRad = (((from[1] + to[1]) / 2) * Math.PI) / 180;
  const dx = (to[0] - from[0]) * Math.cos(meanLatRad);
  const dy = to[1] - from[1];
  return Math.hypot(dx, dy);
}

/**
 * The portion of `path` from its start to `fraction` of its total length.
 *
 * Length-based rather than vertex-based on purpose: a routed leg has hundreds
 * of vertices bunched at corners, so stepping one vertex per frame would crawl
 * through junctions and sprint down straights.
 */
export function sliceAlongPath(path: LngLat[], fraction: number): LngLat[] {
  if (path.length === 0) return [];
  if (path.length === 1 || fraction <= 0) return [path[0]];
  if (fraction >= 1) return path.map(coordinate => [...coordinate] as LngLat);

  const lengths: number[] = [];
  let total = 0;
  for (let index = 1; index < path.length; index++) {
    const length = segmentLength(path[index - 1], path[index]);
    lengths.push(length);
    total += length;
  }
  if (total === 0) return [path[0]];

  let remaining = total * fraction;
  const sliced: LngLat[] = [path[0]];

  for (let index = 0; index < lengths.length; index++) {
    if (remaining >= lengths[index]) {
      remaining -= lengths[index];
      sliced.push(path[index + 1]);
      continue;
    }

    const progress = lengths[index] === 0 ? 0 : remaining / lengths[index];
    sliced.push([
      path[index][0] + (path[index + 1][0] - path[index][0]) * progress,
      path[index][1] + (path[index + 1][1] - path[index][1]) * progress,
    ]);
    break;
  }

  return sliced;
}
