import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSpeciesOptions } from '@/data/species';
import {
  forecastRegionForCoordinate,
  layerRegion,
  MAP_THEMES,
  resolveDataNerdRegion,
  useMapStore,
} from '@/store/mapStore';

describe('forecastRegionForCoordinate', () => {
  it.each([
    [[7.3, 47.8], 'NE'],
    [[12.5, 41.9], 'SE'],
    [[-74, 40.7], 'USE'],
    [[-122.4, 37.8], 'USW'],
  ] as const)('maps %s to %s', (coordinate, expected) => {
    expect(forecastRegionForCoordinate([...coordinate])).toBe(expected);
  });
});

const NE_CENTER: [number, number] = [7.3359, 47.7508];
const USE_CENTER: [number, number] = [-74, 40.7];

describe('regional species options', () => {
  beforeEach(() => {
    localStorage.clear();
    useMapStore.setState({
      userLocation: null,
      forecastRegion: 'NE',
      selectedSpecies: 'mushroom',
      speciesOptions: getSpeciesOptions('NE'),
    });
  });

  it('removes species that have no layer in the selected region', () => {
    useMapStore.getState().setCenter(USE_CENTER);
    const state = useMapStore.getState();

    expect(state.speciesOptions.some(option => option.code === 'parasol')).toBe(
      false
    );
    expect(state.speciesOptions.some(option => option.code === 'chant')).toBe(
      true
    );
  });

  // The species list must follow the viewport even once a GPS fix exists: the fix
  // says where the user stands, not what the map is showing.
  it('updates the species list when panning away from the geolocated region', () => {
    useMapStore.setState({
      userLocation: USE_CENTER,
      forecastRegion: 'USE',
      speciesOptions: getSpeciesOptions('USE'),
    });
    useMapStore.getState().setCenter(NE_CENTER);
    const { speciesOptions, forecastRegion } = useMapStore.getState();

    expect(forecastRegion).toBe('NE');
    expect(speciesOptions.some(option => option.code === 'chant')).toBe(true);
    expect(speciesOptions.some(option => option.code === 'masterwort')).toBe(
      true
    );
    expect(speciesOptions.some(option => option.code === 'asparagus')).toBe(
      false
    );
  });

  // setCenter runs on MapLibre's `move` event, i.e. every animation frame.
  it('leaves the species list untouched while panning inside one region', () => {
    const before = useMapStore.getState().speciesOptions;
    useMapStore.getState().setCenter([7.4, 47.8]);
    useMapStore.getState().setCenter([7.5, 47.9]);
    const state = useMapStore.getState();

    expect(state.speciesOptions).toBe(before);
    expect(state.center).toEqual([7.5, 47.9]);
  });

  it('keeps the saved species and restores it on the way back', () => {
    useMapStore.getState().setSelectedSpecies('masterwort'); // NE/SE only
    useMapStore.getState().setCenter(USE_CENTER);

    expect(useMapStore.getState().selectedSpecies).not.toBe('masterwort');
    expect(localStorage.getItem('selectedSpecies')).toBe('masterwort');

    useMapStore.getState().setCenter(NE_CENTER);
    expect(useMapStore.getState().selectedSpecies).toBe('masterwort');
  });

  // MapPage mirrors the URL's ?species here, falling back to mushroom when the
  // query species is not offered in the region on screen. That fallback must not
  // overwrite what the user last picked.
  it('does not persist a species mirrored from the URL', () => {
    useMapStore.getState().setSelectedSpecies('masterwort');
    useMapStore.getState().syncSelectedSpecies('mushroom');

    expect(useMapStore.getState().selectedSpecies).toBe('mushroom');
    expect(localStorage.getItem('selectedSpecies')).toBe('masterwort');
  });

  it('filters the catalog per region, not per continent', () => {
    expect(
      getSpeciesOptions('USE').some(option => option.code === 'asparagus')
    ).toBe(false);
    expect(
      getSpeciesOptions('NE').some(option => option.code === 'asparagus')
    ).toBe(false);
    expect(
      getSpeciesOptions('SE').some(option => option.code === 'asparagus')
    ).toBe(true);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('layerRegion', () => {
  it.each([
    ['mushroom_ne', 'ne'],
    ['mushroom_se', 'se'],
    ['mushroom_use', 'use'],
    ['mushroom_usw', 'usw'],
    ['walnut_se_numbers', 'se'],
  ])('extracts %s -> %s', (id, expected) => {
    expect(layerRegion(id)).toBe(expected);
  });

  it('returns null for a layer id with no known region suffix', () => {
    expect(layerRegion('background')).toBeNull();
  });
});

describe('resolveDataNerdRegion', () => {
  it.each([
    ['mushroom_ne', 'NE'],
    ['mushroom_se', 'SE'],
    ['mushroom_use', 'USE'],
    ['mushroom_usw', 'USW'],
    ['walnut_se_numbers', 'SE'],
  ])('resolves %s -> %s', (id, expected) => {
    expect(resolveDataNerdRegion(id)).toBe(expected);
  });

  it('returns null for an unrecognized layer id (no false-positive region match)', () => {
    expect(resolveDataNerdRegion('background')).toBeNull();
  });
});

describe('setMapStyleIndex', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to index 0 (Light) with no stored preference', () => {
    expect(useMapStore.getState().mapStyleIndex).toBe(0);
    expect(useMapStore.getState().mapStyle).toBe('/funges_style.json');
    expect(useMapStore.getState().darkLayersVisible).toBe(false);
  });

  it('sets the style URL, index, and persists to localStorage for a light theme', () => {
    useMapStore.getState().setMapStyleIndex(2);
    const state = useMapStore.getState();
    expect(state.mapStyleIndex).toBe(2);
    expect(state.mapStyle).toBe('/funges_style_positron.json');
    expect(state.darkLayersVisible).toBe(false);
    expect(localStorage.getItem('mapStyleIndex')).toBe('2');
  });

  it('marks darkLayersVisible for Dark and Dark Matter indexes', () => {
    useMapStore.getState().setMapStyleIndex(1);
    expect(useMapStore.getState().darkLayersVisible).toBe(true);

    useMapStore.getState().setMapStyleIndex(3);
    expect(useMapStore.getState().darkLayersVisible).toBe(true);
  });

  it('selects the Topographic style at index 4', () => {
    useMapStore.getState().setMapStyleIndex(4);
    const state = useMapStore.getState();
    expect(state.mapStyle).toBe('/funges_style_topographic.json');
    expect(state.darkLayersVisible).toBe(false);
  });

  it('ignores out-of-range indexes and leaves state untouched', () => {
    useMapStore.getState().setMapStyleIndex(2);
    useMapStore.getState().setMapStyleIndex(99);
    expect(useMapStore.getState().mapStyleIndex).toBe(2);
    expect(localStorage.getItem('mapStyleIndex')).toBe('2');
  });
});

describe('MAP_THEMES', () => {
  it('has exactly 5 themes, each pointing at a valid style index', () => {
    expect(MAP_THEMES).toHaveLength(5);
    const indexes = MAP_THEMES.map(theme => theme.styleIndex).sort();
    expect(indexes).toEqual([0, 1, 2, 3, 4]);
  });

  it('includes light, dark, white, darkmatter, and topographic', () => {
    expect(MAP_THEMES.map(theme => theme.id).sort()).toEqual([
      'dark',
      'darkmatter',
      'light',
      'topographic',
      'white',
    ]);
  });
});

describe('getUserLocation', () => {
  it('keeps precise coordinates on-device', async () => {
    const position = {
      coords: {
        latitude: 47.7508,
        longitude: 7.3359,
      },
    } as GeolocationPosition;
    const fetchSpy = vi.fn();

    vi.stubGlobal('fetch', fetchSpy);
    vi.stubGlobal('navigator', {
      ...navigator,
      geolocation: {
        getCurrentPosition: vi.fn(success => success(position)),
      },
    });

    await expect(useMapStore.getState().getUserLocation()).resolves.toBe(
      position
    );

    expect(useMapStore.getState().userLocation).toEqual([7.3359, 47.7508]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
