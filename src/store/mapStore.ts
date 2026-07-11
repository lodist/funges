import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { getSpeciesOptions, type SpeciesOption } from '@/data/species';
import {
  setForecastFraction,
  forecastNumberField,
  FORECAST_DAYS,
} from '@/lib/forecast';

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

// Region overlay/forecast tilesets are heavy; keeping all four live at once (even when
// only one is in view) is what makes the map lag. We only show a region's layers when
// its activation zone intersects the viewport, so MapLibre stops loading tiles for
// off-screen regions.
//
// EU and US are each treated as ONE unit (both halves share the same combined bbox, so
// they always activate together). We CAN'T split within a continent by any bbox line:
// NE = British Isles + Nordics, SE = continental Europe, and they interleave by latitude
// (London/NE at 51.5° sits above Paris/SE at 48.8°, while Berlin/SE at 52.5° sits above
// London) — any lat/lon cut blanks half of one region's data. USE/USW overlap the same
// way across the central US. The Atlantic gap (EU ends at 45°/starts at -25°, US spans
// -125°..-66°) keeps EU and US from ever being active together. [west, south, east, north].
export const REGION_BBOX: Record<string, [number, number, number, number]> = {
  ne: [-25, 27, 45, 72], // EU (whole): NE+SE always load together
  se: [-25, 27, 45, 72],
  use: [-125, 24, -66, 50], // US (whole): USE+USW always load together
  usw: [-125, 24, -66, 50],
};

// Extract the region code (ne/se/use/usw) from a layer id like `mushroom_ne` or
// `walnut_se_numbers`. Returns null for non-region layers.
function layerRegion(id: string): string | null {
  const base = id.replace(/_numbers$/, '');
  for (const r of ['usw', 'use', 'ne', 'se']) {
    if (base.endsWith(`_${r}`)) return r;
  }
  return null;
}

function regionInView(r: string, bounds: maplibregl.LngLatBounds): boolean {
  const box = REGION_BBOX[r];
  if (!box) return true; // unknown region: don't hide it
  const [w, s, e, n] = box;
  return (
    bounds.getEast() >= w &&
    bounds.getWest() <= e &&
    bounds.getNorth() >= s &&
    bounds.getSouth() <= n
  );
}

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

        const bounds = mapRef.getBounds();

        layers.forEach(layer => {
          const id = layer.id;

          const isSpeciesLayer = speciesOptions.some(speciesOption =>
            id.startsWith(speciesOption.code)
          );
          const isRelevantSpecies = selectedSpecies
            ? id.startsWith(selectedSpecies)
            : false;
          const isNumbersLayer = id.includes('numbers');
          // Off-screen regions stay hidden so their tilesets don't load (the lag fix).
          const region = layerRegion(id);
          const inView = region === null || regionInView(region, bounds);

          // One tileset now: each species has a single fill + numbers layer, both reading
          // the forecast tiles and both interpolated d0->d6 to the active day (frac 0 on
          // day 0 == today's score exactly), so there's no source swap to glitch. Numbers
          // render on every day too (interpolated), gated only by the numbers toggle.
          if (isSpeciesLayer) {
            if (selectedSpecies && isRelevantSpecies && inView) {
              const frac = activeDay / (FORECAST_DAYS - 1);
              if (isNumbersLayer) {
                if (numbersLayersVisible) {
                  mapRef.setLayoutProperty(
                    id,
                    'text-field',
                    forecastNumberField(selectedSpecies, frac)
                  );
                  // The badge colour is text-halo-color — the same score ramp as the
                  // fill — so interpolate it to the active day too, or the digit shows
                  // the forecast value on a today-coloured badge.
                  const halo = mapRef.getPaintProperty(
                    id,
                    'text-halo-color'
                  ) as unknown[];
                  if (Array.isArray(halo)) {
                    mapRef.setPaintProperty(
                      id,
                      'text-halo-color',
                      setForecastFraction(halo, selectedSpecies, frac)
                    );
                  }
                  mapRef.setLayoutProperty(id, 'visibility', 'visible');
                } else {
                  mapRef.setLayoutProperty(id, 'visibility', 'none');
                }
              } else {
                const current = mapRef.getPaintProperty(
                  id,
                  'fill-color'
                ) as unknown[];
                if (Array.isArray(current)) {
                  mapRef.setPaintProperty(
                    id,
                    'fill-color',
                    setForecastFraction(current, selectedSpecies, frac)
                  );
                }
                mapRef.setLayoutProperty(id, 'visibility', 'visible');
              }
            } else {
              mapRef.setLayoutProperty(id, 'visibility', 'none');
            }
          }
        });
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
