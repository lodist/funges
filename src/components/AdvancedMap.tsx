import React, {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { protocol } from '@/lib/pmtiles-protocol';
import {
  deactivateOfflineSources,
  hydrateOfflineSources,
} from '@/lib/offlineCache';
import {
  useMapStore,
  REGION_BBOX,
  resolveDataNerdRegion,
} from '@/store/mapStore';
import { useOfflineStore } from '@/store/offlineStore';
import {
  containsCoordinate,
  packageHasBasemap,
  type OfflineContinent,
} from '@/lib/offline-packages';
import { usePWA } from '@/hooks/use-pwa';
import { FORECAST_DAYS, interpolateScores } from '@/lib/forecast';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ChefHat,
  Loader2,
  MapPin,
  Navigation,
  Info,
  ScanSearch,
  WifiOff,
} from '@/lib/icons';
import { useTranslation } from 'react-i18next';

import { categoryColor } from '@/lib/categoryColor';
import { useUIStore } from '@/store/uiStore';
import SpeciesSelector from './SpeciesSelector';
import MapThemeSelector from './MapThemeSelector';
import { useIsMobile } from '@/hooks/use-mobile';
import FeatureInfoModal from './FeatureInfoModal';
import MapFallback from './MapFallback';
import LoadingSquirrel from '@/assets/images/loading_squirrel.gif';
import MapInfoCard from '@/components/MapInfoCard';
import RouteToDishPanel from '@/components/RouteToDishPanel';
import ForecastSlider from '@/components/ForecastSlider';
import { useRecipesData } from '@/data/recipes';
import {
  queryRouteDishData,
  type RouteDishPlan,
  type RouteDishResult,
} from '@/lib/route-to-dish';

// Register the pmtiles:// protocol so MapLibre can read PMTiles overlays from
// R2 (or, for a downloaded region, from the offline-cached instance already
// added to this same `protocol` singleton — see pmtiles-protocol.ts).
maplibregl.addProtocol('pmtiles', protocol.tile);

const CONTINENT_BBOX = {
  eu: REGION_BBOX.ne,
  us: REGION_BBOX.use,
};
const CONTINENTS: OfflineContinent[] = ['eu', 'us'];

const ROUTE_SOURCE_ID = 'route-to-dish-line';
const ROUTE_LAYER_ID = 'route-to-dish-line-layer';
const MIN_SCORE_DEFAULT = 5.5;
const DEFAULT_RADIUS_KM = 30;
const ROUTE_SEGMENT_ANIMATION_MS = 750;
const ROUTE_SEGMENT_PAUSE_MS = 250;
const ROUTE_START_MARKER_DELAY_MS = 150;
const ROUTE_PANEL_REAPPEAR_DELAY_MS = 500;
const ROUTE_DISH_MOVEMENT_DEBOUNCE_MS = 500;

function formatLatLngForUrl(coordinate: [number, number]): string {
  return `${coordinate[1]},${coordinate[0]}`;
}

function getGoogleMapsDirectionsUrl(activeRoute: ActiveRouteState): string {
  const coordinates = activeRoute.plan.orderedStops.map(
    stop => stop.coordinate
  );
  if (coordinates.length === 0) {
    return `https://www.google.com/maps/dir/?api=1&origin=${formatLatLngForUrl(activeRoute.start)}&destination=${formatLatLngForUrl(activeRoute.start)}&travelmode=walking`;
  }

  const destination = coordinates[coordinates.length - 1];
  const waypoints = coordinates.slice(0, -1);
  const params = new URLSearchParams({
    api: '1',
    origin: formatLatLngForUrl(activeRoute.start),
    destination: formatLatLngForUrl(destination),
    travelmode: 'walking',
  });

  if (waypoints.length > 0) {
    params.set(
      'waypoints',
      waypoints.map(coordinate => formatLatLngForUrl(coordinate)).join('|')
    );
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

interface MapProps {
  className?: string;
}

interface ActiveRouteState {
  plan: RouteDishPlan;
  start: [number, number];
}

function closeRoutePanel(
  setIsRoutePanelOpen: React.Dispatch<React.SetStateAction<boolean>>,
  setActiveRoute: React.Dispatch<React.SetStateAction<ActiveRouteState | null>>
) {
  setIsRoutePanelOpen(false);
  setActiveRoute(null);
}

// Lazily loaded: this panel's module graph reaches the ONNX worker, and the
// map must not pay for that on first paint.
const IdentifyPanel = lazy(() =>
  import('@/components/IdentifyPanel').then(m => ({ default: m.IdentifyPanel }))
);

const AdvancedMap: React.FC<MapProps> = ({ className = '' }) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const geolocateControl = useRef<maplibregl.GeolocateControl | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [selectedFeature, setSelectedFeature] =
    useState<maplibregl.GeoJSONFeature | null>(null);
  const [isFeatureModalOpen, setIsFeatureModalOpen] = useState(false);
  const [isModalFromLocateMe, setIsModalFromLocateMe] = useState(false);
  const [routeDishResult, setRouteDishResult] =
    useState<RouteDishResult | null>(null);
  const [routeDishError, setRouteDishError] = useState<string | null>(null);
  const [isRouteDishLoading, setIsRouteDishLoading] = useState(false);
  const [activeRoute, setActiveRoute] = useState<ActiveRouteState | null>(null);
  const [isRoutePanelOpen, setIsRoutePanelOpen] = useState(false);
  const [isRouteAnimating, setIsRouteAnimating] = useState(false);
  const [animatedRouteCoordinates, setAnimatedRouteCoordinates] = useState<
    [number, number][]
  >([]);
  const [showAnimatedRouteStart, setShowAnimatedRouteStart] = useState(false);
  const [visibleAnimatedStopCount, setVisibleAnimatedStopCount] = useState(0);
  const isMobile = useIsMobile();
  const recipes = useRecipesData();
  const routeInputsRef = useRef<{
    routeRecipes: Array<{
      id: string;
      title: string;
      species: string[];
    }>;
    routeStart: [number, number];
  } | null>(null);
  const routeDishDebounceTimeoutRef = useRef<number | null>(null);
  // Guards the nearby-feature probe (in the GeolocateControl setup effect
  // below) so it only runs once per trigger, not on every 'geolocate' update
  // while trackUserLocation keeps watching.
  const hasCheckedNearbyFeatures = useRef(false);
  const selectedSpeciesRef = useRef<string | null>(null);

  const { t } = useTranslation('map');
  const { t: tRecipes } = useTranslation('recipes');
  const { t: tIdentify } = useTranslation('identify');
  const [isIdentifyOpen, setIsIdentifyOpen] = useState(false);
  const { setActiveModal } = useUIStore();
  const {
    center,
    zoom,
    mapStyle,
    userLocation,
    showUserLocation,
    isLoading,
    darkLayersVisible,
    numbersLayersVisible,
    setCenter,
    setZoom,
    setUserLocation,
    setIsLoading,
    setError,
    setUserLocationError,
    setShowUserLocation,
    foragingSpots,
    setMapRef,
    updateVisibleLayers,
    restoreDarkLayersState,
    selectedSpecies,
    activeDay,
  } = useMapStore();
  const { isOnline } = usePWA();
  const { cached: cachedPackages, activateForCoordinate } = useOfflineStore();
  const cachedPackageList = useMemo(
    () => Object.values(cachedPackages),
    [cachedPackages]
  );
  const hasOfflinePackageAtCenter = cachedPackageList.some(
    item =>
      !item.expired && containsCoordinate(item.definition, center[0], center[1])
  );
  const hasOfflineBasemapAtCenter = cachedPackageList.some(
    item =>
      !item.expired &&
      packageHasBasemap(item.definition) &&
      containsCoordinate(item.definition, center[0], center[1])
  );
  const routeStart = showUserLocation && userLocation ? userLocation : center;
  const routeRecipes = recipes.map(recipe => ({
    id: recipe.id,
    title: recipe.title,
    species: recipe.species,
  }));
  const selectedRouteRecipeId = activeRoute?.plan.recipeId ?? null;
  const openActiveRouteInGoogleMaps = useCallback(() => {
    if (!activeRoute) return;
    window.open(getGoogleMapsDirectionsUrl(activeRoute), '_blank');
  }, [activeRoute]);

  useEffect(() => {
    if (isOnline) return;
    setIsIdentifyOpen(false);
    closeRoutePanel(setIsRoutePanelOpen, setActiveRoute);
  }, [isOnline]);

  useEffect(() => {
    const syncMapSources = async () => {
      if (isOnline) {
        await deactivateOfflineSources();
      } else {
        await hydrateOfflineSources();
        await activateForCoordinate(center[0], center[1]);
      }
      map.current?.triggerRepaint();
    };
    void syncMapSources().catch(error => {
      console.warn(
        'Unable to switch map sources for connectivity change:',
        error
      );
    });
    // Center is sampled when connectivity changes; map movement should not
    // repeatedly reopen large files from device storage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, activateForCoordinate]);

  useEffect(() => {
    routeInputsRef.current = {
      routeRecipes,
      routeStart,
    };
  }, [routeRecipes, routeStart]);

  useEffect(() => {
    selectedSpeciesRef.current = selectedSpecies;
  }, [selectedSpecies]);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    try {
      map.current = new maplibregl.Map({
        container: mapContainer.current,
        style: mapStyle,
        center: center,
        zoom: zoom,
        // Basemap tiles are baked to z12 natively; MapLibre overzooms past that
        // (reuses/upscales the z12 tile) so labels/roads keep rendering using the
        // interpolation stops already authored up to z20-22 in the style files.
        maxZoom: 20,
        minZoom: 3.01,
        collectResourceTiming: false,
        touchZoomRotate: true,
        trackResize: !isMobile, // Disable automatic resize only on mobile
        // Cap render resolution on mobile: the translucent fill layers are fill-rate
        // bound, and phones run at DPR 2-3. 1.5 cuts pixels ~2-4x with no visible loss
        // on flat-color polygons. Desktop keeps full sharpness.
        ...(isMobile
          ? { pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5) }
          : {}),
        attributionControl: false,
        localIdeographFontFamily: 'sans-serif',
      });

      // Disable rotation
      map.current.touchZoomRotate.disableRotation();

      // Navigation controls removed - zoom functionality handled by touch/scroll gestures

      // Locate-me: MapLibre's standard GeolocateControl (dot + accuracy
      // circle, live tracking). Its native corner button is hidden via CSS
      // (see globals.scss) - the app's own button drives it through
      // handleGetUserLocation -> trigger() instead. Added/removed here, in
      // step with the map instance itself (map.current.remove() below tears
      // this control down too), so there's no separate effect that could
      // try to remove it a second time after the map already has.
      const geolocate = new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
        showUserLocation: true,
        showAccuracyCircle: true,
      });
      geolocateControl.current = geolocate;

      geolocate.on('geolocate', (position: GeolocationPosition) => {
        const coords: [number, number] = [
          position.coords.longitude,
          position.coords.latitude,
        ];
        setUserLocation(coords);
        setShowUserLocation(true);
        setIsLoading(false);

        // Only probe for nearby foraging features on the first fix after a
        // trigger - trackUserLocation keeps firing 'geolocate' as the device
        // moves, and re-opening the modal on every update would be spammy.
        if (hasCheckedNearbyFeatures.current || !map.current) return;
        hasCheckedNearbyFeatures.current = true;

        const currentMap = map.current;
        const selectedSpecies = selectedSpeciesRef.current;
        const layers =
          currentMap
            .getStyle()
            ?.layers?.map(l => l.id)
            .filter(
              id =>
                (selectedSpecies
                  ? id.startsWith(selectedSpecies)
                  : id.includes('_score')) &&
                currentMap.getLayoutProperty(id, 'visibility') === 'visible'
            ) || [];

        // Query features in the current viewport to see if any are near the user's location
        const viewportFeatures = currentMap.queryRenderedFeatures({
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

        if (nearbyFeatures.length > 0) {
          // Found features near user location, open modal
          setSelectedFeature(nearbyFeatures[0]);
          setIsModalFromLocateMe(true);
          setIsFeatureModalOpen(true);
        } else {
          // No features found, just log a warning
          console.warn('No foraging data available at user location:', coords);
        }
      });

      geolocate.on('trackuserlocationstart', () => {
        hasCheckedNearbyFeatures.current = false;
        setIsLoading(true);
        setError(null);
        setUserLocationError(null);
      });

      geolocate.on('trackuserlocationend', () => {
        setIsLoading(false);
        setShowUserLocation(false);
        setActiveRoute(null);
      });

      geolocate.on('error', (error: GeolocationPositionError) => {
        console.error('Error getting user location:', error);
        setIsLoading(false);
        setError(t('geolocation.permissionError'));
        setUserLocationError(error.message);
      });

      map.current.addControl(geolocate);

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

        // A style switch tears down and recreates the whole map (and, with
        // it, the GeolocateControl above) - if the user had their location
        // active, the new control starts back at OFF and won't show the dot
        // on its own. Re-trigger it here so tracking resumes automatically
        // instead of the indicator silently vanishing while the button
        // still shows "active". Checking userLocation too (not just the
        // showUserLocation flag, which defaults to true from first mount)
        // so this never fires as an unsolicited geolocation prompt before
        // the user has ever pressed the button themselves.
        if (showUserLocation && userLocation) {
          geolocate.trigger();
        }
      });

      // The 'error' event fires for RECOVERABLE problems: a single tile failing, a
      // transient cache/service-worker hiccup on a range request (ERR_CACHE_OPERATION_
      // _NOT_SUPPORTED), a not-yet-built forecast tileset, etc. None of these should
      // ever blank the working map — log and carry on. Genuine "cannot create the map"
      // failures (e.g. WebGL unsupported) throw from the constructor and are handled by
      // the try/catch below, which is the only path that shows the fallback screen.
      map.current.on('error', e => {
        const sourceId = (e as unknown as { sourceId?: string }).sourceId;
        console.warn('MapLibre error (non-fatal):', sourceId ?? '', e);
      });

      // Handle map move
      map.current.on('move', () => {
        if (map.current) {
          const center = map.current.getCenter();
          setCenter([center.lng, center.lat]);
          setZoom(map.current.getZoom());
        }
      });

      // Re-evaluate which region tilesets are in view once movement settles, so
      // off-screen regions stop loading tiles (keeps only the visible region live).
      map.current.on('moveend', () => {
        updateVisibleLayers();
      });
    } catch (error) {
      console.error('Error initializing map:', error);
      setMapError(t('error.initFailed'));
    }

    return () => {
      if (map.current) {
        // map.remove() already tears down every registered control
        // (including geolocate.onRemove()) - don't call removeControl()
        // separately, it would run onRemove() a second time on an already
        // torn-down control and throw.
        map.current.remove();
        map.current = null;
      }
      geolocateControl.current = null;
      // The new map instance starts unloaded. Resetting this makes mapLoaded go
      // false->true when the new map fires 'load', which re-runs every
      // [mapLoaded]-gated effect (route source/layer, offline sources, markers)
      // against the NEW instance. Without this, a style swap leaves mapLoaded
      // stuck true, those effects never re-run, and e.g. the route line is never
      // re-added to the new map — drawing a route shows markers but no line.
      setMapLoaded(false);
      setMapRef(null);
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
    if (!isRoutePanelOpen) return;

    const mapInstance = map.current;

    const clearScheduledCompute = () => {
      if (routeDishDebounceTimeoutRef.current !== null) {
        window.clearTimeout(routeDishDebounceTimeoutRef.current);
        routeDishDebounceTimeoutRef.current = null;
      }
    };

    const computeRoutes = () => {
      clearScheduledCompute();

      const routeInputs = routeInputsRef.current;
      if (!routeInputs) return;

      setIsRouteDishLoading(true);
      setRouteDishError(null);

      try {
        const nextResult = queryRouteDishData({
          map: mapInstance,
          recipes: routeInputs.routeRecipes,
          start: routeInputs.routeStart,
          minScore: MIN_SCORE_DEFAULT,
          radiusKm: DEFAULT_RADIUS_KM,
          frac: activeDay > 0 ? activeDay / (FORECAST_DAYS - 1) : 0,
        });

        setRouteDishResult(nextResult);
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

    const scheduleRoutesComputation = () => {
      clearScheduledCompute();
      setIsRouteDishLoading(true);
      routeDishDebounceTimeoutRef.current = window.setTimeout(() => {
        computeRoutes();
      }, ROUTE_DISH_MOVEMENT_DEBOUNCE_MS);
    };

    if (mapInstance.isMoving()) {
      scheduleRoutesComputation();
    } else {
      computeRoutes();
    }

    mapInstance.on('move', scheduleRoutesComputation);

    return () => {
      clearScheduledCompute();
      mapInstance.off('move', scheduleRoutesComputation);
    };
  }, [isRoutePanelOpen, mapLoaded, routeStart, tRecipes, activeDay]);

  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const emptyRoute: GeoJSON.FeatureCollection<GeoJSON.Geometry> = {
      type: 'FeatureCollection',
      features: [],
    };
    const existingSource = map.current.getSource(ROUTE_SOURCE_ID) as
      | maplibregl.GeoJSONSource
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
          'line-color': '#800020',
          'line-width': 4,
          'line-opacity': 0.9,
        },
      });
    }
  }, [mapLoaded]);

  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const source = map.current.getSource(ROUTE_SOURCE_ID) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (!source) return;

    source.setData({
      type: 'FeatureCollection',
      features:
        animatedRouteCoordinates.length >= 2
          ? [
              {
                type: 'Feature',
                geometry: {
                  type: 'LineString',
                  coordinates: animatedRouteCoordinates,
                },
                properties: {},
              },
            ]
          : [],
    });
  }, [animatedRouteCoordinates, mapLoaded]);

  useEffect(() => {
    if (!activeRoute) {
      setIsRouteAnimating(false);
      setAnimatedRouteCoordinates([]);
      setShowAnimatedRouteStart(false);
      setVisibleAnimatedStopCount(0);
      return;
    }

    const routeCoordinates = [
      activeRoute.start,
      ...activeRoute.plan.orderedStops.map(stop => stop.coordinate),
    ];

    let cancelled = false;
    let frameId: number | null = null;
    const timeoutIds: number[] = [];

    const cleanupAnimation = () => {
      cancelled = true;
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      timeoutIds.forEach(timeoutId => window.clearTimeout(timeoutId));
    };

    const animateSegment = (segmentIndex: number) => {
      if (cancelled) return;

      if (segmentIndex >= routeCoordinates.length - 1) {
        timeoutIds.push(
          window.setTimeout(() => {
            if (!cancelled) {
              setIsRouteAnimating(false);
            }
          }, ROUTE_PANEL_REAPPEAR_DELAY_MS)
        );
        return;
      }

      const from = routeCoordinates[segmentIndex];
      const to = routeCoordinates[segmentIndex + 1];
      const completedCoordinates = routeCoordinates.slice(0, segmentIndex + 1);
      let startedAt: number | null = null;

      const step = (timestamp: number) => {
        if (cancelled) return;

        if (startedAt === null) {
          startedAt = timestamp;
        }

        const progress = Math.min(
          (timestamp - startedAt) / ROUTE_SEGMENT_ANIMATION_MS,
          1
        );
        const interpolatedCoordinate: [number, number] = [
          from[0] + (to[0] - from[0]) * progress,
          from[1] + (to[1] - from[1]) * progress,
        ];

        setAnimatedRouteCoordinates([
          ...completedCoordinates,
          interpolatedCoordinate,
        ]);

        if (progress < 1) {
          frameId = window.requestAnimationFrame(step);
          return;
        }

        setAnimatedRouteCoordinates(
          routeCoordinates.slice(0, segmentIndex + 2)
        );
        setVisibleAnimatedStopCount(segmentIndex + 1);

        timeoutIds.push(
          window.setTimeout(() => {
            animateSegment(segmentIndex + 1);
          }, ROUTE_SEGMENT_PAUSE_MS)
        );
      };

      frameId = window.requestAnimationFrame(step);
    };

    setAnimatedRouteCoordinates([]);
    setShowAnimatedRouteStart(false);
    setVisibleAnimatedStopCount(0);
    setIsRouteAnimating(true);

    timeoutIds.push(
      window.setTimeout(() => {
        if (cancelled) return;

        setShowAnimatedRouteStart(true);
        setAnimatedRouteCoordinates([routeCoordinates[0]]);
        animateSegment(0);
      }, ROUTE_START_MARKER_DELAY_MS)
    );

    return cleanupAnimation;
  }, [activeRoute]);

  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const routeMarkers: maplibregl.Marker[] = [];

    if (activeRoute && showAnimatedRouteStart) {
      const startElement = document.createElement('div');
      startElement.className = 'route-to-dish-start-marker';
      startElement.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:9999px;background:#800020;color:#fff7e6;border:3px solid #e8d7a5;box-shadow:0 4px 10px rgba(128,0,32,0.28);">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 11l18-8-8 18-2-8-8-2z"></path>
          </svg>
        </div>
      `;

      routeMarkers.push(
        new maplibregl.Marker({ element: startElement })
          .setLngLat(activeRoute.start)
          .addTo(map.current)
      );

      activeRoute.plan.orderedStops
        .slice(0, visibleAnimatedStopCount)
        .forEach((stop, index) => {
          const markerElement = document.createElement('div');
          markerElement.className = 'route-to-dish-stop-marker';
          markerElement.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;transform:translateY(-6px);">
              <div style="display:flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:9999px;background:#b38a3c;color:#fff9eb;font-weight:700;border:3px solid #800020;box-shadow:0 4px 10px rgba(128,0,32,0.18);">${index + 1}</div>
            </div>
          `;

          routeMarkers.push(
            new maplibregl.Marker({ element: markerElement })
              .setLngLat(stop.coordinate)
              .addTo(map.current!)
          );
        });
    }

    return () => {
      routeMarkers.forEach(marker => marker.remove());
    };
  }, [
    activeRoute,
    mapLoaded,
    showAnimatedRouteStart,
    visibleAnimatedStopCount,
  ]);

  // Show feature info on click
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    const handleClick = (e: maplibregl.MapMouseEvent) => {
      // One fill layer per species is visible for the selected species on every day;
      // its feature carries the endpoints we interpolate below for forecast days.
      const layers =
        map.current
          ?.getStyle()
          ?.layers?.map(l => l.id)
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
        const f = features[0];
        // Each feature carries both endpoints (`_score` = d0/today, `_score_d6` = day 6).
        // Always fold them to the active day's value (frac 0 on day 0 == today exactly) so
        // the modal shows day-appropriate scores and never the raw `_score_d6` keys.
        const feature = {
          ...f,
          geometry: f.geometry, // getter on MapGeoJSONFeature; spread drops it
          properties: interpolateScores(
            f.properties || {},
            activeDay / (FORECAST_DAYS - 1)
          ),
        } as typeof f;
        setSelectedFeature(feature);
        setIsModalFromLocateMe(false);
        setIsFeatureModalOpen(true);
      }
    };
    map.current.on('click', handleClick);
    return () => {
      map.current?.off('click', handleClick);
    };
  }, [mapLoaded, selectedSpecies, activeDay]);

  // Locate-me button: delegates to the standard MapLibre GeolocateControl
  // (set up in the "Initialize map" effect above) instead of a hand-rolled
  // geolocation flow. trigger() mirrors clicking the control's own button —
  // its internal state machine handles starting tracking when off and
  // stopping it when active, so no on/off branching is needed here.
  const handleGetUserLocation = () => {
    geolocateControl.current?.trigger();
  };

  // Add foraging spot markers
  useEffect(() => {
    if (!map.current || !mapLoaded || !foragingSpots.length) return;

    // Remove existing foraging spot markers
    const existingMarkers = document.querySelectorAll('.foraging-spot-marker');
    existingMarkers.forEach(marker => marker.remove());

    // Create markers for each foraging spot
    const markers: maplibregl.Marker[] = [];

    foragingSpots.forEach(spot => {
      // Was a red / emerald / violet / amber quartet - a four-hue semantic
      // palette the system rejects, and a second contradictory colouring
      // of the same categories DataPage already coloured differently.
      // maplibre writes this into an SVG fill attribute, so it needs the
      // resolved value rather than a var().
      const markerColor = categoryColor(spot.type);

      const marker = new maplibregl.Marker({
        color: markerColor,
        className: 'foraging-spot-marker',
      })
        .setLngLat(spot.coordinates)
        .addTo(map.current!);

      // Add popup with spot information
      const popup = new maplibregl.Popup({ offset: 25 }).setHTML(`
        <div class="p-3 max-w-xs">
          <h3 class="font-semibold text-lg mb-2">${spot.name}</h3>
          <p class="text-sm text-muted-foreground mb-2">${spot.description}</p>
          <div class="flex items-center gap-2 mb-2">
            <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
              spot.type === 'mushroom'
                ? 'bg-destructive/10 text-destructive-text'
                : spot.type === 'berry'
                  ? 'bg-secondary text-primary-text'
                  : spot.type === 'herb'
                    ? 'bg-muted text-primary-text'
                    : 'bg-status-warning-background text-status-warning-text'
            }">
              ${spot.type}
            </span>
            <span class="text-xs text-muted-foreground">
              Confidence: ${(spot.confidence * 100).toFixed(0)}%
            </span>
          </div>
          <div class="text-xs text-muted-foreground">
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

  // Offline fallback: the real basemap tiles are NetworkOnly (PMTiles range
  // requests can't be cached), so when offline, show a static snapshot behind
  // the (locally-cached) overlay/forecast vector layers for any downloaded
  // continent. Georeferenced as an `image` source, so it pans/zooms with the
  // map like any other layer within its own bbox.
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    const mapInstance = map.current;
    const firstLayerId = mapInstance.getStyle()?.layers?.[0]?.id;

    CONTINENTS.forEach(continent => {
      const sourceId = `offline-basemap-${continent}`;
      const layerId = `${sourceId}-layer`;
      const hasContinentPackage = cachedPackageList.some(
        item => !item.expired && item.definition.continent === continent
      );
      const shouldShow =
        !isOnline && !hasOfflineBasemapAtCenter && hasContinentPackage;
      const exists = Boolean(mapInstance.getSource(sourceId));

      if (shouldShow && !exists) {
        const [west, south, east, north] = CONTINENT_BBOX[continent];
        mapInstance.addSource(sourceId, {
          type: 'image',
          url: `${import.meta.env.BASE_URL}offline-snapshots/${continent}.png`,
          coordinates: [
            [west, north],
            [east, north],
            [east, south],
            [west, south],
          ],
        });
        mapInstance.addLayer(
          { id: layerId, type: 'raster', source: sourceId },
          firstLayerId
        );
      } else if (!shouldShow && exists) {
        if (mapInstance.getLayer(layerId)) mapInstance.removeLayer(layerId);
        mapInstance.removeSource(sourceId);
      }
    });
  }, [mapLoaded, isOnline, cachedPackageList, hasOfflineBasemapAtCenter]);

  if (mapError) {
    return (
      <MapFallback error={mapError} onRetry={() => window.location.reload()} />
    );
  }

  const selectedFeatureLayerId = (
    selectedFeature as maplibregl.MapGeoJSONFeature | null
  )?.layer?.id;
  const dataNerdRegion = selectedFeatureLayerId
    ? resolveDataNerdRegion(selectedFeatureLayerId)
    : null;

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
                className='h-[13.4rem] w-[13.4rem]'
              />
            </div>
          </div>
        )}

        {/* Offline notice. The map still initializes offline — the style JSON is
            precached — so it renders as empty background with no error and
            nothing tells the user why. mapError never fires for this.
            Hide it only when a detailed basemap package covers the viewport. */}
        {!isOnline && !hasOfflinePackageAtCenter && (
          <div className='absolute inset-0 z-30 flex items-center justify-center p-6 pointer-events-none'>
            <div className='max-w-xs rounded-lg border bg-background/95 p-4 text-center shadow-lg'>
              <WifiOff className='mx-auto mb-2 h-6 w-6 text-muted-foreground' />
              <h3 className='mb-1 text-sm font-semibold'>
                {t('offline.title')}
              </h3>
              <p className='text-xs text-muted-foreground'>
                {t('offline.noPackageMessage')}
              </p>
            </div>
          </div>
        )}

        {mapLoaded &&
          !isOnline &&
          hasOfflinePackageAtCenter &&
          !hasOfflineBasemapAtCenter && (
            <div className='pointer-events-none absolute left-1/2 top-14 z-20 w-max max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-md border bg-background/90 px-3 py-2 text-center text-xs text-muted-foreground shadow-sm'>
              {t('offline.forecastOnlyMessage')}
            </div>
          )}

        {/* Species selector - top left corner */}
        <div className='absolute top-2 left-2 z-20'>
          <SpeciesSelector className='w-auto' />
        </div>

        {/* Control buttons */}
        <div className='absolute top-2 right-4 z-10 flex flex-col gap-2'>
          {/* User location button */}
          <Button
            variant='outline'
            size='icon'
            onClick={handleGetUserLocation}
            disabled={isLoading}
            className={
              showUserLocation && userLocation
                ? 'bg-muted text-primary-text hover:bg-muted hover:text-foreground'
                : undefined
            }
            title={t('getLocation')}
          >
            {isLoading ? (
              <Loader2 className='h-4 w-4 animate-spin' />
            ) : (
              <Navigation className='h-4 w-4' />
            )}
          </Button>

          {/* Map theme selector (Light/Dark/White/Dark Matter/Topographic) */}
          <MapThemeSelector />

          {isOnline && (
            <Button
              variant='outline'
              size='icon'
              onClick={() => {
                if (isRoutePanelOpen) {
                  closeRoutePanel(setIsRoutePanelOpen, setActiveRoute);
                  return;
                }

                setIsRoutePanelOpen(true);
              }}
              className={
                isRoutePanelOpen
                  ? 'bg-secondary text-primary-text hover:bg-secondary hover:text-foreground'
                  : undefined
              }
              title={tRecipes('routePanel.title')}
              aria-label={tRecipes('routePanel.title')}
            >
              <ChefHat className='h-4 w-4' />
            </Button>
          )}

          {isOnline && (
            <Button
              variant='outline'
              size='icon'
              onClick={() => setIsIdentifyOpen(true)}
              title={tIdentify('openButton')}
              aria-label={tIdentify('openButton')}
            >
              <ScanSearch className='h-4 w-4' />
            </Button>
          )}

          {/* Info button */}
          <Button
            variant='outline'
            size='icon'
            onClick={() => setActiveModal('onboarding')}
            title={t('showOnboarding')}
          >
            <Info className='h-4 w-4' />
          </Button>
        </div>

        {isMobile ? (
          <>
            <div className='fixed left-4 right-4 bottom-24 z-10 flex flex-col gap-2'>
              <ForecastSlider />
              <MapInfoCard />
            </div>
            {/* Recedes while the route draws instead of unmounting: the
                conditional render this replaced tore the card out of the DOM
                the instant onDrawRoute fired and put it back seconds later
                with no transition, which reads as the card closing itself. */}
            {isRoutePanelOpen ? (
              <div
                className={`fixed left-3 right-3 top-20 z-10 transition-opacity duration-base ease-standard ${isRouteAnimating ? 'pointer-events-none opacity-0' : ''}`}
              >
                <RouteToDishPanel
                  className='mx-auto'
                  plans={routeDishResult?.plans ?? []}
                  error={routeDishError}
                  isLoading={isRouteDishLoading}
                  selectedRecipeId={selectedRouteRecipeId}
                  onDrawRoute={plan =>
                    setActiveRoute({
                      plan,
                      start: routeStart,
                    })
                  }
                  onClearRoute={() => setActiveRoute(null)}
                  onClose={() =>
                    closeRoutePanel(setIsRoutePanelOpen, setActiveRoute)
                  }
                  onOpenInGoogleMaps={openActiveRouteInGoogleMaps}
                />
              </div>
            ) : null}
          </>
        ) : (
          <>
            <div className='absolute bottom-2 left-2 z-10 flex flex-col gap-2 md:w-96'>
              <ForecastSlider />
              <MapInfoCard />
            </div>
            {isRoutePanelOpen ? (
              <div
                className={`absolute top-14 right-16 z-10 transition-opacity duration-base ease-standard ${isRouteAnimating ? 'pointer-events-none opacity-0' : ''}`}
              >
                <RouteToDishPanel
                  plans={routeDishResult?.plans ?? []}
                  error={routeDishError}
                  isLoading={isRouteDishLoading}
                  selectedRecipeId={selectedRouteRecipeId}
                  onDrawRoute={plan =>
                    setActiveRoute({
                      plan,
                      start: routeStart,
                    })
                  }
                  onClearRoute={() => setActiveRoute(null)}
                  onClose={() =>
                    closeRoutePanel(setIsRoutePanelOpen, setActiveRoute)
                  }
                  onOpenInGoogleMaps={openActiveRouteInGoogleMaps}
                />
              </div>
            ) : null}
          </>
        )}

        {/* Foraging spots found notification */}
        {foragingSpots.length > 0 && (
          <div className='absolute bottom-4 left-4 right-4'>
            <Card padding='compact' className='bg-secondary'>
              <div className='flex items-center gap-2'>
                <MapPin className='h-4 w-4 text-primary-text' />
                <p className='text-sm text-primary-text'>
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
        hideDirections={isModalFromLocateMe || !isOnline}
        dataNerdRegion={isOnline ? dataNerdRegion : null}
      />

      {/* Mounted only once opened, so the ONNX chunk is never fetched by a user
          who does not use identification. */}
      {isIdentifyOpen && (
        <Suspense fallback={null}>
          <IdentifyPanel
            open={isIdentifyOpen}
            onClose={() => setIsIdentifyOpen(false)}
          />
        </Suspense>
      )}
    </>
  );
};

export default AdvancedMap;
