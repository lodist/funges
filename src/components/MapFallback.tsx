import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MapPin, Navigation, Info, Heart, RefreshCw } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { Trans, useTranslation } from 'react-i18next';
import { useMapStore } from '@/store/mapStore';
import { useIsMobile } from '@/hooks/use-mobile';

interface MapFallbackProps {
  className?: string;
  error?: string;
  onRetry?: () => void;
}

const MapFallback: React.FC<MapFallbackProps> = ({
  className = '',
  error: errorMessage,
  onRetry,
}) => {
  const { t } = useTranslation('map');
  const { center, foragingSpots } = useMapStore();
  const isMobile = useIsMobile();
  const basePath = import.meta.env.BASE_URL || '/';

  const handleGetLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        position => {
          const { longitude, latitude } = position.coords;
          // You could implement a simple location display here
          console.debug('User location:', { longitude, latitude });
        },
        error => {
          console.error('Geolocation error:', error);
        }
      );
    }
  };

  return (
    <div
      className={`relative ${isMobile ? 'h-full' : 'h-[calc(100vh-1rem)] my-2 pr-2'} ${className}`}
    >
      {/* Static map placeholder */}
      <Card
        className={`w-full ${isMobile ? 'h-full' : 'h-[calc(100vh-1rem)]'} h-[calc(100vh-1rem)] ${isMobile ? 'border-0 shadow-none' : 'rounded-lg border-2 border-dashed border-border shadow-lg'} overflow-hidden bg-background`}
      >
        <div className='flex flex-col items-center justify-center h-full p-4 sm:p-6 lg:p-8 text-center'>
          {/* Header with icon and title */}
          <div className='mb-4 sm:mb-6'>
            {!isMobile && (
              <MapPin className='h-12 w-12 sm:h-16 sm:w-16 text-muted-foreground mx-auto mb-3 sm:mb-4' />
            )}
            <h2 className='text-4xl font-bold text-foreground'>
              {t('fallback.title')}
            </h2>
          </div>

          {/* Error/Info Message Box - More compact for mobile */}
          <div className='bg-status-warning-background border border-status-warning-border rounded-lg p-3 sm:p-4 mb-3 sm:mb-4 max-w-md mx-auto w-full'>
            <div className='text-left'>
              <div className='text-sm text-status-warning-text mb-3 leading-relaxed'>
                <Trans>{errorMessage || t('fallback.message')}</Trans>
              </div>
              <Button
                asChild
                size='sm'
                className='w-full bg-status-warning hover:bg-status-warning text-white border-status-warning-border hover:border-status-warning-border text-sm'
              >
                <Link to={`${basePath}support`}>
                  <Heart className='h-4 w-4 mr-2' />
                  {t('fallback.support')}
                </Link>
              </Button>
            </div>
          </div>

          {/* Action buttons - Horizontal layout on larger screens, vertical on small */}
          <div className='flex flex-col sm:flex-row gap-2 sm:gap-3 justify-center mb-3 sm:mb-4 md:mb-6 w-full max-w-sm px-2'>
            <Button
              onClick={onRetry}
              variant='outline'
              size='sm'
              className='flex-1 text-sm'
            >
              <RefreshCw className='h-4 w-4 mr-2' />
              {t('fallback.retryMap')}
            </Button>
            {!isMobile && (
              <Button
                onClick={handleGetLocation}
                variant='outline'
                size='sm'
                className='flex-1 text-sm'
              >
                <Navigation className='h-4 w-4 mr-2' />
                {t('fallback.getLocation')}
              </Button>
            )}
          </div>

          {/* Current location info - Hidden on mobile */}
          {!isMobile && (
            <div className='bg-white/50 rounded-lg p-3 sm:p-4 mb-3 sm:mb-4 max-w-sm w-full'>
              <h3 className='text-sm font-medium text-foreground mb-1 sm:mb-2'>
                {t('fallback.currentLocation')}
              </h3>
              <p className='text-xs text-muted-foreground'>
                {t('fallback.coordinates', {
                  lat: center[1].toFixed(4),
                  lng: center[0].toFixed(4),
                })}
              </p>
            </div>
          )}

          {/* Foraging spots info - Only show if there are spots */}
          {foragingSpots.length > 0 && (
            <div className='bg-secondary border border-secondary rounded-lg p-3 sm:p-4 mb-3 sm:mb-4 max-w-sm w-full'>
              <div className='flex items-center gap-2 mb-1 sm:mb-2'>
                <MapPin className='h-4 w-4 text-primary-text' />
                <h3 className='text-sm font-medium text-primary-text'>
                  {t('fallback.spotsFound')}
                </h3>
              </div>
              <p className='text-xs text-primary-text'>
                {t('spotsFound', { count: foragingSpots.length })}
              </p>
            </div>
          )}

          {/* Helpful tips - Hidden on mobile */}
          {!isMobile && (
            <div className='mt-4 sm:mt-6 bg-muted border border-border rounded-lg p-3 sm:p-4 max-w-sm w-full'>
              <div className='flex items-start gap-2'>
                <Info className='h-4 w-4 text-primary-text mt-0.5 flex-shrink-0' />
                <div className='text-left'>
                  <h3 className='text-sm font-medium text-primary-text mb-1'>
                    {t('fallback.tips.title')}
                  </h3>
                  <ul className='text-xs text-primary-text space-y-0.5 sm:space-y-1'>
                    <li>• {t('fallback.tips.checkConnection')}</li>
                    <li>• {t('fallback.tips.refreshPage')}</li>
                    <li>• {t('fallback.tips.tryLater')}</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};

export default MapFallback;
