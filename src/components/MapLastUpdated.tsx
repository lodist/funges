import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Database } from '@/lib/icons';

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
    const rtf = new Intl.RelativeTimeFormat(i18n.language, {
      numeric: 'auto',
    });
    const seconds = (lastUpdated.getTime() - Date.now()) / 1000;
    const units: [Intl.RelativeTimeFormatUnit, number][] = [
      ['year', 31536000],
      ['month', 2592000],
      ['week', 604800],
      ['day', 86400],
      ['hour', 3600],
      ['minute', 60],
    ];
    for (const [unit, size] of units) {
      if (Math.abs(seconds) >= size)
        return rtf.format(Math.round(seconds / size), unit);
    }
    return rtf.format(0, 'minute');
  };

  const exactDate = () =>
    lastUpdated
      ? new Intl.DateTimeFormat(i18n.language, {
          dateStyle: 'long',
          timeStyle: 'short',
        }).format(lastUpdated)
      : '';

  if (!lastUpdated) return null;

  if (variant === 'sidebar' || variant === 'mobile') {
    return (
      // Full-strength, not muted: the nav glass sits over the map, so the
      // ground is whatever the map supplies and --muted-foreground measured
      // 4.32:1 there against 5.29:1 on an opaque card.
      <div
        className='text-foreground flex items-center gap-1.5 text-xs leading-snug'
        title={`${t('updatedAt')}: ${exactDate()}`}
      >
        {/* Database, not a clock: the subject is the dataset, and the time is
            only its age. */}
        <Database className='size-3.5 shrink-0' />
        <span className='min-w-0'>
          {t('updatedAt')} <span className='font-medium'>{formatTime()}</span>
        </span>
      </div>
    );
  }

  return (
    <div className='absolute bottom-4 left-4 z-10'>
      <span className='inline-flex items-center gap-2 rounded-lg bg-card border border-border px-3 py-2 text-xs font-medium text-foreground shadow-lg hover:shadow-xl transition-all duration-base hover:bg-muted'>
        <div className='w-2 h-2 bg-primary rounded-full animate-pulse'></div>
        {t('updatedAt')}: {formatTime()}
      </span>
    </div>
  );
};

export default MapLastUpdated;
