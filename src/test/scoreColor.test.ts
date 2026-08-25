import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  SCORE_COLOR_RAMP,
  getScoreColor,
  getScoreGradientCss,
} from '@/lib/scoreColor';

const PUBLIC_DIR = path.resolve(process.cwd(), 'public');

interface StyleLayer {
  paint?: { 'fill-color'?: unknown };
}

interface Style {
  layers: StyleLayer[];
}

function loadStyle(name: string): Style {
  const raw = fs.readFileSync(path.join(PUBLIC_DIR, name), 'utf-8');
  return JSON.parse(raw) as Style;
}

// Normalizes any color the `interpolate` expression may hold ('#rrggbb' or
// 'rgb(r, g, b)') to a lowercase '#rrggbb' string for comparison.
function toHex(color: unknown): string {
  if (typeof color !== 'string') throw new Error('expected a string color');
  if (color.startsWith('#')) return color.toLowerCase();
  const match = color.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
  if (!match) throw new Error(`unrecognized color format: ${color}`);
  const [r, g, b] = match.slice(1).map(Number);
  return `#${[r, g, b].map(n => n.toString(16).padStart(2, '0')).join('')}`;
}

describe('SCORE_COLOR_RAMP', () => {
  // Every species/region score layer, across every theme, paints its fill-color
  // via the exact same `interpolate`-`linear` ramp from score 0.5 to 10 (only the
  // near-transparent score-0 stop's alpha wobbles slightly, and score 0 rows never
  // reach the UI anyway — FeatureInfoModal filters them out). This test guards
  // against SCORE_COLOR_RAMP silently drifting from that real, shipped ramp.
  it('matches the fill-color ramp baked into every generated map style', () => {
    const styleFiles = [
      'funges_style.json',
      'funges_style_dark.json',
      'funges_style_darkmatter.json',
      'funges_style_positron.json',
      'funges_style_topographic.json',
    ];

    for (const fileName of styleFiles) {
      const style = loadStyle(fileName);
      let checked = 0;

      for (const layer of style.layers) {
        const fillColor = layer.paint?.['fill-color'];
        if (!Array.isArray(fillColor) || fillColor[0] !== 'interpolate')
          continue;

        const stops = fillColor.slice(3) as unknown[];
        const byScore = new Map<number, string>();
        for (let i = 0; i < stops.length; i += 2) {
          const score = stops[i] as number;
          if (score === 0) continue; // translucent "no data" stop, not modeled
          byScore.set(score, toHex(stops[i + 1]));
        }

        for (const [score, hex] of SCORE_COLOR_RAMP) {
          expect(byScore.get(score)).toBe(hex);
        }
        checked++;
      }

      expect(checked).toBeGreaterThan(0);
    }
  });
});

describe('getScoreColor', () => {
  it('returns the exact ramp color at each authored stop', () => {
    expect(getScoreColor(0.5)).toBe('#ffffcc');
    expect(getScoreColor(6)).toBe('#fa733d');
    expect(getScoreColor(10)).toBe('#800020');
  });

  it('linearly interpolates between the two nearest stops, matching maplibre', () => {
    // Halfway between the 9 (#a60310) and 10 (#800020) stops.
    expect(getScoreColor(9.5)).toBe('rgb(147, 2, 24)');
  });

  it('clamps scores outside the authored 0.5-10 range', () => {
    expect(getScoreColor(0)).toBe('#ffffcc');
    expect(getScoreColor(15)).toBe('#800020');
  });
});

describe('getScoreGradientCss', () => {
  it('places every ramp stop at its proportional position, low to high', () => {
    const css = getScoreGradientCss();
    expect(css).toBe(
      'linear-gradient(to right, #ffffcc 0.00%, #ffffcc 5.26%, #ffe4b5 15.79%, ' +
        '#ffdab9 26.32%, #fec99a 36.84%, #fbae7e 47.37%, #fa733d 57.89%, ' +
        '#fb6d51 68.42%, #fb4646 78.95%, #a60310 89.47%, #800020 100.00%)'
    );
  });
});
