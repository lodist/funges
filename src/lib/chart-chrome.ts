/** Shared Recharts chrome for the DataPage charts.
 *
 *  Recharts styles its own chrome with hardcoded literals and merges only what
 *  a prop names, so every surface left unset ships a colour this design system
 *  does not have. Both defaults are cool greys, which The Warm Ground Rule bans
 *  in either theme, and neither is reachable from a stylesheet — the fix has to
 *  be a prop, which is why these are objects rather than CSS.
 *
 *  Every `<Tooltip>` takes TOOLTIP_STYLE plus one of the two cursors.
 *  `src/test/chart-chrome.test.ts` fails if a chart is added without them.
 */

/* Recharts defaults this surface to a hardcoded white with near-black text and
   only merges what `contentStyle` names — so leaving the ground unset painted
   #fff in both themes. Light mode read as a cool white against Field Paper's
   warm off-white, and dark mode was worse than wrong: the series values inside
   are drawn in their own stroke colour, and the dark chart tokens are bright by
   design (--chart-warm is L 0.84), so they landed on white at ~1.4:1. Naming
   the popover surface fixes both, and puts the series colours back on the
   ground their contrast was verified against. */
export const TOOLTIP_STYLE = {
  borderRadius: 8,
  fontSize: 12,
  background: 'var(--popover)',
  color: 'var(--popover-foreground)',
  border: '1px solid var(--border)',
  boxShadow: 'var(--elevation-floating)',
  padding: '6px 10px',
} as const;

/* Recharts' default cursor is a hardcoded #ccc — a cool grey, which The Warm
   Ground Rule bans in either theme, and on the bar charts it painted a flat
   grey block behind the hovered column. Both shapes are themed here rather
   than at six call sites: a band for category charts, a hairline for the
   continuous ones, and the bars' own corner radius so the hover state reads as
   designed rather than as a default rectangle.

   Both take --border. The obvious pick for the band was --muted, the "muted
   fill / inactive track" token, but it sits 0.037 from --card in dark and the
   band all but disappeared; --border is the strongest neutral step below a
   real surface and roughly doubles that to 0.062, while staying hue 90 in both
   themes. There is no token for "highlighted category band" and one value does
   not earn one. */
export const TOOLTIP_CURSOR_BAND = {
  fill: 'var(--border)',
  radius: 4,
} as const;

export const TOOLTIP_CURSOR_LINE = {
  stroke: 'var(--border)',
  strokeWidth: 1,
  strokeDasharray: '3 3',
} as const;
