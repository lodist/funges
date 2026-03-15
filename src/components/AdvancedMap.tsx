import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
import MapInfoCard from '@/components/MapInfoCard';
import RouteToDishPanel from '@/components/RouteToDishPanel';
import { useRecipesData } from '@/data/recipes';
import {
  queryRouteDishData,
  type RouteDishPlan,
  type RouteDishResult,
} from '@/lib/route-to-dish';

// Set Mapbox access token
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || '';

const ROUTE_SOURCE_ID = 'route-to-dish-line';
const ROUTE_LAYER_ID = 'route-to-dish-line-layer';
const MIN_SCORE_DEFAULT = 5.5;
const DEFAULT_RADIUS_KM = 25;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

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
  const [routeDishResult, setRouteDishResult] =
    useState<RouteDishResult | null>(null);
  const [routeDishError, setRouteDishError] = useState<string | null>(null);
  const [isRouteDishLoading, setIsRouteDishLoading] = useState(false);
  const [selectedRoutePlan, setSelectedRoutePlan] =
    useState<RouteDishPlan | null>(null);
  const isMobile = useIsMobile();
  const recipes = useRecipesData();

  const { t } = useTranslation('map');
  const { t: tRecipes } = useTranslation('recipes');
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
  const routeStart = userLocation ?? center;
  const routeRecipes = useMemo(
    () =>
      recipes.map(recipe => ({
        id: recipe.id,
        title: recipe.title,
        species: recipe.species,
      })),
    [recipes]
  );
  const getSpeciesLabel = useCallback(
    (speciesId: string) =>
      tRecipes(`species.${speciesId}`, { defaultValue: speciesId }),
    [tRecipes]
  );

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
        minZoom: 3.01,
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

  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const mapInstance = map.current;

    const computeRoutes = () => {
      setIsRouteDishLoading(true);
      setRouteDishError(null);

      try {
        const nextResult = queryRouteDishData({
          map: mapInstance,
          recipes: routeRecipes,
          start: routeStart,
          minScore: MIN_SCORE_DEFAULT,
          radiusKm: DEFAULT_RADIUS_KM,
        });

        setRouteDishResult(nextResult);
        setSelectedRoutePlan(currentPlan => {
          if (!currentPlan) return currentPlan;

          return (
            nextResult.plans.find(
              plan => plan.recipeId === currentPlan.recipeId
            ) ?? null
          );
        });
      } catch (caughtError) {
        setRouteDishError(
          caughtError instanceof Error
            ? caughtError.message
            : 'Unable to compute nearby recipe routes'
        );
      } finally {
        setIsRouteDishLoading(false);
      }
    };

    computeRoutes();
    mapInstance.on('idle', computeRoutes);

    return () => {
      mapInstance.off('idle', computeRoutes);
    };
  }, [mapLoaded, routeRecipes, routeStart]);

  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const emptyRoute: GeoJSON.FeatureCollection<GeoJSON.Geometry> = {
      type: 'FeatureCollection',
      features: [],
    };
    const existingSource = map.current.getSource(ROUTE_SOURCE_ID) as
      | mapboxgl.GeoJSONSource
      | undefined;

    if (!existingSource) {
      map.current.addSource(ROUTE_SOURCE_ID, {
        type: 'geojson',
        data: emptyRoute,
      });
    }

    if (!map.current.getLayer(ROUTE_LAYER_ID)) {
      map.current.addLayer({
        id: ROUTE_LAYER_ID,
        type: 'line',
        source: ROUTE_SOURCE_ID,
        paint: {
          'line-color': '#0f766e',
          'line-width': 4,
          'line-opacity': 0.9,
        },
      });
    }
  }, [mapLoaded]);

  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const source = map.current.getSource(ROUTE_SOURCE_ID) as
      | mapboxgl.GeoJSONSource
      | undefined;
    if (!source) return;

    const coordinates = selectedRoutePlan
      ? [
          routeStart,
          ...selectedRoutePlan.orderedStops.map(stop => stop.coordinate),
        ]
      : [];

    source.setData({
      type: 'FeatureCollection',
      features:
        coordinates.length >= 2
          ? [
              {
                type: 'Feature',
                geometry: {
                  type: 'LineString',
                  coordinates,
                },
                properties: {},
              },
            ]
          : [],
    });

    if (coordinates.length >= 2) {
      const bounds = coordinates.reduce(
        (acc, coordinate) => acc.extend(coordinate),
        new mapboxgl.LngLatBounds(coordinates[0], coordinates[0])
      );

      map.current.fitBounds(bounds, {
        padding: isMobile ? 80 : 120,
        maxZoom: 11,
        duration: 1200,
      });
    }
  }, [isMobile, mapLoaded, routeStart, selectedRoutePlan]);

  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const routeMarkers: mapboxgl.Marker[] = [];

    if (selectedRoutePlan) {
      const startElement = document.createElement('div');
      startElement.className = 'route-to-dish-start-marker';
      startElement.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:9999px;background:#0f766e;color:#fff;font-weight:700;border:3px solid #ccfbf1;box-shadow:0 4px 10px rgba(15,118,110,0.25);">S</div>
      `;

      routeMarkers.push(
        new mapboxgl.Marker({ element: startElement })
          .setLngLat(routeStart)
          .addTo(map.current)
      );

      selectedRoutePlan.orderedStops.forEach((stop, index) => {
        const coveredForPlan = stop.coveredSpecies.filter(speciesId =>
          selectedRoutePlan.requiredSpecies.includes(speciesId)
        );
        const coveredLabel = coveredForPlan
          .map(speciesId => getSpeciesLabel(speciesId))
          .map(label => escapeHtml(label))
          .join(', ');
        const markerElement = document.createElement('div');
        markerElement.className = 'route-to-dish-stop-marker';
        markerElement.innerHTML = `
          <div style="display:flex;flex-direction:column;align-items:center;gap:4px;transform:translateY(-6px);">
            <div style="display:flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:9999px;background:#14532d;color:#fff;font-weight:700;border:3px solid #dcfce7;box-shadow:0 4px 10px rgba(20,83,45,0.25);">${index + 1}</div>
            <div style="max-width:160px;padding:6px 8px;border-radius:10px;background:rgba(255,255,255,0.96);border:1px solid #bbf7d0;color:#166534;font-size:11px;line-height:1.2;text-align:center;box-shadow:0 2px 8px rgba(15,23,42,0.12);">${coveredLabel}</div>
          </div>
        `;

        routeMarkers.push(
          new mapboxgl.Marker({ element: markerElement })
            .setLngLat(stop.coordinate)
            .addTo(map.current!)
        );
      });
    }

    return () => {
      routeMarkers.forEach(marker => marker.remove());
    };
  }, [getSpeciesLabel, mapLoaded, routeStart, selectedRoutePlan]);

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
        <div className='absolute top-2 left-2 z-20'>
          <SpeciesSelector className='w-auto' />
        </div>

        {/* Control buttons */}
        <div className='absolute top-2 right-4 z-10 flex flex-col gap-2'>
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

        {isMobile ? (
          <>
            <div className='fixed left-4 right-4 bottom-24'>
              <MapInfoCard />
            </div>
            <div className='fixed left-4 right-4 top-16 z-10 flex justify-center'>
              <RouteToDishPanel
                plans={routeDishResult?.plans ?? []}
                error={routeDishError}
                isLoading={isRouteDishLoading}
                hasUserLocation={Boolean(userLocation)}
                minScore={MIN_SCORE_DEFAULT}
                radiusKm={DEFAULT_RADIUS_KM}
                selectedRecipeId={selectedRoutePlan?.recipeId ?? null}
                onDrawRoute={setSelectedRoutePlan}
                onClearRoute={() => setSelectedRoutePlan(null)}
              />
            </div>
          </>
        ) : (
          <>
            <div className='absolute bottom-2 left-2 z-10'>
              <MapInfoCard />
            </div>
            <div className='absolute top-2 left-36 z-10'>
              <RouteToDishPanel
                plans={routeDishResult?.plans ?? []}
                error={routeDishError}
                isLoading={isRouteDishLoading}
                hasUserLocation={Boolean(userLocation)}
                minScore={MIN_SCORE_DEFAULT}
                radiusKm={DEFAULT_RADIUS_KM}
                selectedRecipeId={selectedRoutePlan?.recipeId ?? null}
                onDrawRoute={setSelectedRoutePlan}
                onClearRoute={() => setSelectedRoutePlan(null)}
              />
            </div>
          </>
        )}

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
