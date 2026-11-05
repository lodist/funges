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

/**
 * Whether to point the visitor at the Play listing: in any browser tab except
 * on an iPhone or iPad, which can't install it, and never inside an installed
 * app (the Play app or an installed PWA, both standalone).
 */
export function offersPlayStore(): boolean {
  return !(
    isAppleMobileDevice() ||
    window.matchMedia('(display-mode: standalone)').matches ||
    isPlayApp()
  );
}

const PLAY_APP_KEY = 'playApp';

/**
 * Whether this page runs inside the Play app. Play's payments policy forbids
 * pointing its users at a way to pay outside Play billing, donations included,
 * so Support is hidden there. The app run by Chrome reports standalone on
 * Android (as does a PWA installed there, which loses Support too); a TWA run
 * by another browser only says so in its launch referrer, which is gone after
 * a reload, so the tab remembers it. The referrer must name this app: the
 * Google app and Gmail send their own android-app:// one into a normal tab.
 */
export function isPlayApp(): boolean {
  try {
    if (sessionStorage.getItem(PLAY_APP_KEY)) return true;
  } catch {
    // Storage blocked: the referrer check below still holds on first load.
  }
  if (document.referrer.startsWith('android-app://es.fung.app')) {
    try {
      sessionStorage.setItem(PLAY_APP_KEY, '1');
    } catch {
      // Storage blocked: nothing to remember it in.
    }
    return true;
  }
  return (
    /Android/.test(navigator.userAgent) &&
    window.matchMedia('(display-mode: standalone)').matches
  );
}
