import { usePWA } from '@/hooks/use-pwa';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { WifiOff, RefreshCw } from '@/lib/icons';
import { useTranslation } from 'react-i18next';

export const OfflineIndicator = () => {
  const { t } = useTranslation('common');
  const { isOnline, hasUpdate, reloadForUpdate } = usePWA();

  if (isOnline && !hasUpdate) {
    return null;
  }

  return (
    <div className='fixed top-4 right-4 z-50 flex flex-col gap-2'>
      {!isOnline && (
        <Badge variant='warning'>
          <WifiOff />
          <span>{t('offline.mode')}</span>
        </Badge>
      )}

      {hasUpdate && (
        <Button
          variant='secondary'
          className='shadow-lg'
          onClick={reloadForUpdate}
        >
          <RefreshCw className='h-4 w-4' />
          <span>{t('offline.updateAvailable')}</span>
        </Button>
      )}
    </div>
  );
};
