import { beforeEach, describe, expect, it } from 'vitest';

import {
  currentSpace,
  lastDoor,
  pathForSpace,
  rememberPath,
  renamedPath,
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
    expect(spaceForPath('/terra')).toBe('terra');
    expect(spaceForPath('/support')).toBeNull(); // shared
    expect(spaceForPath('/settings')).toBe('terra'); // each space has its own
    expect(spaceForPath('/huerta/settings/')).toBe('huerta');
    expect(spaceForPath('/')).toBeNull(); // the front page, shared
    expect(spaceForPath('/de/')).toBeNull();
  });

  it('keeps the space a visitor came from on a shared page', () => {
    expect(currentSpace('/huerta')).toBe('huerta');
    expect(currentSpace('/privacy-policy')).toBe('huerta');
    expect(currentSpace('/map')).toBe('terra');
    expect(currentSpace('/support')).toBe('terra');
  });

  it('switches back to the page last seen in a space, else its home', () => {
    expect(pathForSpace('terra')).toBe('/map');
    rememberPath('/species');
    rememberPath('/huerta');
    rememberPath('/support'); // shared: remembered for neither
    rememberPath('/huerta/settings'); // Settings: no page to switch back to
    expect(pathForSpace('terra')).toBe('/species');
    expect(pathForSpace('huerta')).toBe('/huerta');
  });

  it("switches from one space's Settings to the other's", () => {
    rememberPath('/species');
    expect(pathForSpace('huerta', '/settings')).toBe('/huerta/settings');
    expect(pathForSpace('terra', '/huerta/settings/')).toBe('/settings');
    expect(pathForSpace('terra', '/huerta/map')).toBe('/species');
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
    expect(pathForSpace('huerta')).toBe('/huerta/garden-planner');
  });

  it("opens the front page's door into the space last used", () => {
    expect(lastDoor()).toBeNull();
    rememberPath('/');
    expect(lastDoor()).toBeNull(); // the front page itself is no space
    rememberPath('/map');
    expect(lastDoor()).toBe('/terra/');
    rememberPath('/huerta/crops');
    localStorage.setItem(
      'huerta-gardens',
      JSON.stringify([{ id: 'g', plan: { sections: [] } }])
    );
    expect(lastDoor()).toBe('/huerta/'); // the front page, garden or not
  });
});

describe("Huerta's renamed pages", () => {
  it('sends an old path to its new one, in its language, and leaves others', () => {
    expect(renamedPath('/huerta/planner')).toBe('/huerta/garden-planner');
    expect(renamedPath('/huerta/year/')).toBe('/huerta/planting-calendar/');
    expect(renamedPath('/huerta/species')).toBe('/huerta/crops');
    expect(renamedPath('/huerta/species/tomato/')).toBe(
      '/huerta/crops/tomato/'
    );
    expect(renamedPath('/de/huerta/species/tomato/')).toBe(
      '/de/huerta/pflanzen/tomate/'
    );
    // A crop's page: hyphens, and German words under /de.
    expect(renamedPath('/huerta/crops/broad_beans/')).toBe(
      '/huerta/crops/broad-beans/'
    );
    expect(renamedPath('/de/huerta/crops/broad_beans')).toBe(
      '/de/huerta/pflanzen/dicke-bohnen/'
    );
    for (const path of [
      '/huerta/crops/broad-beans',
      '/de/huerta/pflanzen/dicke-bohnen/',
    ])
      expect(renamedPath(path)).toBe(path);
    for (const path of [
      '/huerta/map',
      '/huerta/crops',
      '/species',
      '/huerta/years',
    ])
      expect(renamedPath(path)).toBe(path);
  });
});
