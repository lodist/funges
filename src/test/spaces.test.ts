import { beforeEach, describe, expect, it } from 'vitest';

import {
  currentSpace,
  pathForSpace,
  rememberPath,
  spaceForPath,
} from '@/lib/spaces';

describe('spaces', () => {
  beforeEach(() => localStorage.clear());

  it('reads the space from the path', () => {
    expect(spaceForPath('/huerta')).toBe('huerta');
    expect(spaceForPath('/huerta/crops')).toBe('huerta');
    expect(spaceForPath('/app/huerta')).toBe('huerta'); // under a base path
    expect(spaceForPath('/huertas')).toBe('terra');
    expect(spaceForPath('/map')).toBe('terra');
    expect(spaceForPath('/')).toBe('terra');
    expect(spaceForPath('/settings')).toBeNull(); // shared
  });

  it('keeps the space a visitor came from on a shared page', () => {
    expect(currentSpace('/huerta')).toBe('huerta');
    expect(currentSpace('/settings')).toBe('huerta');
    expect(currentSpace('/map')).toBe('terra');
    expect(currentSpace('/support')).toBe('terra');
  });

  it('switches back to the page last seen in a space, else its home', () => {
    expect(pathForSpace('terra')).toBe('/map');
    rememberPath('/species');
    rememberPath('/huerta');
    rememberPath('/settings'); // shared: remembered for neither
    expect(pathForSpace('terra')).toBe('/species');
    expect(pathForSpace('huerta')).toBe('/huerta');
  });

  it('opens Huerta on the garden once one is planned, else on the map', () => {
    expect(pathForSpace('huerta')).toBe('/huerta/map');
    localStorage.setItem(
      'huerta-gardens',
      JSON.stringify([{ id: 'g', plan: null }])
    );
    expect(pathForSpace('huerta')).toBe('/huerta/map');
    localStorage.setItem(
      'huerta-gardens',
      JSON.stringify([{ id: 'g', plan: { sections: [] } }])
    );
    expect(pathForSpace('huerta')).toBe('/huerta/planner');
  });
});
