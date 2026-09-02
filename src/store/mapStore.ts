import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import {
  getSpeciesOptions,
  type ForecastRegion,
  type SpeciesOption,
} from '@/data/species';
import { GENERATED_REGION_BOUNDARIES } from '@/generated/species-catalog';
import {
  setForecastFraction,
  forecastNumberField,
  FORECAST_DAYS,
} from '@/lib/forecast';
import type { RegionId } from '@/lib/data';

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
  forecastRegion: ForecastRegion; // derived from `center`, drives speciesOptions
  speciesDisplayMap: Record<string, string>;

  // Layer visibility
  darkLayersVisible: boolean; // true when the active style is a dark one
  mapStyleIndex: number; // index into MAP_STYLES (set via setMapStyleIndex)
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

  // Species selection actions
  setSelectedSpecies: (species: string | null) => void;
  syncSelectedSpecies: (species: string | null) => void;
  setMapStyleIndex: (index: number) => void;
  toggleNumbersLayersVisibility: () => void;
  setActiveDay: (day: number) => void;

  // Map reference management
  setMapRef: (map: maplibregl.Map | null) => void;
  updateVisibleLayers: () => void;
  restoreDarkLayersState: () => void;
}

// The theme selector picks one of these 5 whole styles — Protomaps basemap has
// no per-layer `dark` variant. All 5 carry the SAME overlay/species layers (only
// the basemap differs); AdvancedMap's [mapStyle] effect recreates the map
// (camera preserved from the store) and re-applies species visibility on swap.
// Regenerate positron/darkmatter/topographic via scripts/make_carto_styles.py.
const MAP_STYLES = [
  '/funges_style.json', // 0 light (olive)
  '/funges_style_dark.json', // 1 dark
  '/funges_style_positron.json', // 2 White (Positron)
  '/funges_style_darkmatter.json', // 3 Dark Matter
  '/funges_style_topographic.json', // 4 Topographic
];
const DARK_STYLE_INDEXES = new Set([1, 3]); // drives dark UI chrome
const INITIAL_CENTER: [number, number] = [7.3359, 47.7508];

// Boundaries come from the manifests via species:generate, the same numbers the
// Python scoring scripts read out of backend/generated/species_registry.json —
// so the species list and the forecast data can't disagree about where USE ends.
export function forecastRegionForCoordinate([longitude, latitude]: [
  number,
  number,
]): ForecastRegion {
  const { uswMaxLongitude, usMaxLongitude, seMaxLatitude } =
    GENERATED_REGION_BOUNDARIES;
  if (longitude < uswMaxLongitude) return 'USW';
  if (longitude < usMaxLongitude) return 'USE';
  return latitude < seMaxLatitude ? 'SE' : 'NE';
}

// The species list follows the VIEWPORT: a US GPS fix does not make US-only species
// meaningful while the map shows Europe. Never writes to localStorage — the fallback
// below is session-only, so panning through a region that lacks the user's species
// can't destroy their saved choice, and it is preferred again as soon as a region
// offers it. On the map page the URL's ?species still has the last word (MapPage
// mirrors it in), so the restore shows up on the next cold start rather than mid-pan.
function regionalSpeciesState(
  region: ForecastRegion,
  selectedSpecies: string | null
) {
  const speciesOptions = getSpeciesOptions(region);
  const offered = (code: string | null) =>
    !!code && speciesOptions.some(option => option.code === code);
  const persisted = localStorage.getItem('selectedSpecies');
  const nextSelectedSpecies = offered(persisted)
    ? persisted
    : offered(selectedSpecies)
      ? selectedSpecies
      : (speciesOptions[0]?.code ?? null);
  return {
    forecastRegion: region,
    speciesOptions,
    selectedSpecies: nextSelectedSpecies,
  };
}

const INITIAL_REGION = forecastRegionForCoordinate(INITIAL_CENTER);
const INITIAL_SPECIES = regionalSpeciesState(INITIAL_REGION, 'mushroom');

export interface MapThemeOption {
  id: 'light' | 'dark' | 'white' | 'darkmatter' | 'topographic';
  styleIndex: number;
  thumbnail: string;
}

// Drives the MapThemeSelector dropdown. Names/descriptions live in
// map.json under the `themes.<id>` namespace (translated in all locales).
// Thumbnails are real screenshots, manually captured and committed to
// public/theme-thumbnails/ once each theme is visually verifiable.
export const MAP_THEMES: MapThemeOption[] = [
  { id: 'light', styleIndex: 0, thumbnail: '/theme-thumbnails/light.png' },
  { id: 'dark', styleIndex: 1, thumbnail: '/theme-thumbnails/dark.png' },
  { id: 'white', styleIndex: 2, thumbnail: '/theme-thumbnails/white.png' },
  {
    id: 'darkmatter',
    styleIndex: 3,
    thumbnail: '/theme-thumbnails/darkmatter.png',
  },
  {
    id: 'topographic',
    styleIndex: 4,
    thumbnail: '/theme-thumbnails/topographic.png',
  },
];
function readStyleIndex(): number {
  const saved = Number(localStorage.getItem('mapStyleIndex'));
  if (Number.isInteger(saved) && saved >= 0 && saved < MAP_STYLES.length) {
    return saved;
  }
  // Back-compat with the old light/dark boolean.
  return localStorage.getItem('darkLayersVisible') === 'true' ? 1 : 0;
}

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
//
// These are NOT the forecast-region boundaries (GENERATED_REGION_BOUNDARIES above):
// tile activation is deliberately coarser and overlapping, so moving the USE/USW
// boundary does not touch this map.
export const REGION_BBOX: Record<string, [number, number, number, number]> = {
  ne: [-25, 27, 45, 72], // EU (whole): NE+SE always load together
  se: [-25, 27, 45, 72],
  use: [-125, 24, -66, 50], // US (whole): USE+USW always load together
  usw: [-125, 24, -66, 50],
};

// Extract the region code (ne/se/use/usw) from a layer id like `mushroom_ne` or
// `walnut_se_numbers`. Returns null for non-region layers.
export function layerRegion(id: string): string | null {
  const base = id.replace(/_numbers$/, '');
  for (const r of ['usw', 'use', 'ne', 'se']) {
    if (base.endsWith(`_${r}`)) return r;
  }
  return null;
}

// Resolves a clicked map layer id to the uppercase RegionId used by the Data Nerd
// page/route (layerRegion produces lowercase codes; Data Nerd expects 'NE'/'SE'/'USE'/'USW').
export function resolveDataNerdRegion(layerId: string): RegionId | null {
  const region = layerRegion(layerId);
  return region ? (region.toUpperCase() as RegionId) : null;
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
      center: INITIAL_CENTER, // Switzerland
      zoom: 3.5,
      bearing: 0,
      pitch: 0,
      mapStyle: MAP_STYLES[readStyleIndex()], // self-hosted from public/
      mapStyleIndex: readStyleIndex(),
      userLocation: null,
      userLocationError: null,
      foragingSpots: [],
      selectedSpot: null,
      selectedSpecies: INITIAL_SPECIES.selectedSpecies,
      speciesOptions: INITIAL_SPECIES.speciesOptions,
      forecastRegion: INITIAL_REGION,
      speciesDisplayMap: {
        // This will be programmatically generated from speciesOptions and species.json
      },
      darkLayersVisible: DARK_STYLE_INDEXES.has(readStyleIndex()),
      // ponytail: numbers layer temporarily disabled (glyph flood janks the map). The
      // toggle button + instruction entries are removed but the layers/logic stay wired;
      // re-enable by restoring the button and this localStorage read.
      numbersLayersVisible: false,
      activeDay: 0,
      isLoading: false,
      error: null,
      showUserLocation: true,
      mapRef: null,

      // Actions
      // MapLibre's `move` event calls this on every animation frame, so the species
      // list is recomputed only when the viewport actually crosses into another
      // region — not 60 times a second.
      setCenter: center =>
        set(state => {
          const region = forecastRegionForCoordinate(center);
          if (region === state.forecastRegion) return { center };
          return {
            center,
            ...regionalSpeciesState(region, state.selectedSpecies),
          };
        }),
      setZoom: zoom => set({ zoom }),
      setBearing: bearing => set({ bearing }),
      setPitch: pitch => set({ pitch }),
      setMapStyle: mapStyle => set({ mapStyle }),
      // Deliberately does not touch the species list: GeolocateControl recenters the
      // map on the fix, and setCenter picks the region up from the viewport.
      setUserLocation: userLocation => set({ userLocation }),
      setUserLocationError: userLocationError => set({ userLocationError }),
      setForagingSpots: foragingSpots => set({ foragingSpots }),
      setSelectedSpot: selectedSpot => set({ selectedSpot }),
      setIsLoading: isLoading => set({ isLoading }),
      setError: error => set({ error }),
      setShowUserLocation: showUserLocation => set({ showUserLocation }),
      clearError: () => set({ error: null }),

      // Mirrors the URL's ?species into the store without persisting it: MapPage
      // falls back to mushroom whenever the query species is not offered in the
      // region on screen, and that fallback is not the user's choice to remember.
      syncSelectedSpecies: selectedSpecies => set({ selectedSpecies }),

      // Species selection actions
      setSelectedSpecies: selectedSpecies => {
        if (selectedSpecies) {
          localStorage.setItem('selectedSpecies', selectedSpecies);
        } else {
          localStorage.removeItem('selectedSpecies');
        }
        set({ selectedSpecies });
      },

      setMapStyleIndex: (index: number) => {
        if (
          !Number.isInteger(index) ||
          index < 0 ||
          index >= MAP_STYLES.length
        ) {
          return;
        }
        localStorage.setItem('mapStyleIndex', String(index));
        // Swap the style URL; the [mapStyle] effect in AdvancedMap reloads the map.
        set({
          mapStyleIndex: index,
          mapStyle: MAP_STYLES[index],
          darkLayersVisible: DARK_STYLE_INDEXES.has(index),
        });
      },
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
            position => {
              const coords: [number, number] = [
                position.coords.longitude,
                position.coords.latitude,
              ];
              set({ userLocation: coords, userLocationError: null });

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
