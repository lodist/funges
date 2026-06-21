import React, { useEffect, useState } from 'react';
import AdvancedMap from '@/components/AdvancedMap';
import MapFallback from '@/components/MapFallback';
import { useTranslation } from 'react-i18next';

// Maximum number of visitors allowed before falling back to a simpler map.
// The limit can be configured via the `VITE_VISITOR_LIMIT` environment
// variable, defaulting to 45000 if not provided.
const VISITOR_LIMIT = parseInt(
  import.meta.env.VITE_VISITOR_LIMIT || '45000',
  10
);

const MapComponent: React.FC = () => {
  const [showMap, setShowMap] = useState<boolean | null>(null);
  const { t } = useTranslation('map');

  useEffect(() => {
    const checkVisitors = async () => {
      try {
        const res = await fetch('data/visitors.json');
        const data = await res.json();
        setShowMap(data.count <= VISITOR_LIMIT);
      } catch (err) {
        console.error('Failed to fetch visitors count', err);
        setShowMap(true);
      }
    };
    checkVisitors();
  }, []);

  if (showMap === null) {
    return null;
  }

  if (!showMap) {
    return <MapFallback error={t('fallback.limit_hit_message')} />;
  }

  return <AdvancedMap />;
};

export default MapComponent;
