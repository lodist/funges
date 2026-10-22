import { useState, useEffect } from 'react';

interface PWAStatus {
  isOnline: boolean;
  isInstalled: boolean;
  isLoading: boolean;
}

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

interface NavigatorWithStandalone extends Navigator {
  standalone?: boolean;
}

interface WindowWithDeferredPrompt extends Window {
  deferredPrompt?: BeforeInstallPromptEvent;
}

export const usePWA = () => {
  const [status, setStatus] = useState<PWAStatus>({
    isOnline: navigator.onLine,
    isInstalled: false,
    isLoading: true,
  });

  useEffect(() => {
    // Check if app is installed (PWA)
    const checkInstallation = () => {
      const isInstalled =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as NavigatorWithStandalone).standalone === true;

      setStatus(prev => ({ ...prev, isInstalled, isLoading: false }));
    };

    // Handle online/offline status
    const handleOnline = () => setStatus(prev => ({ ...prev, isOnline: true }));
    const handleOffline = () =>
      setStatus(prev => ({ ...prev, isOnline: false }));

    // Check installation status
    checkInstallation();

    // Listen for online/offline events
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Listen for display mode changes (PWA installation)
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    mediaQuery.addEventListener('change', checkInstallation);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      mediaQuery.removeEventListener('change', checkInstallation);
    };
  }, []);

  // Function to install PWA
  const installPWA = async () => {
    if ('serviceWorker' in navigator && 'BeforeInstallPromptEvent' in window) {
      const promptEvent = (window as WindowWithDeferredPrompt).deferredPrompt;
      if (promptEvent) {
        promptEvent.prompt();
        const { outcome } = await promptEvent.userChoice;
        if (outcome === 'accepted') {
          setStatus(prev => ({ ...prev, isInstalled: true }));
        }
        (window as WindowWithDeferredPrompt).deferredPrompt = undefined;
      }
    }
  };

  return {
    ...status,
    installPWA,
  };
};
