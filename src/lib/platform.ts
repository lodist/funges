/**
 * True for iPhone/iPod, and for iPadOS 13+ (which reports `navigator.platform`
 * as `'MacIntel'` — identical to a real Mac — but exposes multi-touch, which a
 * desktop trackpad-only Mac never does).
 *
 * Deliberately UA/platform sniffing rather than an `@supports`/`@media`
 * feature query: Android Chrome and desktop browsers also support
 * `backdrop-filter`, so a capability check alone can't scope an Apple-only
 * treatment to Apple devices.
 */
export function isAppleMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;

  if (/iPhone|iPod|iPad/.test(navigator.userAgent)) return true;

  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

/** The Android app's store page (a TWA of this site, package es.fung.app). */
export const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=es.fung.app';
