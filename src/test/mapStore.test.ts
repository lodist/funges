import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  layerRegion,
  MAP_THEMES,
  resolveDataNerdRegion,
  useMapStore,
} from '@/store/mapStore';

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

describe('offline viewport persistence', () => {
  beforeEach(() => localStorage.clear());

  it('persists the last map center and zoom for an offline restart', () => {
    useMapStore.getState().setCenter([-105.5, 39]);
    useMapStore.getState().setZoom(8);

    expect(localStorage.getItem('mapCenter')).toBe('[-105.5,39]');
    expect(localStorage.getItem('mapZoom')).toBe('8');
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
