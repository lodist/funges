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

  it('leaves no gaps along a row, though places are kept to 0.01°', () => {
    // A row 0.075° apart, rounded to hundredths as places.bin keeps them: the
    // gaps fall 0.07 and 0.08 apart, which left one-pixel stripes.
    const row = Array.from({ length: 60 }, (_, i) => [
      4200,
      Math.round((-104.95 + i * 0.075) * 100),
    ]).flat();
    const area = grid(new Int16Array(row));
    const pixels = paint(area, 'crop', new Uint8Array(60).fill(110));
    const y = Math.floor(area.height / 2);
    const empty = Array.from({ length: area.width }, (_, x) => x).filter(
      x => pixels[(y * area.width + x) * 4 + 3] === 0
    );
    expect(empty).toEqual([]);
  });

  it('leaves out places with no frost, no reading, or nothing to water', () => {
    expect(colour('frost', 0)).toBeNull();
    expect(colour('soil', 255)).toBeNull();
    expect(colour('water', 0)).toBeNull();
    expect(colour('soil', 40 + 30)).toEqual(colour('soil', 40 + 26)); // warmest stop
  });
});
