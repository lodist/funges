import MapComponent from '@/components/MapComponent';
import { useIsMobile } from '@/hooks/use-mobile';
import { useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Route as MapRoute } from '@/routes/index';
import { useMapStore } from '@/store/mapStore';
import { useTranslation } from 'react-i18next';
import SEO from '@/components/SEO';
import OnboardingModal from '@/components/OnboardingModal';

export default function MapPage() {
  const isMobile = useIsMobile();
  const navigate = useNavigate({ from: MapRoute.fullPath });
  const { species } = MapRoute.useSearch();
  const { setSelectedSpecies, speciesOptions } = useMapStore();
  const { t } = useTranslation('map');

  useEffect(() => {
    const validCodes = new Set(speciesOptions.map(opt => opt.code));
    const speciesCode =
      species && validCodes.has(species) ? species : 'mushroom';

    if (!species || !validCodes.has(species)) {
      navigate({
        search: { species: speciesCode },
        replace: true,
      });
    }

    setSelectedSpecies(speciesCode);
  }, [species, speciesOptions, navigate, setSelectedSpecies]);

  return (
    <>
      <SEO
        title={t('title')}
        description={t('description')}
        canonicalUrl={import.meta.env.BASE_URL}
      />
      <div className={isMobile ? 'h-full' : '-m-4'}>
        <MapComponent />
      </div>
      <OnboardingModal />
    </>
  );
}
