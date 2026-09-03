import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  TOOLTIP_CURSOR_BAND,
  TOOLTIP_CURSOR_LINE,
  TOOLTIP_STYLE,
} from '@/lib/chart-chrome';

const source = readFileSync('src/pages/DataPage.tsx', 'utf8');

/** Recharts styles its own chrome with hardcoded literals and only merges what
 *  a prop names, so anything left unset ships a colour this design system does
 *  not have: `#fff` behind the tooltip, `#ccc` for the hover cursor. Both are
 *  cool greys, which The Warm Ground Rule bans in either theme, and neither is
 *  reachable from a stylesheet — the fix has to be a prop, so half of this
 *  guard has to read the call sites rather than the values. */
describe('chart chrome', () => {
  const surfaces = [
    ['TOOLTIP_STYLE', TOOLTIP_STYLE],
    ['TOOLTIP_CURSOR_BAND', TOOLTIP_CURSOR_BAND],
    ['TOOLTIP_CURSOR_LINE', TOOLTIP_CURSOR_LINE],
  ] as const;

  it.each(surfaces)('%s names only tokens, never literals', (_name, style) => {
    for (const value of Object.values(style)) {
      if (typeof value !== 'string') continue;
      expect(value).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(value).not.toMatch(/\brgba?\(/);
    }
  });

  it('gives the tooltip the popover surface rather than the default white', () => {
    expect(TOOLTIP_STYLE.background).toBe('var(--popover)');
    expect(TOOLTIP_STYLE.color).toBe('var(--popover-foreground)');
  });

  // --muted is the semantic pick for a "muted fill", but it sits 0.037 from
  // --card in dark and the band all but disappeared. --border doubles that.
  it('fills the bar hover band with a step that reads in both themes', () => {
    expect(TOOLTIP_CURSOR_BAND.fill).toBe('var(--border)');
    expect(TOOLTIP_CURSOR_BAND.radius).toBeGreaterThan(0);
  });

  it('draws the continuous-chart cursor as a hairline, not a block', () => {
    expect(TOOLTIP_CURSOR_LINE.stroke).toBe('var(--border)');
    expect(TOOLTIP_CURSOR_LINE.strokeDasharray).toBeTruthy();
  });

  it('themes every tooltip surface on the page', () => {
    const tooltips = source.match(/<Tooltip\b/g) ?? [];
    const styled = source.match(/contentStyle=\{TOOLTIP_STYLE\}/g) ?? [];

    expect(tooltips.length).toBeGreaterThan(0);
    expect(styled.length).toBe(tooltips.length);
  });

  // A chart added without a cursor silently gets #ccc back — an opaque cool
  // grey block behind the hovered column, which is the defect this guards.
  it('gives every tooltip on the page a themed hover cursor', () => {
    const tooltips = source.match(/<Tooltip\b/g) ?? [];
    const cursors =
      source.match(/cursor=\{TOOLTIP_CURSOR_(?:BAND|LINE)\}/g) ?? [];

    expect(cursors.length).toBe(tooltips.length);
  });
});
