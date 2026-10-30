import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The Worker's address, read as the session module loads: set here, not by a
// local .env, so CI runs these the same way.
vi.hoisted(() => vi.stubEnv('VITE_HUERTA_API', 'https://w.test'));

import {
  decodeAdvice,
  fetchAdvice,
  fetchNeeds,
  fetchYear,
  plain,
  saveMapView,
  savedMapView,
  searchTowns,
} from '@/lib/huerta-api';
import { CROPS } from '@/lib/huerta';
import { session, setSession } from '@/lib/huerta-session';

const ADVICE = {
  day: '9999-01-01', // never stale: kept advice is reused until a later day
  crops: ['garlic', 'tomato', 'tulip'],
  place: {
    name: 'Ciudad Lineal',
    frost: 'g',
    soil: 13.4,
    nights: 8.5,
    rain: 4,
    water: 10,
    statuses: 'nla',
  },
};
// Every crop the app lists, so a kept answer is complete.
const FULL = {
  ...ADVICE,
  crops: CROPS.map(crop => crop.id),
  place: { ...ADVICE.place, statuses: 'n'.repeat(CROPS.length) },
};
// A place's year with every crop the app lists, its temperatures, soil and climate.
const YEAR = {
  crops: CROPS.map(crop => crop.id),
  place: {
    name: 'Zug',
    months: '00e0f0'.repeat(CROPS.length),
    temps: Array(12).fill(10),
    soil: [6.5, 20, 40],
    climate: [306, 116, 329, 88, 155, 265, 177, 246, -8],
  },
};
const TOWNS = [
  ['Madridejos', 39.47, -3.53, 'ES', 'Toledo'],
  ['Madrid', 40.38, -3.67, 'ES', 'Madrid'],
  ['Mazarron', 37.6, -1.3, 'ES', 'Murcia'],
];

describe('the Huerta Worker client', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it('reads one letter per crop and the frost code', () => {
    const advice = decodeAdvice(ADVICE);
    expect(advice.crops).toEqual({
      garlic: 'now',
      tomato: 'too_late',
      tulip: 'wait_autumn',
    });
    expect(advice.frost).toBe('ground_frost');
    expect(advice.place).toBe('Ciudad Lineal');
  });

  it('keys names as the town list does', () => {
    expect(plain('Bø')).toBe('bø');
    expect(plain('Saint-Émilion')).toBe('saintemilion');
    expect(plain("L'Aquila")).toBe('laquila');
  });

  it('asks once a day per place and once per two-letter section', async () => {
    const calls = vi.fn(async (url: string) =>
      Response.json(url.includes('/v1/towns') ? TOWNS : FULL)
    );
    vi.stubGlobal('fetch', calls);

    const first = await fetchAdvice({ lat: 40.4412, lon: -3.6751 });
    // The same ~1 km spot the same day: kept, not asked again.
    expect(await fetchAdvice({ lat: 40.4399, lon: -3.6752 })).toEqual(first);

    expect((await searchTowns('Madr')).map(t => t.name)).toEqual([
      'Madrid',
      'Madridejos',
    ]);
    expect((await searchTowns('mazar'))[0]).toMatchObject({
      name: 'Mazarron',
      province: 'Murcia',
    });
    expect(calls).toHaveBeenCalledTimes(2); // one advice, one section ("ma")
  });

  it('lists the bigger town first and a city under two names once', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json([
          ['Zuraw', 51.1, 19.2, 'PL', 'Łódź'],
          ['Zürich', 47.37, 8.55, 'CH', 'Zürich', 436332],
          ['Zurich', 39.21, -99.44, 'US', 'Kansas'],
          ['Zurigo', 47.37, 8.55, 'CH', 'Zürich', 436332],
        ])
      )
    );
    expect((await searchTowns('zur')).map(t => t.name)).toEqual([
      'Zürich',
      'Zuraw',
      'Zurich',
    ]);
    expect(await searchTowns('zurigo')).toEqual([
      {
        name: 'Zurigo',
        lat: 47.37,
        lon: 8.55,
        country: 'CH',
        province: 'Zürich',
      },
    ]);
  });

  it('keeps the garden’s answer when the map looks somewhere else', async () => {
    const calls = vi.fn(async () => Response.json(FULL));
    vi.stubGlobal('fetch', calls);
    await fetchAdvice({ lat: 40.44, lon: -3.68 });
    await fetchAdvice({ lat: 48.85, lon: 2.35 }, false); // a spot on the map
    await fetchAdvice({ lat: 40.44, lon: -3.68 });
    expect(calls).toHaveBeenCalledTimes(2);
  });

  it('remembers where the map was left', () => {
    expect(savedMapView()).toBeNull();
    saveMapView({ center: [2.35, 48.85], zoom: 6 });
    expect(savedMapView()).toEqual({ center: [2.35, 48.85], zoom: 6 });
  });

  it('asks again when the app knows a crop the kept answer lacks', async () => {
    const calls = vi.fn(async () => Response.json(ADVICE));
    vi.stubGlobal('fetch', calls);
    await fetchAdvice({ lat: 40.44, lon: -3.68 });
    await fetchAdvice({ lat: 40.44, lon: -3.68 });
    expect(calls).toHaveBeenCalledTimes(2);
  });

  it('says the search failed, not that no town matched, and tries again', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"error":"origin"}', { status: 403 }))
    );
    await expect(searchTowns('vale')).rejects.toThrow('403');

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json([['Valencia', 39.48, -0.38, 'ES', 'Valencia']])
      )
    );
    expect((await searchTowns('vale')).map(t => t.name)).toEqual(['Valencia']);
  });

  it('keeps the year a day, then asks past the browser cache; kept stands in offline', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const calls = vi.fn(async (_url: string, _init?: RequestInit) =>
      Response.json(YEAR)
    );
    vi.stubGlobal('fetch', calls);
    const zug = { lat: 47.16, lon: 8.55 };
    const year = await fetchYear(zug);
    expect(await fetchYear(zug)).toEqual(year);
    expect(calls).toHaveBeenCalledTimes(1);
    expect(calls.mock.calls[0][1]).toMatchObject({ cache: 'no-cache' });

    // A day on, a rebuilt year is asked for...
    vi.setSystemTime(Date.now() + 864e5 + 1);
    await fetchYear(zug);
    expect(calls).toHaveBeenCalledTimes(2);
    // ...and offline, the kept one stands in.
    vi.setSystemTime(Date.now() + 864e5 + 1);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('offline')))
    );
    expect(await fetchYear(zug)).toEqual(year);
    vi.useRealTimers();
  });

  it('asks as the signed-in account, and a 401 signs the device out', async () => {
    setSession({ token: 'f'.repeat(64), email: 'a@b.c' });
    const calls = vi.fn(async (url: string) =>
      url.includes('/v1/crops')
        ? new Response('{}', { status: 401 })
        : Response.json(FULL)
    );
    vi.stubGlobal('fetch', calls);
    await fetchAdvice({ lat: 40.44, lon: -3.68 });
    const asked = new URL(String(calls.mock.calls[0][0]));
    expect(asked.searchParams.get('t')).toBe('f'.repeat(64));
    expect(asked.searchParams.has('k')).toBe(false);
    await expect(fetchNeeds()).rejects.toThrow('401');
    expect(session()).toBeNull();
  });
});
