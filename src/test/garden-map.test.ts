import { describe, expect, it } from 'vitest';

import { bands, field, grid, shapes, smoothed } from '@/lib/garden-map';

/** A rectangle of places, `cols` × `rows`, 0.075° apart along rows. */
const block = (cols: number, rows: number) =>
  new Int16Array(
    Array.from({ length: cols * rows }, (_, i) => [
      Math.round((40 + Math.floor(i / cols) * 0.05) * 100),
      Math.round((10 + (i % cols) * 0.075) * 100),
    ]).flat()
  );
const area = (ring: number[][]) =>
  Math.abs(
    ring
      .slice(0, -1)
      .reduce((s, [x, y], i) => s + x * ring[i + 1][1] - ring[i + 1][0] * y, 0)
  ) / 2;

describe('the garden map drawing', () => {
  it('puts each place in its cell, with its value', () => {
    // Two places on one row and one further north: lat, lon ×100.
    const region = grid(new Int16Array([4000, 0, 4000, 30, 4100, 0]));
    const cells = field(
      region,
      new Uint8Array([110, 108, 104]), // n, l, h
      bands('crop').value
    );
    const at = (x: number, y: number) => cells[y * region.width + x];
    expect(at(0, region.height - 1)).toBe(0); // south-west: now
    expect(at(region.width - 1, region.height - 1)).toBe(2); // east: too late
    expect(at(0, 0)).toBe(1); // north: waiting
    expect(at(region.width - 1, 0)).toBeNaN(); // no place there
  });

  it('leaves no gaps along a row, though places are kept to 0.01°', () => {
    // A row 0.075° apart, rounded to hundredths as places.bin keeps them: the
    // gaps fall 0.07 and 0.08 apart, which left stripes.
    const row = Array.from({ length: 60 }, (_, i) => [
      4200,
      Math.round((-104.95 + i * 0.075) * 100),
    ]).flat();
    const region = grid(new Int16Array(row));
    const cells = field(
      region,
      new Uint8Array(60).fill(110),
      bands('crop').value
    );
    const y = Math.floor(region.height / 2);
    const empty = Array.from({ length: region.width }, (_, x) => x).filter(x =>
      Number.isNaN(cells[y * region.width + x])
    );
    expect(empty).toEqual([]);
  });

  it('closes a row the places skip', () => {
    // Rows at 40.00 and 40.04 at 10 C, and at 40.21 at 14 C, twelve places
    // long: past the rows' reach one row of cells has no place.
    const rows = [4000, 4004, 4021].flatMap(lat =>
      Array.from({ length: 12 }, (_, i) => [
        lat,
        1000 + Math.round(i * 7.5),
      ]).flat()
    );
    const bytes = new Uint8Array(36).map((_, i) => (i < 24 ? 50 : 54));
    const region = grid(new Int16Array(rows));
    const cells = field(region, bytes, bands('soil').value);
    const x = Math.floor(region.width / 2);
    const column = Array.from(
      { length: region.height },
      (_, y) => cells[y * region.width + x]
    );
    expect(column.filter(Number.isNaN)).toEqual([]);
    expect(column).toContain(12); // the skipped row: between its neighbours
  });

  it('a lone place fades into its neighbours; the edge of the places stays', () => {
    const w = 5,
      h = 5;
    const cells = new Float32Array(w * h).fill(0);
    cells[2 * w + 2] = 2; // one too late among places going in now
    cells[0] = NaN; // no place in a corner
    const out = smoothed(cells, w, h, 1);
    expect(out[2 * w + 2]).toBeLessThan(0.5); // below "not yet": gone
    expect(out[0]).toBeNaN();
  });

  it('reads each byte as its value', () => {
    expect(bands('soil').value(40 + 12)).toBe(12);
    expect(bands('cold').value(40 - 3)).toBe(-3);
    expect(bands('balance').value(100 - 10)).toBe(-10);
    expect(bands('soil').value(255)).toBeNaN();
    // The old frost codes by how hard: none, later, ground frost, frost.
    expect([0, 3, 1, 2].map(bands('frost').value)).toEqual([0, 1, 2, 3]);
    expect(bands('water').fills[0]).toBeNull(); // nothing to water: no colour
  });

  it('turns the ramps round on a dark basemap', () => {
    const light = (fill: unknown) =>
      (fill as number[]).slice(0, 3).reduce((a, b) => a + b);
    const day = bands('balance').fills,
      night = bands('balance', true).fills;
    // Dry to wet: the neutral middle is the lightest by day, the darkest by night.
    expect(light(day[5])).toBeGreaterThan(light(day[0]));
    expect(light(night[5])).toBeLessThan(light(night[0]));
  });

  it('a lake with no places stays out of every band, with no empty polygons', () => {
    // A 9 × 9 block, the middle 5 × 5 without places (a lake: one 3 places
    // across draws as a seam at this grid's size, and is closed).
    const all = block(9, 9);
    const kept = Array.from({ length: 81 }, (_, i) => i).filter(
      i =>
        !(
          Math.floor(i / 9) >= 2 &&
          Math.floor(i / 9) <= 6 &&
          i % 9 >= 2 &&
          i % 9 <= 6
        )
    );
    const places = new Int16Array(
      kept.flatMap(i => [all[2 * i], all[2 * i + 1]])
    );
    const { features } = shapes(
      grid(places),
      'soil',
      new Uint8Array(kept.length).fill(40 + 12)
    );
    const fills = features.filter(f => f.properties.fill);
    expect(fills).toHaveLength(1);
    const polygons = fills[0].geometry.coordinates as number[][][][];
    // One polygon: the places, with the lake as its hole.
    expect(polygons).toHaveLength(1);
    expect(polygons[0]).toHaveLength(2);
    expect(area(polygons[0][1])).toBeGreaterThan(0);
  });

  it('neighbouring bands share their edge: together they fill the places', () => {
    // Ten columns: the west five going in now, the east five not yet.
    const bytes = new Uint8Array(
      Array.from({ length: 60 }, (_, i) => (i % 10 < 5 ? 110 : 102)) // n, f
    );
    const { features } = shapes(grid(block(10, 6)), 'crop', bytes);
    expect(features.map(f => Object.keys(f.properties).sort())).toEqual([
      ['fill', 'opacity'],
      ['fill', 'opacity'],
      ['edge'],
    ]);
    expect(features[0].properties.fill).toBe('rgb(234,144,109)');
    const polygonArea = (i: number) =>
      (features[i].geometry.coordinates as number[][][][])
        .flat()
        .reduce((s, ring, k) => s + (k === 0 ? area(ring) : -area(ring)), 0);
    const limit = area((features[2].geometry.coordinates as number[][][])[0]);
    expect(polygonArea(0) + polygonArea(1)).toBeCloseTo(limit, 2);
  });

  it('winds outer rings counter-clockwise and holes clockwise, as MapLibre reads them', () => {
    // Cold to the west, mild in the middle, cold again to the east: the
    // middle band's outer ring was traced as a hole of the cut above it.
    const bytes = new Uint8Array(
      Array.from({ length: 81 }, (_, i) =>
        Math.abs((i % 9) - 4) < 2 ? 40 + 9 : 40 - 6
      )
    );
    const { features } = shapes(grid(block(9, 9)), 'cold', bytes);
    const signed = (ring: number[][]) =>
      ring
        .slice(0, -1)
        .reduce(
          (s, [x, y], i) => s + x * ring[i + 1][1] - ring[i + 1][0] * y,
          0
        );
    for (const f of features.filter(f => f.properties.fill))
      for (const polygon of f.geometry.coordinates as number[][][][]) {
        expect(signed(polygon[0])).toBeGreaterThan(0);
        for (const hole of polygon.slice(1))
          expect(signed(hole)).toBeLessThan(0);
      }
  });
});
