import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  decodeAdvice,
  fetchAdvice,
  plain,
  searchTowns,
} from '@/lib/huerta-api';
import { CROPS } from '@/lib/huerta';

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
});
