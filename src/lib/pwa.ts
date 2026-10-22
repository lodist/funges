// PWA Installation and Update Handling

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;

// Function to set up the beforeinstallprompt event listener
const setupInstallPromptListener = () => {
  // Only set up once
  if ('__pwaListenerSetup' in window) {
    return;
  }

  // Mark as set up
  (window as Window & { __pwaListenerSetup?: boolean }).__pwaListenerSetup =
    true;

  // Listen for the beforeinstallprompt event
  window.addEventListener('beforeinstallprompt', e => {
    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault();
    // Stash the event so it can be triggered later
    deferredPrompt = e as BeforeInstallPromptEvent;
    console.debug('📱 PWA installation prompt ready', deferredPrompt);

    // Dispatch a custom event to notify components
    window.dispatchEvent(new CustomEvent('pwaInstallPromptReady'));
  });

  console.debug('🔧 PWA installation listener set up');
};

// Set up the listener immediately
if (typeof window !== 'undefined') {
  // Set up immediately if DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupInstallPromptListener);
  } else {
    setupInstallPromptListener();
  }
}

// Function to show installation prompt
export const showInstallPrompt = async (): Promise<boolean> => {
  if (!deferredPrompt) {
    console.debug('No installation prompt available');
    return false;
  }

  try {
    // Show the install prompt
    deferredPrompt.prompt();

    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;

    if (outcome === 'accepted') {
      console.debug('✅ User accepted the install prompt');
      return true;
    } else {
      console.debug('❌ User dismissed the install prompt');
      return false;
    }
  } catch (error) {
    console.error('Error showing install prompt:', error);
    return false;
  }
};

// Function to check if app can be installed
export const canInstallApp = (): boolean => {
  const canInstall = !!deferredPrompt;
  console.debug('🔍 Can install app:', canInstall, deferredPrompt);
  return canInstall;
};

// Updates. A new version installs in the background and waits; the root route
// hands over to it at the next page change (see activateUpdate), so a deploy
// never reloads the page someone is using.
const sw =
  typeof navigator !== 'undefined' && 'serviceWorker' in navigator
    ? navigator.serviceWorker
    : undefined;
// The worker this document was loaded under; null on a first visit.
const loadedUnder = sw?.controller ?? null;
let registration: ServiceWorkerRegistration | undefined;

if (sw && import.meta.env.PROD) {
  // After load, so the precache download does not compete with the page.
  window.addEventListener('load', () => {
    // No worker (a private window, say): the site still works online.
    sw.register(`${import.meta.env.BASE_URL}sw.js`, {
      scope: import.meta.env.BASE_URL,
    })
      .then(r => (registration = r))
      .catch(() => {});
  });
} else if (sw) {
  // ponytail: removes the empty-precache worker the dev server registered
  // until Oct 2026, which would keep serving cached images on localhost.
  void sw.getRegistrations().then(rs => rs.forEach(r => void r.unregister()));
}

/** True when a newer version than the one on screen is installed: waiting,
 *  or already activated by another tab (whose takeover left this page on
 *  code the new worker no longer caches). */
export const isOutdated = (): boolean =>
  !!registration?.waiting ||
  (loadedUnder !== null && sw?.controller !== loadedUnder);

/** Lets a waiting version take over. Resolves once it controls the page, so
 *  the load that follows is served by the new version. */
export const activateUpdate = (): Promise<void> => {
  const waiting = registration?.waiting;
  if (!sw || !waiting) return Promise.resolve();
  return new Promise(resolve => {
    sw.addEventListener('controllerchange', () => resolve(), { once: true });
    // ponytail: a worker that never answers must not swallow the click
    window.setTimeout(resolve, 3000);
    waiting.postMessage({ type: 'SKIP_WAITING' });
  });
};
