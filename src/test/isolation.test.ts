import { describe, expect, it } from 'vitest';
import {
  crossesIsolationBoundary,
  IDENTIFY_HREF,
  isIsolatedPath,
} from '@/lib/isolation';

/**
 * Only /identify is served cross-origin isolated, and isolation is fixed when
 * a document loads. A client-side route change across that line would either
 * run photo ID single-threaded, or carry the map into an isolated document —
 * the state that hung returning visitors on 18 Oct 2026.
 */
describe('isolation boundary', () => {
  it('recognises the identify route with and without its trailing slash', () => {
    expect(isIsolatedPath('/identify')).toBe(true);
    expect(isIsolatedPath('/identify/')).toBe(true);
    expect(isIsolatedPath(IDENTIFY_HREF)).toBe(true);
  });

  it('does not mistake a route that merely starts with the same letters', () => {
    expect(isIsolatedPath('/identify-later')).toBe(false);
    expect(isIsolatedPath('/map')).toBe(false);
    expect(isIsolatedPath('/')).toBe(false);
  });

  it('reloads when crossing in either direction, never when staying put', () => {
    expect(crossesIsolationBoundary('/map', '/identify/')).toBe(true);
    expect(crossesIsolationBoundary('/identify/', '/map')).toBe(true);
    expect(crossesIsolationBoundary('/map', '/species')).toBe(false);
    // After the reload the document path and the route agree, so no loop.
    expect(crossesIsolationBoundary('/identify/', '/identify')).toBe(false);
  });
});
