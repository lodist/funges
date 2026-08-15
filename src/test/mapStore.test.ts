import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  layerRegion,
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
