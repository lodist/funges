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
});
