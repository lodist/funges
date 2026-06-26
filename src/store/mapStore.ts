import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { getSpeciesOptions, type SpeciesOption } from '@/data/species';
import { setDayOnFillColor } from '@/lib/forecast';

export interface MapViewport {
  latitude: number;
  longitude: number;
  zoom: number;
  bearing: number;
  pitch: number;
}

export interface ForagingSpot {
  id: string;
  name: string;
  description: string;
  coordinates: [number, number];
  type: 'mushroom' | 'berry' | 'herb' | 'nut';
  season: string[];
  confidence: number;
  lastUpdated: string;
}

export interface MapState {
  // Map configuration
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
  mapStyle: string;

  // User location
  userLocation: [number, number] | null;
  userLocationError: string | null;

  // Foraging data
  foragingSpots: ForagingSpot[];
  selectedSpot: ForagingSpot | null;

  // Species selection
  selectedSpecies: string | null;
  speciesOptions: SpeciesOption[];
  speciesDisplayMap: Record<string, string>;

  // Layer visibility
  darkLayersVisible: boolean;
  numbersLayersVisible: boolean;
  activeDay: number; // 0 = today; 1..6 = forecast

  // UI state
  isLoading: boolean;
  error: string | null;
  showUserLocation: boolean;

  // Map reference for layer management
  mapRef: maplibregl.Map | null;

  // Actions
  setCenter: (center: [number, number]) => void;
  setZoom: (zoom: number) => void;
  setBearing: (bearing: number) => void;
  setPitch: (pitch: number) => void;
  setMapStyle: (style: string) => void;
  setUserLocation: (location: [number, number] | null) => void;
  setUserLocationError: (error: string | null) => void;
  setForagingSpots: (spots: ForagingSpot[]) => void;
  addForagingSpot: (spot: ForagingSpot) => void;
  updateForagingSpot: (id: string, updates: Partial<ForagingSpot>) => void;
  removeForagingSpot: (id: string) => void;
  setSelectedSpot: (spot: ForagingSpot | null) => void;
  setIsLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setShowUserLocation: (show: boolean) => void;
  clearError: () => void;
  getUserLocation: () => Promise<GeolocationPosition>;
  fetchNearbySpots: (coordinates: [number, number]) => Promise<void>;

  // Species selection actions
  setSelectedSpecies: (species: string | null) => void;
  toggleDarkLayersVisibility: () => void;
  toggleNumbersLayersVisibility: () => void;
  setActiveDay: (day: number) => void;

  // Map reference management
  setMapRef: (map: maplibregl.Map | null) => void;
  updateVisibleLayers: () => void;
  restoreDarkLayersState: () => void;
}

// Dark mode swaps the whole style — Protomaps basemap has no per-layer ` dark` variant.
// Both styles carry the same overlay layers; AdvancedMap's [mapStyle] effect recreates
// the map (camera preserved from the store) and re-applies species visibility on swap.
const LIGHT_STYLE = '/funges_style.json';
const DARK_STYLE = '/funges_style_dark.json';

export const useMapStore = create<MapState>()(
  devtools(
    (set, get) => ({
      // Initial state
      center: [7.3359, 47.7508], // Switzerland
      zoom: 3.5,
      bearing: 0,
      pitch: 0,
      mapStyle:
        localStorage.getItem('darkLayersVisible') === 'true'
          ? DARK_STYLE
          : LIGHT_STYLE, // self-hosted from public/; regenerate via scripts/add-overlay-to-style.cjs then re-copy
      userLocation: null,
      userLocationError: null,
      foragingSpots: [],
      selectedSpot: null,
      selectedSpecies: localStorage.getItem('selectedSpecies') || 'mushroom',
      speciesOptions: getSpeciesOptions(),
      speciesDisplayMap: {
        // This will be programmatically generated from speciesOptions and species.json
      },
      darkLayersVisible: localStorage.getItem('darkLayersVisible') === 'true',
      numbersLayersVisible:
        localStorage.getItem('numbersLayersVisible') === 'true',
      activeDay: 0,
      isLoading: false,
      error: null,
      showUserLocation: true,
      mapRef: null,

      // Actions
      setCenter: center => set({ center }),
      setZoom: zoom => set({ zoom }),
      setBearing: bearing => set({ bearing }),
      setPitch: pitch => set({ pitch }),
      setMapStyle: mapStyle => set({ mapStyle }),
      setUserLocation: userLocation => set({ userLocation }),
      setUserLocationError: userLocationError => set({ userLocationError }),
      setForagingSpots: foragingSpots => set({ foragingSpots }),
      setSelectedSpot: selectedSpot => set({ selectedSpot }),
      setIsLoading: isLoading => set({ isLoading }),
      setError: error => set({ error }),
      setShowUserLocation: showUserLocation => set({ showUserLocation }),
      clearError: () => set({ error: null }),

      // Species selection actions
      setSelectedSpecies: selectedSpecies => {
        if (selectedSpecies) {
          localStorage.setItem('selectedSpecies', selectedSpecies);
        } else {
          localStorage.removeItem('selectedSpecies');
        }
        set({ selectedSpecies });
      },

      toggleDarkLayersVisibility: () =>
        set(state => {
          const darkLayersVisible = !state.darkLayersVisible;
          localStorage.setItem('darkLayersVisible', String(darkLayersVisible));
          // Swap the style URL; the [mapStyle] effect in AdvancedMap reloads the map.
          return {
            darkLayersVisible,
            mapStyle: darkLayersVisible ? DARK_STYLE : LIGHT_STYLE,
          };
        }),
      toggleNumbersLayersVisibility: () =>
        set(state => {
          const newState = {
            numbersLayersVisible: !state.numbersLayersVisible,
          };
          // Save to localStorage
          localStorage.setItem(
            'numbersLayersVisible',
            newState.numbersLayersVisible.toString()
          );
          // Call updateVisibleLayers after state update
          setTimeout(() => {
            const { updateVisibleLayers } = get();
            updateVisibleLayers();
          }, 0);
          return newState;
        }),
      setActiveDay: (day: number) => {
        set({ activeDay: day });
        // Defer so state is committed before layers are re-evaluated (mirrors numbers toggle).
        setTimeout(() => get().updateVisibleLayers(), 0);
      },

      getUserLocation: (): Promise<GeolocationPosition> => {
        return new Promise((resolve, reject) => {
          if (!navigator.geolocation) {
            reject(new Error('Geolocation is not supported by this browser'));
            return;
          }

          navigator.geolocation.getCurrentPosition(
            async position => {
              const coords: [number, number] = [
                position.coords.longitude,
                position.coords.latitude,
              ];
              set({ userLocation: coords, userLocationError: null });

              // Automatically fetch nearby foraging spots when user gets location
              try {
                await get().fetchNearbySpots(coords);
              } catch (error) {
                console.warn('Failed to fetch nearby foraging spots:', error);
                // Don't reject the main promise for this, just log the warning
              }

              resolve(position);
            },
            error => {
              const errorMessage = `Unable to retrieve your location: ${error.message}`;
              set({ userLocationError: errorMessage });
              reject(error);
            },
            {
              enableHighAccuracy: true,
              timeout: 15000,
              maximumAge: 0,
            }
          );
        });
      },

      fetchNearbySpots: async coordinates => {
        set({ isLoading: true, error: null });
        try {
          // Use the API function to fetch nearby spots
          const { api } = await import('@/lib/api');
          const apiSpots = await api.map.getNearbySpots(coordinates, 10); // 10km radius

          // Transform API spots to match our interface
          const spots: ForagingSpot[] = apiSpots.map(spot => ({
            id: spot.id,
            name: spot.name,
            description: spot.description,
            coordinates: spot.coordinates,
            type:
              spot.species.includes('chant') || spot.species.includes('morel')
                ? 'mushroom'
                : 'berry',
            season: spot.seasonality,
            confidence: 0.8, // Default confidence
            lastUpdated: new Date().toISOString(),
          }));

          set({ foragingSpots: spots, isLoading: false });
        } catch (error) {
          // Don't set an error for this background operation, just log it
          console.warn('Failed to fetch nearby foraging spots:', error);
          set({ isLoading: false });
        }
      },

      // Foraging spot actions
      addForagingSpot: spot =>
        set(state => ({
          foragingSpots: [...state.foragingSpots, spot],
        })),

      updateForagingSpot: (id, updates) =>
        set(state => ({
          foragingSpots: state.foragingSpots.map(spot =>
            spot.id === id ? { ...spot, ...updates } : spot
          ),
        })),

      removeForagingSpot: id =>
        set(state => ({
          foragingSpots: state.foragingSpots.filter(spot => spot.id !== id),
        })),

      // Map reference management
      setMapRef: (map: maplibregl.Map | null) => set({ mapRef: map }),
      updateVisibleLayers: () => {
        const {
          mapRef,
          selectedSpecies,
          numbersLayersVisible,
          speciesOptions,
          activeDay,
        } = get();

        if (!mapRef) {
          console.warn('Map reference not available.');
          return;
        }

        // getStyle() is undefined mid-swap (style not loaded yet); bail and let the
        // map's 'load' handler call this again once the new style is ready.
        const layers = mapRef.getStyle()?.layers;
        if (!layers) {
          return;
        }

        const visibleLayerIds: string[] = [];

        layers.forEach(layer => {
          const id = layer.id;

          const isSpeciesLayer = speciesOptions.some(speciesOption =>
            id.startsWith(speciesOption.code)
          );
          const isRelevantSpecies = selectedSpecies
            ? id.startsWith(selectedSpecies)
            : false;
          const isNumbersLayer = id.includes('numbers');

          if (isSpeciesLayer && !id.endsWith('_fc')) {
            if (isRelevantSpecies) {
              // Set visibility based on whether it's a numbers layer and the numbers toggle
              const visibility = isNumbersLayer
                ? numbersLayersVisible
                  ? 'visible'
                  : 'none'
                : 'visible';
              mapRef.setLayoutProperty(id, 'visibility', visibility);
              console.debug(
                `SHOWING layer: ${id} | isNumbers: ${isNumbersLayer} | visibility: ${visibility}`
              );
              if (visibility === 'visible') visibleLayerIds.push(id);
            } else {
              mapRef.setLayoutProperty(id, 'visibility', 'none');
              console.debug(`HIDING unrelated species layer: ${id}`);
            }
          }

          // Forecast overlay layers (id `<species>_<region>_fc`): visible only for the
          // selected species AND a forecast day (>0); painted to the active day. Today
          // layers stay on beneath, so unchanged triangles keep today's colour.
          if (id.endsWith('_fc')) {
            const relevant =
              !!selectedSpecies && id.startsWith(`${selectedSpecies}_`);
            if (relevant && activeDay > 0) {
              const current = mapRef.getPaintProperty(id, 'fill-color') as unknown[];
              if (Array.isArray(current)) {
                mapRef.setPaintProperty(
                  id,
                  'fill-color',
                  setDayOnFillColor(current, selectedSpecies, activeDay)
                );
              }
              // Only paint triangles that actually carry this species' active-day
              // delta; others lack the property (get -> null -> black fill), so
              // filter them out and let the today layer show through.
              mapRef.setFilter(id, [
                'has',
                `${selectedSpecies}_score_d${activeDay}`,
              ]);
              mapRef.setLayoutProperty(id, 'visibility', 'visible');
            } else {
              mapRef.setLayoutProperty(id, 'visibility', 'none');
            }
          }
        });

        console.debug('Species selected:', selectedSpecies);
        console.debug('Numbers visible:', numbersLayersVisible);
        console.debug('Final visible layers:', visibleLayerIds);
      },
      // ponytail: dark mode is a full style swap now; the correct style is chosen at
      // init and on toggle, so there are no per-layer ` dark` states to restore. No-op
      // kept because AdvancedMap's load handler still calls it.
      restoreDarkLayersState: () => {},
    }),
    {
      name: 'map-store',
    }
  )
);
