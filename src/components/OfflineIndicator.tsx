import { usePWA } from '@/hooks/use-pwa';
import { Badge } from '@/components/ui/badge';
import { WifiOff } from '@/lib/icons';
import { useTranslation } from 'react-i18next';

export const OfflineIndicator = () => {
  const { t } = useTranslation('common');
  const { isOnline } = usePWA();

  if (isOnline) {
    return null;
  }

  return (
    <div className='pointer-events-none fixed left-1/2 top-4 z-50 flex -translate-x-1/2 flex-col items-center gap-2'>
      <Badge variant='warning'>
        <WifiOff />
        <span>{t('offline.mode')}</span>
      </Badge>
    </div>
  );
};
