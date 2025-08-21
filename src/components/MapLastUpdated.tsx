import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip';

interface Metadata {
  updated_at: string;
}

const MapLastUpdated: React.FC = () => {
  const { t, i18n } = useTranslation('map');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    fetch('/data/scores_metadata.json')
      .then(res => res.json())
      .then((data: Metadata) => setLastUpdated(new Date(data.updated_at)))
      .catch(() => {});
  }, []);

  const formatTime = () => {
    if (!lastUpdated) return '';
    const now = Date.now();
    const diffMs = now - lastUpdated.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    if (diffMinutes < 60) {
      const rtf = new Intl.RelativeTimeFormat(i18n.language, {
        numeric: 'auto',
      });
      return rtf.format(-diffMinutes, 'minute');
    }
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
      const rtf = new Intl.RelativeTimeFormat(i18n.language, {
        numeric: 'auto',
      });
      return rtf.format(-diffHours, 'hour');
    }
    return new Intl.DateTimeFormat(i18n.language, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(lastUpdated);
  };

  if (!lastUpdated) return null;

  return (
    <div className='absolute bottom-2 left-2 z-10'>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className='rounded bg-background/80 px-2 py-1 text-xs shadow-md'>
            {t('lastUpdated')}: {formatTime()}
          </span>
        </TooltipTrigger>
        <TooltipContent side='top'>{t('dataFreshnessTooltip')}</TooltipContent>
      </Tooltip>
    </div>
  );
};

export default MapLastUpdated;
