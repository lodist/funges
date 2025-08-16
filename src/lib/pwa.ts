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
