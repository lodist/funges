import { describe, expect, it } from 'vitest';
import { decodeYear } from '@/lib/huerta-wire';

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
