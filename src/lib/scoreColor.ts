// Source of truth: the `fill-color` `interpolate`-`linear` ramp maplibre paints for
// every species/region score layer, across every map theme (see the generated
// funges_style*.json files in public/ — src/test/scoreColor.test.ts asserts this
// ramp matches them byte-for-byte). Any UI that shows a score as a color (the
// FeatureInfoModal number, today) must reuse this instead of inventing a palette,
// so it always reads as the same color the polygon on the map is painted.
//
// The stops step lightness (OKLab L) evenly, about 0.07 a point, so 50% already reads as a
// strong orange and red starts at 60%. The earlier ramp spent 1-5 on near-identical creams
// and peaches (5 was #fbae7e), gave 6 and 7 the same colour, and then dropped sharply at 9.
export const SCORE_COLOR_RAMP: ReadonlyArray<readonly [number, string]> = [
  [0.5, '#ffffcc'],
  [1, '#ffffcc'],
  [2, '#ffddad'],
  [3, '#fdbe8f'],
  [4, '#fc9d6b'],
  [5, '#fa7741'],
  [6, '#f64343'],
  [7, '#d93032'],
  [8, '#bd1c20'],
  [9, '#a60310'],
  [10, '#800020'],
];

function hexToRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** The ramp colour for `score` (0-10 scale), linearly interpolated between the
 *  two nearest SCORE_COLOR_RAMP stops exactly like maplibre's
 *  `interpolate`-`linear` fill-color expression, so a swatch in the UI matches
 *  the polygon on the map. Scores outside [0.5, 10] clamp to the nearest end.
 *
 *  Returns a CSS colour for `style`, not a Tailwind class. It used to return
 *  `text-[rgb(…)]`, which Tailwind can never emit: the string is built at
 *  runtime from an interpolation, so it appears nowhere in the source Tailwind
 *  scans and no safelist covers it. Every score rendered with the inherited
 *  text colour instead. The pale end of the ramp (#ffffcc, 1.1:1 on paper)
 *  could not have been used as a text colour anyway. */
export function getScoreColor(score: number): string {
  const [minScore, minHex] = SCORE_COLOR_RAMP[0];
  const [maxScore, maxHex] = SCORE_COLOR_RAMP[SCORE_COLOR_RAMP.length - 1];
  if (score <= minScore) return minHex;
  if (score >= maxScore) return maxHex;

  const exactStop = SCORE_COLOR_RAMP.find(([stopScore]) => stopScore === score);
  if (exactStop) return exactStop[1];

  let lowerIndex = 0;
  while (
    lowerIndex < SCORE_COLOR_RAMP.length - 2 &&
    SCORE_COLOR_RAMP[lowerIndex + 1][0] <= score
  ) {
    lowerIndex++;
  }
  const [lowerScore, lowerHex] = SCORE_COLOR_RAMP[lowerIndex];
  const [upperScore, upperHex] = SCORE_COLOR_RAMP[lowerIndex + 1];

  if (lowerHex === upperHex) return lowerHex;

  const t =
    upperScore === lowerScore
      ? 0
      : (score - lowerScore) / (upperScore - lowerScore);
  const lowerRgb = hexToRgb(lowerHex);
  const upperRgb = hexToRgb(upperHex);
  const rgb = [0, 1, 2].map(i => Math.round(lerp(lowerRgb[i], upperRgb[i], t)));
  return `rgb(${rgb.join(', ')})`;
}

/** CSS `linear-gradient` reproducing the full SCORE_COLOR_RAMP, low to high —
 *  for legends that show the score scale as a bar, so it's a faithful preview
 *  of the map's actual colors instead of an approximated 2-stop gradient. */
export function getScoreGradientCss(): string {
  const [minScore] = SCORE_COLOR_RAMP[0];
  const [maxScore] = SCORE_COLOR_RAMP[SCORE_COLOR_RAMP.length - 1];
  const stops = SCORE_COLOR_RAMP.map(([score, hex]) => {
    const percent = ((score - minScore) / (maxScore - minScore)) * 100;
    return `${hex} ${percent.toFixed(2)}%`;
  });
  return `linear-gradient(to right, ${stops.join(', ')})`;
}
