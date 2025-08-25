import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface Metadata {
  updated_at: string;
}

interface MapLastUpdatedProps {
  variant?: 'sidebar' | 'mobile' | 'map';
}

const MapLastUpdated: React.FC<MapLastUpdatedProps> = ({ variant = 'map' }) => {
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
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(lastUpdated);
  };

  if (!lastUpdated) return null;

  if (variant === 'sidebar') {
    return (
      <span className='font-medium break-words'>
        {t('updatedAt')}: {formatTime()}
      </span>
    );
  }

  if (variant === 'mobile') {
    return (
      <div className='flex items-center gap-2 text-[10px] text-muted-foreground'>
        <div className='w-2 h-2 bg-green-500 rounded-full animate-pulse flex-shrink-0'></div>
        <span className='break-words leading-relaxed'>
          {t('updatedAt')}: {formatTime()}
        </span>
      </div>
    );
  }

  return (
    <div className='absolute bottom-4 left-4 z-10'>
      <span className='inline-flex items-center gap-2 rounded-lg bg-white border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 shadow-lg hover:shadow-xl transition-all duration-200 hover:bg-gray-50'>
        <div className='w-2 h-2 bg-green-500 rounded-full animate-pulse'></div>
        {t('updatedAt')}: {formatTime()}
      </span>
    </div>
  );
};

export default MapLastUpdated;
