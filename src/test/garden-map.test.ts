import { describe, expect, it } from 'vitest';

import { cells, classes, grid, shapes } from '@/lib/garden-map';

describe('the garden map drawing', () => {
  it('puts each place in its cell, in its class', () => {
    // Two places on one row and one further north: lat, lon ×100.
    const area = grid(new Int16Array([4000, 0, 4000, 30, 4100, 0]));
    const cls = cells(
      area,
      new Uint8Array([110, 108, 104]),
      classes('crop').of
    ); // n, l, h
    const at = (x: number, y: number) => cls[y * area.width + x];
    expect(at(0, area.height - 1)).toBe(0); // south-west: now
    expect(at(area.width - 1, area.height - 1)).toBe(2); // east: too late
    expect(at(0, 0)).toBe(1); // north: waiting
    expect(at(area.width - 1, 0)).toBe(-1); // no place there
  });

  it('leaves no gaps along a row, though places are kept to 0.01°', () => {
    // A row 0.075° apart, rounded to hundredths as places.bin keeps them: the
    // gaps fall 0.07 and 0.08 apart, which left stripes.
    const row = Array.from({ length: 60 }, (_, i) => [
      4200,
      Math.round((-104.95 + i * 0.075) * 100),
    ]).flat();
    const area = grid(new Int16Array(row));
    const cls = cells(area, new Uint8Array(60).fill(110), classes('crop').of);
    const y = Math.floor(area.height / 2);
    const empty = Array.from({ length: area.width }, (_, x) => x).filter(
      x => cls[y * area.width + x] === -1
    );
    expect(empty).toEqual([]);
  });

  it('leaves no frost and nothing to water uncoloured, and hatches too late', () => {
    expect([0, 1, 2, 3].map(classes('frost').of)).toEqual([-1, 0, 1, 2]);
    expect([0, 1].map(classes('water').of)).toEqual([-1, 0]);
    expect(classes('soil').of(255)).toBe(-1); // no reading
    expect(classes('crop').fills[2]).toBe('hatch');
  });

  it('bands soil warmth and watering, and turns the bands round on a dark basemap', () => {
    const soil = classes('soil').of;
    expect([40 - 5, 40 + 3, 40 + 12, 40 + 30].map(soil)).toEqual([0, 1, 3, 6]);
    expect([1, 7, 34, 50].map(classes('water').of)).toEqual([0, 1, 3, 4]);
    const light = (fill: unknown) =>
      (fill as number[]).slice(0, 3).reduce((a, b) => a + b);
    const day = classes('water').fills,
      night = classes('water', true).fills;
    expect(light(day[0])).toBeGreaterThan(light(day[4]));
    expect(light(night[0])).toBeLessThan(light(night[4]));
  });

  it('traces a block of places as one rounded shape over them', () => {
    // A 5 × 5 block of places going in now, 0.075° apart.
    const block = Array.from({ length: 25 }, (_, i) => [
      Math.round((40 + Math.floor(i / 5) * 0.05) * 100),
      Math.round((10 + (i % 5) * 0.075) * 100),
    ]).flat();
    const { features } = shapes(
      grid(new Int16Array(block)),
      'crop',
      new Uint8Array(25).fill(110)
    );
    // One colour, and the forecast's limit around the same places.
    expect(features.map(f => Object.keys(f.properties))).toEqual([
      ['fill', 'opacity'],
      ['edge'],
    ]);
    expect(features[0].properties.fill).toBe('rgb(234,144,109)');
    expect(features[1].geometry.type).toBe('MultiLineString');
    const ring = features[0].geometry.coordinates[0][0] as number[][];
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    const lons = ring.map(([lon]) => lon),
      lats = ring.map(([, lat]) => lat);
    // Over the block, rounded inside its corners.
    expect(Math.min(...lons)).toBeGreaterThan(9.9);
    expect(Math.max(...lons)).toBeLessThan(10.4);
    expect(Math.min(...lats)).toBeGreaterThan(39.9);
    expect(Math.max(...lats)).toBeLessThan(40.3);
  });
});
