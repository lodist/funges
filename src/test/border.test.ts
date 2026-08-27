import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// The badge shipped an `outline` variant with border-width 0 — a name
// promising a treatment it never had — and `--destructive-border` existed as a
// token that no component read.
const badge = readFileSync('src/components/ui/badge-variants.ts', 'utf8');
const button = readFileSync('src/components/ui/button.tsx', 'utf8');
const bareBorder = /(?<![\w-])border(?![\w-])/;

const variant = (src: string, name: string) => {
  const m = src.match(
    new RegExp(`(?<![\\w-])'?${name}'?:\\s*\\n?\\s*'([^']*)'`)
  );
  expect(m, `variant \`${name}\` not found`).toBeTruthy();
  return m![1];
};

describe('outline means outline', () => {
  it('badge base declares a border width, so a variant can colour it', () => {
    // Without this the colour utility resolves and paints nothing.
    expect(badge).toMatch(bareBorder);
    expect(badge).toMatch(/border-transparent/);
  });

  it('badge `outline` carries a visible stroke', () => {
    expect(variant(badge, 'outline')).toMatch(/border-primary-text/);
  });

  it('button `outline` and `enhanced-outline` carry a visible stroke', () => {
    expect(variant(button, 'outline')).toMatch(/border-primary(?![\w-])/);
    expect(variant(button, 'enhanced-outline')).toMatch(
      /border-primary(?![\w-])/
    );
  });
});

describe('--destructive-border', () => {
  it('is read by the badge in dark, where the fill alone is 2.50:1', () => {
    expect(variant(badge, 'destructive')).toMatch(
      /dark:border-destructive-border/
    );
  });
});
