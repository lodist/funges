// Source of truth: the `fill-color` `interpolate`-`linear` ramp maplibre paints for
// every species/region score layer, across every map theme (see the generated
// funges_style*.json files in public/ — src/test/scoreColor.test.ts asserts this
// ramp matches them byte-for-byte). Any UI that shows a score as a color (the
// FeatureInfoModal number, today) must reuse this instead of inventing a palette,
// so it always reads as the same color the polygon on the map is painted.
export const SCORE_COLOR_RAMP: ReadonlyArray<readonly [number, string]> = [
  [0.5, '#ffffcc'],
  [1, '#ffffcc'],
  [2, '#ffe4b5'],
  [3, '#ffdab9'],
  [4, '#fec99a'],
  [5, '#fbae7e'],
  [6, '#fa733d'],
  [7, '#fb6d51'],
  [8, '#fb4646'],
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

/** Tailwind text-color class for `score` (0-10 scale), linearly interpolated
 *  between the two nearest SCORE_COLOR_RAMP stops exactly like maplibre's
 *  `interpolate`-`linear` fill-color expression. Scores outside [0.5, 10] clamp
 *  to the nearest end color. */
export function getScoreTextColorClass(score: number): string {
  const [minScore, minHex] = SCORE_COLOR_RAMP[0];
  const [maxScore, maxHex] = SCORE_COLOR_RAMP[SCORE_COLOR_RAMP.length - 1];
  if (score <= minScore) return `text-[${minHex}]`;
  if (score >= maxScore) return `text-[${maxHex}]`;

  const exactStop = SCORE_COLOR_RAMP.find(([stopScore]) => stopScore === score);
  if (exactStop) return `text-[${exactStop[1]}]`;

  let lowerIndex = 0;
  while (
    lowerIndex < SCORE_COLOR_RAMP.length - 2 &&
    SCORE_COLOR_RAMP[lowerIndex + 1][0] <= score
  ) {
    lowerIndex++;
  }
  const [lowerScore, lowerHex] = SCORE_COLOR_RAMP[lowerIndex];
  const [upperScore, upperHex] = SCORE_COLOR_RAMP[lowerIndex + 1];

  if (lowerHex === upperHex) return `text-[${lowerHex}]`;

  const t =
    upperScore === lowerScore
      ? 0
      : (score - lowerScore) / (upperScore - lowerScore);
  const lowerRgb = hexToRgb(lowerHex);
  const upperRgb = hexToRgb(upperHex);
  const rgb = [0, 1, 2].map(i => Math.round(lerp(lowerRgb[i], upperRgb[i], t)));
  return `text-[rgb(${rgb.join(',')})]`;
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
