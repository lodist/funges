import AdvancedMap from '@/components/AdvancedMap';
import { useIsMobile } from '@/hooks/use-mobile';
import { useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Route as MapRoute } from '@/routes/map';
import { useMapStore } from '@/store/mapStore';
import { useTranslation } from 'react-i18next';
import SEO from '@/components/SEO';
import { useUIStore } from '@/store/uiStore';
import OnboardingModal from '@/components/OnboardingModal';

export default function MapPage() {
  const isMobile = useIsMobile();
  const navigate = useNavigate({ from: MapRoute.fullPath });
  const { species, lat, lng, zoom, identify } = MapRoute.useSearch();
  const setActiveModal = useUIStore(state => state.setActiveModal);
  const { syncSelectedSpecies, speciesOptions, setCenter, setZoom } =
    useMapStore();
  const { t } = useTranslation('map');

  useEffect(() => {
    const validCodes = new Set(speciesOptions.map(opt => opt.code));
    const speciesCode =
      species && validCodes.has(species) ? species : 'mushroom';

    if (!species || !validCodes.has(species)) {
      navigate({
        search: {
          species: speciesCode,
          lat,
          lng,
          zoom,
        },
        replace: true,
      });
    }

    syncSelectedSpecies(speciesCode);
  }, [species, speciesOptions, navigate, syncSelectedSpecies, lat, lng, zoom]);

  // /map?identify=true (from the landing page) opens the photo panel once,
  // then drops the flag so a reload or back-navigation does not reopen it.
  useEffect(() => {
    if (!identify) return;
    setActiveModal('identify');
    navigate({
      search: { species, lat, lng, zoom },
      replace: true,
    });
  }, [identify, setActiveModal, navigate, species, lat, lng, zoom]);

  useEffect(() => {
    if (typeof lat === 'number' && typeof lng === 'number') {
      setCenter([lng, lat]);
    }

    if (typeof zoom === 'number') {
      setZoom(zoom);
    }
  }, [lat, lng, zoom, setCenter, setZoom]);

  return (
    <>
      <SEO
        title={t('title')}
        description={t('description')}
        canonicalUrl={`${import.meta.env.BASE_URL}map`}
      />
      <div className={isMobile ? 'h-full' : '-m-4'}>
        <AdvancedMap />
      </div>
      <OnboardingModal />
    </>
  );
}
