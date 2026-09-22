import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

interface StyleLayer {
  id: string;
  source?: string;
  type?: string;
  paint?: Record<string, unknown>;
}

interface Style {
  layers: StyleLayer[];
}

const PUBLIC_DIR = path.resolve(process.cwd(), 'public');

function loadStyle(name: string): Style {
  const raw = fs.readFileSync(path.join(PUBLIC_DIR, name), 'utf-8');
  return JSON.parse(raw) as Style;
}

// The app drives species/forecast overlays and region layers by id across every
// theme, so every generated style must carry the exact same overlay layer set
// as the hand-authored base style (only the basemap differs).
const BASE = loadStyle('funges_style.json');
const REQUIRED_LAYER_IDS = BASE.layers
  .filter(layer => (layer.source ?? '').startsWith('overlay'))
  .map(layer => layer.id);

describe('generated theme style completeness', () => {
  it('the base style has region overlay layers to assert against', () => {
    expect(REQUIRED_LAYER_IDS.length).toBeGreaterThan(0);
    for (const region of ['ne', 'se', 'use', 'usw']) {
      expect(REQUIRED_LAYER_IDS.some(id => id.endsWith(`_${region}`))).toBe(
        true
      );
      expect(
        REQUIRED_LAYER_IDS.some(id => id.endsWith(`_${region}_numbers`))
      ).toBe(true);
    }
  });

  it.each([
    'funges_style_positron.json',
    'funges_style_darkmatter.json',
    'funges_style_topographic.json',
  ])('%s contains every required overlay layer id', fileName => {
    const style = loadStyle(fileName);
    const ids = new Set(style.layers.map(layer => layer.id));
    const missing = REQUIRED_LAYER_IDS.filter(id => !ids.has(id));
    expect(missing).toEqual([]);
  });

  // Below ~z7 a forecast cell is sub-pixel, and an un-antialiased sub-pixel fill is
  // all-or-nothing per pixel, so the continent reads as pale speckle. scripts/add-overlay-
  // to-style.cjs applies LOW_ZOOM_FILL to fix that — but it re-imports the paint verbatim
  // from the live Mapbox style, so a re-run that lost the transform would silently revert
  // every theme to the speckle. Assert the ramp is there instead of finding out on the map.
  it.each([
    'funges_style.json',
    'funges_style_dark.json',
    'funges_style_positron.json',
    'funges_style_darkmatter.json',
    'funges_style_topographic.json',
  ])('%s antialiases and opacifies overlay fills at low zoom', fileName => {
    const fills = loadStyle(fileName).layers.filter(
      layer =>
        layer.type === 'fill' && (layer.source ?? '').startsWith('overlay')
    );
    expect(fills.length).toBeGreaterThan(0);
    for (const layer of fills) {
      expect(layer.paint?.['fill-antialias']).toEqual([
        'step',
        ['zoom'],
        true,
        8,
        false,
      ]);
      expect(layer.paint?.['fill-opacity']).toEqual([
        'interpolate',
        ['linear'],
        ['zoom'],
        5,
        1,
        8,
        0.85,
      ]);
    }
  });

  it('funges_style_topographic.json additionally styles trail/track paths', () => {
    const style = loadStyle('funges_style_topographic.json');
    const trail = style.layers.find(layer => layer.id === 'trail') as
      | (StyleLayer & { minzoom?: number })
      | undefined;
    expect(trail).toBeDefined();
    expect(trail?.minzoom).toBeLessThanOrEqual(9);
  });
});
