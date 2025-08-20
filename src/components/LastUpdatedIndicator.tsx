import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip';
import { useMapStore } from '@/store/mapStore';

const formatLastUpdated = (timestamp: string, locale: string): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const msInMinute = 60 * 1000;
  const msInHour = 60 * msInMinute;
  const msInDay = 24 * msInHour;

  if (diff < msInDay) {
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    if (diff < msInHour) {
      const minutes = Math.round(diff / msInMinute);
      return rtf.format(-minutes, 'minute');
    }
    const hours = Math.round(diff / msInHour);
    return rtf.format(-hours, 'hour');
  }

  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
};

const LastUpdatedIndicator: React.FC = () => {
  const { t, i18n } = useTranslation('map');
  const lastDataRefresh = useMapStore(state => state.lastDataRefresh);

  const formatted = useMemo(() => {
    if (!lastDataRefresh) return null;
    return formatLastUpdated(lastDataRefresh, i18n.language);
  }, [lastDataRefresh, i18n.language]);

  if (!formatted) return null;

  return (
    <div className='absolute bottom-4 right-4 z-20'>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className='rounded-md bg-black/70 px-2 py-1 text-xs text-white'>
            {t('lastUpdated')}: {formatted}
          </div>
        </TooltipTrigger>
        <TooltipContent side='top'>
          <p>{t('lastUpdatedInfo')}</p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
};

export default LastUpdatedIndicator;
