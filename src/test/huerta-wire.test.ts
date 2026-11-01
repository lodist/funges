import { describe, expect, it } from 'vitest';
import { decodeAdvice, decodeYear } from '@/lib/huerta-wire';

describe("the Worker's advice answer", () => {
  const body = {
    day: '2026-11-04',
    crops: ['potato'],
    place: {
      name: 'Zug',
      frost: '',
      soil: 9,
      nights: 5,
      rain: 4,
      water: 0,
      statuses: 'n',
      blight: 6,
    },
  };

  it("keeps the night's blight bits when it has them", () => {
    expect(decodeAdvice(body).blight).toBe(6);
    const older = { ...body, place: { ...body.place, blight: undefined } };
    expect('blight' in decodeAdvice(older)).toBe(false);
  });

  it("reads the past week's coldest hours; a blight the night did not work out is none", () => {
    // (C + 30) x 2: 48 is -6 C, 255 unknown.
    const lows = ['2026-11-02', btoa(String.fromCharCode(48, 255, 61))];
    const advice = decodeAdvice({
      ...body,
      place: { ...body.place, blight: null, lows: lows as [string, string] },
    });
    expect(advice.lows).toEqual({ start: '2026-11-02', t: [-6, null, 0.5] });
    expect('blight' in advice).toBe(false);
  });
});

describe("the Worker's year answer", () => {
  it('reads six hex digits per crop, the temperatures and the soil', () => {
    const year = decodeYear({
      crops: ['garlic', 'tomato'],
      place: {
        name: 'Madrid',
        months: '0c0300' + '070070',
        temps: [6],
        soil: [7.8, 22, 41],
      },
    });
    expect(year).toEqual({
      place: 'Madrid',
      temps: [6],
      soil: { ph: 7.8, clay: 22, sand: 41 },
      crops: {
        garlic: { sow: 0x0c0, harvest: 0x300 },
        tomato: { sow: 0x070, harvest: 0x070 },
      },
    });
  });

  it('reads each season of a crop sown in more than one', () => {
    const year = decodeYear({
      crops: ['lettuce', 'spinach'],
      place: {
        name: 'Zug',
        months: '0f807e' + '6f8ff8',
        // Spinach: spring (Apr-May, picked Jun-Jul) and to overwinter
        // (Sep-Oct, picked the next Apr-Jul).
        seasons: { 1: '0018060' + '4300078' },
      },
    });
    expect(year.crops.lettuce).toEqual({ sow: 0x0f8, harvest: 0x07e });
    expect(year.crops.spinach.seasons).toEqual([
      { season: 'spring', sow: 0x018, harvest: 0x060 },
      { season: 'overwinter', sow: 0x300, harvest: 0x078 },
    ]);
  });

  it('has no soil where the soil map has none', () => {
    expect(
      decodeYear({ crops: [], place: { name: 'Sea', months: '' } }).soil
    ).toBeNull();
  });

  it("reads the place's climate and the crops' hardiness", () => {
    const year = decodeYear({
      crops: ['garlic', 'melon'],
      hardy: [-35, null],
      place: {
        name: 'Valencia',
        months: '0c0300' + '070070',
        climate: [0, 0, 0, 0, 93, 324, 120, 306, 2],
      },
    });
    expect(year.climate).toEqual({
      frost: null,
      hard: null,
      warm10: [93, 324],
      warm13: [120, 306],
      low: 2,
    });
    expect(year.hardy).toEqual({ garlic: -35, melon: null });
    expect(
      decodeYear({
        crops: [],
        place: {
          name: 'Zurich',
          months: '',
          climate: [293, 110, 324, 60, 0, 0, 0, 0, null],
        },
      }).climate
    ).toEqual({
      frost: [293, 110],
      hard: [324, 60],
      warm10: null,
      warm13: null,
      low: null,
    });
  });
});
