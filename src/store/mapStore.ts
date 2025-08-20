import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { getSpeciesOptions, type SpeciesOption } from '@/data/species';

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

  // UI state
  isLoading: boolean;
  error: string | null;
  showUserLocation: boolean;

  // Map reference for layer management
  mapRef: mapboxgl.Map | null;

  // Data freshness
  lastDataRefresh: string | null;

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

  // Map reference management
  setMapRef: (map: mapboxgl.Map | null) => void;
  updateVisibleLayers: () => void;
  restoreDarkLayersState: () => void;

  setLastDataRefresh: (timestamp: string) => void;
}

export const useMapStore = create<MapState>()(
  devtools(
    (set, get) => ({
      // Initial state
      center: [7.3359, 47.7508], // Switzerland
      zoom: 5,
      bearing: 0,
      pitch: 0,
      mapStyle: import.meta.env.VITE_MAPBOX_STYLE,
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
      isLoading: false,
      error: null,
      showUserLocation: true,
      mapRef: null,

      lastDataRefresh: null,

      // Actions
      setCenter: center => set({ center }),
      setZoom: zoom => set({ zoom }),
      setBearing: bearing => set({ bearing }),
      setPitch: pitch => set({ pitch }),
      setMapStyle: mapStyle => set({ mapStyle }),
      setUserLocation: userLocation => set({ userLocation }),
      setUserLocationError: userLocationError => set({ userLocationError }),
      setForagingSpots: foragingSpots =>
        set({ foragingSpots, lastDataRefresh: new Date().toISOString() }),
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
          const newState = { darkLayersVisible: !state.darkLayersVisible };
          const { mapRef } = get();

          // Save to localStorage
          localStorage.setItem(
            'darkLayersVisible',
            newState.darkLayersVisible.toString()
          );

          // Show loading spinner when enabling dark layers (like in old project)
          if (newState.darkLayersVisible) {
            set({ isLoading: true });
            setTimeout(() => {
              set({ isLoading: false });
            }, 2000);
          }

          // Directly manage dark layers like in the old project
          if (mapRef) {
            const layers = mapRef.getStyle().layers;
            if (layers) {
              layers.forEach(layer => {
                const layerId = layer.id;
                if (layerId.endsWith(' dark')) {
                  mapRef.setLayoutProperty(
                    layerId,
                    'visibility',
                    newState.darkLayersVisible ? 'visible' : 'none'
                  );
                }
              });
            }
          }

          console.debug(
            `Dark layers are now ${newState.darkLayersVisible ? 'visible' : 'hidden'}`
          );
          return newState;
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

          set({
            foragingSpots: spots,
            isLoading: false,
            lastDataRefresh: new Date().toISOString(),
          });
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
          lastDataRefresh: new Date().toISOString(),
        })),

      updateForagingSpot: (id, updates) =>
        set(state => ({
          foragingSpots: state.foragingSpots.map(spot =>
            spot.id === id ? { ...spot, ...updates } : spot
          ),
          lastDataRefresh: new Date().toISOString(),
        })),

      removeForagingSpot: id =>
        set(state => ({
          foragingSpots: state.foragingSpots.filter(spot => spot.id !== id),
          lastDataRefresh: new Date().toISOString(),
        })),

      // Map reference management
      setMapRef: (map: mapboxgl.Map | null) => set({ mapRef: map }),
      setLastDataRefresh: lastDataRefresh => set({ lastDataRefresh }),
      updateVisibleLayers: () => {
        const {
          mapRef,
          selectedSpecies,
          numbersLayersVisible,
          speciesOptions,
        } = get();

        if (!mapRef) {
          console.warn('Map reference not available.');
          return;
        }

        const layers = mapRef.getStyle().layers;
        if (!layers) {
          console.warn('No layers found in map style.');
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

          if (isSpeciesLayer) {
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
        });

        console.debug('Species selected:', selectedSpecies);
        console.debug('Numbers visible:', numbersLayersVisible);
        console.debug('Final visible layers:', visibleLayerIds);
      },
      restoreDarkLayersState: () => {
        const { mapRef, darkLayersVisible } = get();

        if (mapRef) {
          const layers = mapRef.getStyle().layers;
          if (layers) {
            layers.forEach(layer => {
              const layerId = layer.id;
              if (layerId.endsWith(' dark')) {
                mapRef.setLayoutProperty(
                  layerId,
                  'visibility',
                  darkLayersVisible ? 'visible' : 'none'
                );
              }
            });
          }
        }

        console.debug(
          `Dark layers state restored: ${darkLayersVisible ? 'visible' : 'hidden'}`
        );
      },
    }),
    {
      name: 'map-store',
    }
  )
);
