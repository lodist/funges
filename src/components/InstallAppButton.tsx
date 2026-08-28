import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Download } from '@/lib/icons';
import { usePWA } from '@/hooks/use-pwa';
import { showInstallPrompt, canInstallApp } from '@/lib/pwa';
import { useTranslation } from 'react-i18next';

const InstallAppButton = () => {
  const { t } = useTranslation('common');
  const { isInstalled } = usePWA();
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    // Check immediately if app can be installed
    const checkInstallation = () => {
      setCanInstall(canInstallApp());
    };

    // Check on mount
    checkInstallation();

    // Set up event listener for beforeinstallprompt
    const handler = () => {
      console.debug('📱 beforeinstallprompt event fired');
      checkInstallation();
    };

    // Listen for the custom event from pwa.ts
    const customHandler = () => {
      console.debug('📱 Custom PWA install prompt ready event received');
      checkInstallation();
    };

    // Listen for the events
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('pwaInstallPromptReady', customHandler);

    // Also check periodically in case the event was missed
    const interval = setInterval(checkInstallation, 1000);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('pwaInstallPromptReady', customHandler);
      clearInterval(interval);
    };
  }, []);

  const handleClick = async () => {
    await showInstallPrompt();
    setCanInstall(canInstallApp());
  };

  if (!canInstall || isInstalled) {
    return null;
  }

  return (
    <Button
      size='lg'
      onClick={handleClick}
      className='w-full md:hidden bg-gradient-to-r to-status-warning text-white shadow-md to-status-warning transition-colors'
    >
      <Download />
      {t('offline.installApp')}
    </Button>
  );
};

export default InstallAppButton;
