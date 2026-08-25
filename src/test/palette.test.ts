import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { SCORE_COLOR_RAMP } from '@/lib/scoreColor';

const css = readFileSync('src/index.css', 'utf8');

/** Every `oklch(L C H)` literal in the theme, with its hue and chroma. */
const oklchValues = [
  ...css.matchAll(/oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)/g),
].map(m => ({ lightness: +m[1], chroma: +m[2], hue: +m[3] }));

const stop = (score: number) => {
  const found = SCORE_COLOR_RAMP.find(([s]) => s === score);
  if (!found) throw new Error(`no ramp stop at ${score}`);
  return found[1];
};

describe('palette hues', () => {
  it('finds oklch values to check', () => {
    expect(oklchValues.length).toBeGreaterThan(30);
  });

  // The whole point of the palette: one brand hue, one neutral angle, and the
  // map score ramp. A new hue angle here means colour has scattered again.
  it('uses only the brand hue and the neutral angle', () => {
    const hues = [
      ...new Set(oklchValues.filter(v => v.chroma > 0).map(v => v.hue)),
    ].sort((a, b) => a - b);
    expect(hues).toEqual([90, 150]);
  });

  it('keeps every colour inside the sRGB gamut', () => {
    const outOfGamut = oklchValues.filter(({ lightness, chroma, hue }) => {
      const rad = (hue * Math.PI) / 180;
      const a = chroma * Math.cos(rad);
      const b = chroma * Math.sin(rad);
      const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
      const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
      const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
      return [
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
      ].some(channel => channel < -0.005 || channel > 1.005);
    });
    expect(outOfGamut).toEqual([]);
  });
});

describe('safety-warning tokens', () => {
  // Warnings borrow the map ramp instead of introducing a third hue, so they
  // have to stay literal ramp stops rather than drifting into their own amber.
  it.each([
    ['--status-warning', 6],
    ['--status-warning-text', 10],
    ['--status-warning-border', 8],
  ])('%s is ramp stop %i in the light theme', (token, score) => {
    const root = css.slice(css.indexOf(':root {'), css.indexOf('.dark {'));
    expect(root).toContain(`${token}: ${stop(score)};`);
  });

  it('uses a lighter ramp stop for warning text in the dark theme', () => {
    const dark = css.slice(css.indexOf('.dark {'));
    expect(dark).toContain(`--status-warning-text: ${stop(5)};`);
    expect(dark).toContain(`--status-warning-border: ${stop(8)};`);
  });
});
