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
    <div className='pointer-events-none fixed left-1/2 top-4 z-50 flex -translate-x-1/2 flex-col items-center gap-2'>
      {!isOnline && (
        <Badge variant='warning'>
          <WifiOff />
          <span>{t('offline.mode')}</span>
        </Badge>
      )}

      {hasUpdate && (
        <Button
          variant='secondary'
          className='pointer-events-auto shadow-lg'
          onClick={reloadForUpdate}
        >
          <RefreshCw className='h-4 w-4' />
          <span>{t('offline.updateAvailable')}</span>
        </Button>
      )}
    </div>
  );
};
