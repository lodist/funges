import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { getRepresentativeLngLat } from '@/lib/geo';
import { getSpeciesImage } from '@/lib/utils';
import { SPECIES_DATA } from '@/data/species';
import type { RegionId } from '@/lib/data';
import { Navigation, BarChart2, X } from 'lucide-react';

interface FeatureInfoModalProps {
  feature: maplibregl.GeoJSONFeature | null;
  open: boolean;
  onClose: () => void;
  hideDirections?: boolean;
  dataNerdRegion?: RegionId | null;
}

// Builds a Google Maps navigation URL for consistent cross-platform behavior
function getNavigationUrl(lat: number, lng: number): string {
  // Always use Google Maps for consistent behavior across all platforms
  // This ensures the same experience on desktop, iOS, and Android
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

// Function to get gradient color based on score (0-10 scale)
const getScoreColor = (score: number): string => {
  // Convert score from 0-10 scale to 0-100 scale
  const percentage = score * 10;

  // Map percentage to darker colors from #B3B380 (darker cream) to #1A0000 (very dark burgundy)
  if (percentage <= 20) return 'text-[#B3B380]'; // 0-20%
  if (percentage <= 40) return 'text-[#A68A4D]'; // 20-40%
  if (percentage <= 60) return 'text-[#8A4D4D]'; // 40-60%
  if (percentage <= 80) return 'text-[#660019]'; // 60-80%
  return 'text-[#1A0000]'; // 80-100%
};

export default function FeatureInfoModal({
  feature,
  open,
  onClose,
  hideDirections,
  dataNerdRegion,
}: FeatureInfoModalProps) {
  const { t } = useTranslation('map');
  const { t: tSpecies } = useTranslation('species');
  const { t: tCommon } = useTranslation('common');
  const navigate = useNavigate({ from: '/' });

  // lock body scroll when modal open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!feature) return null;

  const props = feature.properties || {};
  const [lng, lat] = getRepresentativeLngLat(feature);
  const handleDirections = () => {
    const url = getNavigationUrl(lat, lng);
    window.open(url, '_blank');
  };
  const handleDataNerd = () => {
    if (!dataNerdRegion) return;
    onClose();
    navigate({ to: '/data', search: { region: dataNerdRegion } });
  };

  // Function to get translated species name
  const getSpeciesDisplayName = (key: string) => {
    // Remove _score prefix if present
    const cleanKey = key.replace('_score', '');

    // Check if this is a species key that has a translation
    if (tSpecies(`list_of_species.${cleanKey}.name`, { defaultValue: null })) {
      return tSpecies(`list_of_species.${cleanKey}.name`);
    }

    // Return the original key if no translation found
    return key;
  };

  // Get species entries with scores, filtered and sorted. `_score_d6` is the forecast
  // day-6 endpoint (folded into its base `_score` before display) — never a species row.
  const speciesEntries = Object.entries(props)
    .filter(([key, value]) => value !== 0 && !key.endsWith('_score_d6'))
    .map(([key, value]) => {
      const cleanKey = key.replace('_score', '');
      const speciesData = SPECIES_DATA.find(species => species.id === cleanKey);

      return {
        key: cleanKey,
        score: value as number,
        name: getSpeciesDisplayName(key),
        scientificName: speciesData?.scientificName || cleanKey,
        image: getSpeciesImage(cleanKey),
      };
    })
    .filter(entry => entry.image) // Only show species with available images
    .sort((a, b) => b.score - a.score); // Sort by score descending

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className='sm:max-w-lg max-w-[95vw]'
        showCloseButton={false}
      >
        <div className='max-h-[70vh] overflow-y-auto pr-2'>
          <div className='space-y-3'>
            {speciesEntries.map(
              ({ key, score, name, image, scientificName }) => (
                <div
                  key={key}
                  className='flex items-center space-x-3 p-2 sm:p-3 bg-gray-50 rounded-lg'
                >
                  {/* Thumbnail */}
                  <div className='flex-shrink-0'>
                    {image && (
                      <div className='relative w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-br from-green-50 to-green-100 overflow-hidden rounded-lg'>
                        <img
                          src={image}
                          alt={name}
                          className='w-full h-full object-cover object-center'
                          loading='lazy'
                        />
                        <div className='absolute inset-0 bg-black/10' />
                      </div>
                    )}
                  </div>

                  {/* Species info */}
                  <div className='flex-1 min-w-0'>
                    <h3 className='font-semibold text-gray-900 text-sm sm:text-base leading-tight mb-1'>
                      {name}
                    </h3>
                    <p className='text-xs sm:text-sm text-gray-600 italic leading-tight'>
                      {scientificName}
                    </p>
                  </div>

                  {/* Score display */}
                  <div className='flex-shrink-0 text-right'>
                    <div
                      className={`text-xl sm:text-2xl font-bold ${getScoreColor(score)} leading-tight`}
                    >
                      {Math.round(score * 10)}%
                    </div>
                    <div className='text-xs text-gray-500 leading-tight'>
                      {tCommon('common.score')}: {score.toFixed(1)}/10
                    </div>
                  </div>
                </div>
              )
            )}
          </div>
        </div>
        <DialogFooter className='pt-2 sm:pt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
          <span className='text-xs text-gray-500 font-mono whitespace-nowrap'>
            {lat.toFixed(6)}, {lng.toFixed(6)}
          </span>
          <div className='flex flex-wrap gap-2 sm:justify-end'>
            <Button variant='outline' onClick={onClose}>
              <X className='h-4 w-4 mr-2' />
              {tCommon('common.close')}
            </Button>
            {!hideDirections && (
              <Button
                onClick={handleDirections}
                className='flex-1 sm:flex-none'
              >
                <Navigation className='h-4 w-4 mr-2' />
                {t('featureInfo.getDirections')}
              </Button>
            )}
            {dataNerdRegion && (
              <Button
                onClick={handleDataNerd}
                className='flex-1 sm:flex-none'
                variant='outline'
              >
                <BarChart2 className='h-4 w-4 mr-2' />
                {t('featureInfo.dataNerd')}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
