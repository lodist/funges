import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { SCORE_COLOR_RAMP } from '@/lib/scoreColor';

// Comments stripped: a value named in prose to explain why it was replaced
// is not a colour the theme ships.
const css = readFileSync('src/index.css', 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  ''
);

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
  //
  // Hue 28 is the first sanctioned exception (#225): destructive actions. The
  // green stand-in it replaced made a delete look like a confirm, and red is
  // the foraging domain's own "do not eat" signal rather than a generic UI
  // convention. It is a single angle, used only by the --destructive tokens.
  //
  // Hues 55 and 245 are the second (#246): the DataPage measurement charts.
  // Species categories are identity and stay on the brand ramp, but a chart
  // plotting temperature, rainfall and pressure encodes physical quantity, and
  // warm-versus-cool IS that reading. Five steps of one hue put max/avg/min
  // 0.07 apart in lightness on a shared axis, which is not separable at a
  // 1.5px stroke. They are used only by the --chart-* tokens.
  //
  // Six angles is where this stops being a rule. If a seventh appears, colour
  // has scattered and this test should fail.
  it('uses only the brand, neutral, danger and measurement hues', () => {
    const hues = [
      ...new Set(oklchValues.filter(v => v.chroma > 0).map(v => v.hue)),
    ].sort((a, b) => a - b);
    expect(hues).toEqual([28, 55, 90, 150, 245]);
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

/** oklch -> linear sRGB, the same transform the gamut check above inlines. */
function oklchToLinearRgb(L: number, C: number, H: number) {
  const rad = (H * Math.PI) / 180;
  const a = C * Math.cos(rad);
  const b = C * Math.sin(rad);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map(v => Math.min(1, Math.max(0, v)));
}

const luminance = (L: number, C: number, H: number) => {
  const [r, g, b] = oklchToLinearRgb(L, C, H);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a: number, b: number) =>
  a > b ? (a + 0.05) / (b + 0.05) : (b + 0.05) / (a + 0.05);

/** The `oklch(...)` triple a token holds in one theme block. */
const token = (theme: 'light' | 'dark', name: string) => {
  const darkAt = css.indexOf('.dark {');
  const block =
    theme === 'light'
      ? css.slice(css.indexOf(':root {'), darkAt)
      : css.slice(darkAt);
  const match = new RegExp(
    `${name}: oklch\\(([\\d.]+) ([\\d.]+) ([\\d.]+)\\)`
  ).exec(block);
  if (!match) throw new Error(`no ${name} in the ${theme} theme`);
  return [+match[1], +match[2], +match[3]] as const;
};

describe('measurement chart family', () => {
  const CHART = ['--chart-warm', '--chart-brand', '--chart-cool'];

  // Hue does the separating for normal vision, but it collapses twice: amber
  // and green merge for red-green deficiency, green and blue for blue-yellow.
  // Lightness is what still separates the series there, so the stagger is load
  // bearing rather than cosmetic — flatten it and the charts fail the readers
  // who need them most. (DataPage's dash patterns are the third channel.)
  it.each(['light', 'dark'] as const)(
    'staggers chart lightness in the %s theme',
    theme => {
      const steps = CHART.map(name => token(theme, name)[0]).sort(
        (a, b) => a - b
      );
      // Rounded: the tokens are authored to 2dp, so a 0.10 step subtracts to
      // 0.09999999999999998 and float noise is not a palette regression.
      const gaps = steps.slice(1).map((v, i) => +(v - steps[i]).toFixed(3));
      for (const gap of gaps) expect(gap).toBeGreaterThanOrEqual(0.1);
    }
  );

  // WCAG 1.4.11: a plotted line is a graphical object, floor 3:1. Field use is
  // sunlit and one-handed, so this is a hard limit, not a target.
  it.each(['light', 'dark'] as const)(
    'clears the 3:1 non-text floor on --card in the %s theme',
    theme => {
      const card = luminance(...token(theme, '--card'));
      for (const name of CHART) {
        const ratio = contrast(luminance(...token(theme, name)), card);
        expect(ratio, `${name} on --card (${theme})`).toBeGreaterThanOrEqual(3);
      }
    }
  );
});

describe('hue rule coverage', () => {
  // The hue assertion above only reads `oklch()` literals, so for a long time
  // a coloured token written as hex sat outside the One Hue Rule entirely —
  // which is how the warning ramp stops went unnoticed. This closes that:
  // every hex token must be either a deliberate ramp borrowing or achromatic
  // (white, black, or a pure grey), never a new hue smuggled in as hex.
  const rampStops = new Set(
    SCORE_COLOR_RAMP.map(([, hex]) => hex.toLowerCase())
  );

  const isAchromatic = (hex: string) => {
    const h = hex.replace('#', '');
    const full =
      h.length === 3
        ? h
            .split('')
            .map(c => c + c)
            .join('')
        : h;
    const [r, g, b] = [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16));
    return r === g && g === b;
  };

  it('declares no chromatic colour as a hex literal', () => {
    const offenders = [
      ...css.matchAll(/^\s*(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/gm),
    ]
      .map(m => ({ token: m[1], hex: m[2] }))
      .filter(
        ({ hex }) => !rampStops.has(hex.toLowerCase()) && !isAchromatic(hex)
      );

    expect(offenders).toEqual([]);
  });
});
