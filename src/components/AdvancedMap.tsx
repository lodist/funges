import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useMapStore } from '@/store/mapStore';
import { Card } from '@/components/ui/card';
import { Loader2, MapPin, Navigation, Moon, Hash, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '@/store/uiStore';
import SpeciesSelector from './SpeciesSelector';
import { useIsMobile } from '@/hooks/use-mobile';
import FeatureInfoModal from './FeatureInfoModal';
import MapFallback from './MapFallback';
import LoadingSquirrel from '@/assets/images/loading_squirrel.gif';
import { motion } from 'framer-motion';

// Set Mapbox access token
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || '';

interface MapProps {
  className?: string;
}

const AdvancedMap: React.FC<MapProps> = ({ className = '' }) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [selectedFeature, setSelectedFeature] =
    useState<mapboxgl.GeoJSONFeature | null>(null);
  const [isFeatureModalOpen, setIsFeatureModalOpen] = useState(false);
  const [isModalFromLocateMe, setIsModalFromLocateMe] = useState(false);
  const isMobile = useIsMobile();

  const { t } = useTranslation('map');
  const { setActiveModal } = useUIStore();
  const {
    center,
    zoom,
    mapStyle,
    userLocation,
    isLoading,
    darkLayersVisible,
    numbersLayersVisible,
    setCenter,
    setZoom,
    getUserLocation,
    setIsLoading,
    setError,
    setUserLocationError,
    foragingSpots,
    toggleDarkLayersVisibility,
    toggleNumbersLayersVisibility,
    setMapRef,
    updateVisibleLayers,
    restoreDarkLayersState,
    selectedSpecies,
  } = useMapStore();

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    try {
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: mapStyle,
        center: center,
        zoom: zoom,
        maxZoom: 12,
        minZoom: 5,
        collectResourceTiming: false,
        touchZoomRotate: true,
        trackResize: !isMobile, // Disable automatic resize only on mobile
        attributionControl: false,
        localIdeographFontFamily: 'sans-serif',
        performanceMetricsCollection: false,
      });

      // Disable rotation
      map.current.touchZoomRotate.disableRotation();

      // Navigation controls removed - zoom functionality handled by touch/scroll gestures

      // Handle map load
      map.current.on('load', () => {
        setMapLoaded(true);
        setMapError(null);
        setMapRef(map.current);
        updateVisibleLayers();
        restoreDarkLayersState();

        // Set optimal dimensions based on calculated screen dimensions
        if (map.current) {
          // Force initial resize with correct dimensions
          map.current.resize();
        }
      });

      // Handle map errors
      map.current.on('error', e => {
        console.error('Mapbox error:', e);
        setMapError(t('error.loadFailed'));
      });

      // Handle map move
      map.current.on('move', () => {
        if (map.current) {
          const center = map.current.getCenter();
          setCenter([center.lng, center.lat]);
          setZoom(map.current.getZoom());
        }
      });
    } catch (error) {
      console.error('Error initializing map:', error);
      setMapError(t('error.initFailed'));
    }

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapStyle]);

  // Update map when center or zoom changes
  useEffect(() => {
    if (map.current && mapLoaded) {
      const currentCenter = map.current.getCenter();
      const currentZoom = map.current.getZoom();

      if (currentCenter.lng !== center[0] || currentCenter.lat !== center[1]) {
        map.current.setCenter(center);
      }

      if (currentZoom !== zoom) {
        map.current.setZoom(zoom);
      }
    }
  }, [center, zoom, mapLoaded]);

  // Update visible layers when species or layer visibility changes
  useEffect(() => {
    if (mapLoaded) {
      updateVisibleLayers();
    }
  }, [mapLoaded, updateVisibleLayers]);

  // Update visible layers when species selection changes
  useEffect(() => {
    if (mapLoaded) {
      updateVisibleLayers();
    }
  }, [mapLoaded, updateVisibleLayers, selectedSpecies]);

  // Update visible layers when layer visibility toggles change
  useEffect(() => {
    if (mapLoaded) {
      updateVisibleLayers();
    }
  }, [mapLoaded, updateVisibleLayers, darkLayersVisible, numbersLayersVisible]);

  // Show feature info on click
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    const handleClick = (e: mapboxgl.MapMouseEvent) => {
      const layers =
        map.current
          ?.getStyle()
          .layers?.map(l => l.id)
          .filter(
            id =>
              selectedSpecies &&
              id.startsWith(selectedSpecies) &&
              map.current?.getLayoutProperty(id, 'visibility') === 'visible'
          ) || [];
      const features = map.current?.queryRenderedFeatures(e.point, {
        layers,
      });
      if (features && features.length > 0) {
        setSelectedFeature(features[0]);
        setIsModalFromLocateMe(false);
        setIsFeatureModalOpen(true);
      }
    };
    map.current.on('click', handleClick);
    return () => {
      map.current?.off('click', handleClick);
    };
  }, [mapLoaded, selectedSpecies]);

  // Handle user location
  const handleGetUserLocation = async () => {
    setIsLoading(true);
    setError(null);
    setUserLocationError(null);

    try {
      const position = await getUserLocation();
      const coords: [number, number] = [
        position.coords.longitude,
        position.coords.latitude,
      ];

      if (map.current) {
        map.current.flyTo({
          center: coords,
          zoom: 10,
          duration: 2000,
        });

        // Check if there are features at the user's location
        const layers =
          map.current
            .getStyle()
            .layers?.map(l => l.id)
            .filter(
              id =>
                (selectedSpecies
                  ? id.startsWith(selectedSpecies)
                  : id.includes('_score')) &&
                map.current?.getLayoutProperty(id, 'visibility') === 'visible'
            ) || [];

        // Query features in the current viewport to see if any are near the user's location
        const viewportFeatures = map.current.queryRenderedFeatures({
          layers,
        });

        // Filter features to find those close to the user's location
        const nearbyFeatures = viewportFeatures.filter(feature => {
          if (feature.geometry.type === 'Point') {
            const featureCoords = feature.geometry.coordinates as [
              number,
              number,
            ];
            const distance = Math.sqrt(
              Math.pow(featureCoords[0] - coords[0], 2) +
                Math.pow(featureCoords[1] - coords[1], 2)
            );
            // Consider features within ~1km radius (0.01 degrees is roughly 1km)
            return distance < 0.01;
          }
          return false;
        });

        if (nearbyFeatures && nearbyFeatures.length > 0) {
          // Found features near user location, open modal
          setSelectedFeature(nearbyFeatures[0]);
          setIsModalFromLocateMe(true);
          setIsFeatureModalOpen(true);
        } else {
          // No features found, just log a warning
          console.warn('No foraging data available at user location:', coords);
        }
      }
    } catch (error) {
      console.error('Error getting user location:', error);
      setError(t('geolocation.permissionError'));
    } finally {
      setIsLoading(false);
    }
  };

  // Add user location marker
  useEffect(() => {
    if (!map.current || !mapLoaded || !userLocation) return;

    // Remove existing marker
    const existingMarker = document.querySelector('.user-location-marker');
    if (existingMarker) {
      existingMarker.remove();
    }

    // Create new marker
    const marker = new mapboxgl.Marker({
      color: '#3b82f6',
      className: 'user-location-marker',
    })
      .setLngLat(userLocation)
      .addTo(map.current);

    return () => {
      marker.remove();
    };
  }, [userLocation, mapLoaded]);

  // Add foraging spot markers
  useEffect(() => {
    if (!map.current || !mapLoaded || !foragingSpots.length) return;

    // Remove existing foraging spot markers
    const existingMarkers = document.querySelectorAll('.foraging-spot-marker');
    existingMarkers.forEach(marker => marker.remove());

    // Create markers for each foraging spot
    const markers: mapboxgl.Marker[] = [];

    foragingSpots.forEach(spot => {
      const markerColor =
        spot.type === 'mushroom'
          ? '#dc2626'
          : spot.type === 'berry'
            ? '#059669'
            : spot.type === 'herb'
              ? '#7c3aed'
              : '#f59e0b';

      const marker = new mapboxgl.Marker({
        color: markerColor,
        className: 'foraging-spot-marker',
      })
        .setLngLat(spot.coordinates)
        .addTo(map.current!);

      // Add popup with spot information
      const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(`
        <div class="p-3 max-w-xs">
          <h3 class="font-semibold text-lg mb-2">${spot.name}</h3>
          <p class="text-sm text-gray-600 mb-2">${spot.description}</p>
          <div class="flex items-center gap-2 mb-2">
            <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
              spot.type === 'mushroom'
                ? 'bg-red-100 text-red-800'
                : spot.type === 'berry'
                  ? 'bg-green-100 text-green-800'
                  : spot.type === 'herb'
                    ? 'bg-purple-100 text-purple-800'
                    : 'bg-yellow-100 text-yellow-800'
            }">
              ${spot.type}
            </span>
            <span class="text-xs text-gray-500">
              Confidence: ${(spot.confidence * 100).toFixed(0)}%
            </span>
          </div>
          <div class="text-xs text-gray-500">
            <p>Season: ${spot.season.join(', ')}</p>
            <p>Last updated: ${new Date(spot.lastUpdated).toLocaleDateString()}</p>
          </div>
        </div>
      `);

      marker.setPopup(popup);
      markers.push(marker);
    });

    return () => {
      markers.forEach(marker => marker.remove());
    };
  }, [foragingSpots, mapLoaded]);

  if (mapError) {
    return (
      <MapFallback error={mapError} onRetry={() => window.location.reload()} />
    );
  }

  return (
    <>
      {/* Main container - Fixed dimensions only on mobile for better performance */}
      <div
        className={`relative ${isMobile ? 'h-full' : 'h-[calc(100vh-1rem)] my-2 pr-2'} ${className}`}
        style={
          isMobile
            ? {
                width: window.innerWidth,
                height: window.innerHeight,
                margin: 0,
                padding: 0,
              }
            : undefined
        }
      >
        {/* Map container - Fixed dimensions only on mobile for better performance */}
        <div
          ref={mapContainer}
          className={`${isMobile ? '' : 'rounded-lg overflow-hidden'} ${!isMobile ? 'w-full h-full' : 'overflow-hidden'}`}
          style={
            isMobile
              ? {
                  width: window.innerWidth,
                  height: window.innerHeight,
                }
              : undefined
          }
        />

        {/* Loading overlay */}
        {!mapLoaded && (
          <div className='absolute inset-0 bg-background/80 flex items-center justify-center'>
            <div className='flex flex-col items-center gap-2'>
              <img
                src={LoadingSquirrel}
                alt='Loading...'
                className='h-80 w-80'
              />
            </div>
          </div>
        )}

        {/* Species selector - top left corner */}
        <div className='absolute top-4 left-4 z-20'>
          <SpeciesSelector className='w-auto' />
        </div>

        {/* Control buttons */}
        <div className='absolute top-4 right-4 z-10 flex flex-col gap-2'>
          {/* User location button */}
          <motion.button
            onClick={handleGetUserLocation}
            disabled={isLoading}
            className='inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors disabled:pointer-events-none disabled:opacity-50 border border-input bg-secondary h-9 px-3 shadow-lg'
            title={t('getLocation')}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.95 }}
            transition={{
              duration: 0.2,
              type: 'spring',
              stiffness: 400,
              damping: 25,
            }}
          >
            {isLoading ? (
              <Loader2 className='h-4 w-4 animate-spin' />
            ) : (
              <Navigation className='h-4 w-4' />
            )}
          </motion.button>

          {/* Numbers layers toggle */}
          <motion.button
            onClick={toggleNumbersLayersVisibility}
            className={`inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors disabled:pointer-events-none disabled:opacity-50 border h-9 px-3 shadow-lg ${
              numbersLayersVisible
                ? 'bg-green-100 border-green-300 text-green-800'
                : 'bg-secondary border-input'
            }`}
            title={t('toggleNumbers')}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.95 }}
            transition={{
              duration: 0.2,
              type: 'spring',
              stiffness: 400,
              damping: 25,
            }}
          >
            <Hash className='h-4 w-4' />
          </motion.button>

          {/* Dark mode toggle */}
          <motion.button
            onClick={toggleDarkLayersVisibility}
            className={`inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors disabled:pointer-events-none disabled:opacity-50 border h-9 px-3 shadow-lg ${
              darkLayersVisible
                ? 'bg-gray-100 border-gray-300 text-gray-800'
                : 'bg-secondary border-input'
            }`}
            title={t('toggleDarkMode')}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.95 }}
            transition={{
              duration: 0.2,
              type: 'spring',
              stiffness: 400,
              damping: 25,
            }}
          >
            <Moon className='h-4 w-4' />
          </motion.button>

          {/* Info button */}
          <motion.button
            onClick={() => setActiveModal('onboarding')}
            className='inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors disabled:pointer-events-none disabled:opacity-50 border h-9 px-3 shadow-lg bg-secondary border-input'
            title={t('showOnboarding')}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.95 }}
            transition={{
              duration: 0.2,
              type: 'spring',
              stiffness: 400,
              damping: 25,
            }}
          >
            <Info className='h-4 w-4' />
          </motion.button>
        </div>

        {/* Foraging spots found notification */}
        {foragingSpots.length > 0 && (
          <div className='absolute bottom-4 left-4 right-4'>
            <Card className='p-3 bg-green-50 border-green-200'>
              <div className='flex items-center gap-2'>
                <MapPin className='h-4 w-4 text-green-600' />
                <p className='text-sm text-green-800'>
                  {t('spotsFound', { count: foragingSpots.length })}
                </p>
              </div>
            </Card>
          </div>
        )}
      </div>
      <FeatureInfoModal
        feature={selectedFeature}
        open={isFeatureModalOpen}
        onClose={() => {
          setIsFeatureModalOpen(false);
          setSelectedFeature(null);
          setIsModalFromLocateMe(false);
        }}
        hideDirections={isModalFromLocateMe}
      />
    </>
  );
};

export default AdvancedMap;
