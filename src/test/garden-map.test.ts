import { describe, expect, it } from 'vitest';

import { colour, grid, paint } from '@/lib/garden-map';

describe('the garden map drawing', () => {
  it('paints each place as a cell where it sits, in its layer colour', () => {
    // Two places on one row and one further north: lat, lon ×100.
    const area = grid(new Int16Array([4000, 0, 4000, 30, 4100, 0]));
    const pixels = paint(area, 'crop', new Uint8Array([110, 108, 104])); // n, l, h
    const at = (x: number, y: number) =>
      Array.from(
        pixels.slice((y * area.width + x) * 4, (y * area.width + x) * 4 + 4)
      );
    expect(at(1, area.height - 2)).toEqual(colour('crop', 110)); // south-west: now
    expect(at(area.width - 2, area.height - 2)).toEqual(colour('crop', 108)); // east: too late
    expect(at(1, 1)).toEqual(colour('crop', 104)); // north: waiting
    expect(at(area.width - 2, 1)).toEqual([0, 0, 0, 0]); // no place there
  });

  it('leaves out places with no frost, no reading, or nothing to water', () => {
    expect(colour('frost', 0)).toBeNull();
    expect(colour('soil', 255)).toBeNull();
    expect(colour('water', 0)).toBeNull();
    expect(colour('soil', 40 + 30)).toEqual(colour('soil', 40 + 26)); // warmest stop
  });
});
