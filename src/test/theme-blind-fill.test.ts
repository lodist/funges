import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { sourceFiles, stripComments } from './source-scan';

// The Light-Tuned Scale Rule, enforced at the call site. `--happy-50` is an
// absolute step measured against Field Paper, so `bg-happy-50` paints the same
// near-white mint in dark as in light. Painted under `--foreground` it produced
// the SpeciesSelector hover P0: the species name at 1.01:1 and the binomial at
// 1.31:1 in dark, both of them illegible.
//
// A feature component may still reach for the literal step, but only alongside
// a dark-mode background in the same class string. Anything that has to work in
// both themes unconditionally reads a semantic token — `--secondary` here.
//
// `components/ui` is out of scope: a cva variant table spreads its dark
// handling across sibling strings, so `hover:bg-happy-50` in one compound
// variant is legitimately covered by `dark:hover:bg-*` in the base variant it
// merges with (and sorts after — see button.tsx's own note on that tie). Those
// primitives are guarded per-variant by border.test.ts and its neighbours.
const DARK_BACKGROUND = /dark:(?:[a-z-]+:)*bg-/;

const classStrings = (src: string): string[] =>
  [...stripComments(src).matchAll(/'([^']*)'|"([^"]*)"/g)].map(
    m => m[1] ?? m[2]
  );

describe('the light-tuned scale never paints a theme-blind fill', () => {
  it('pairs every bg-happy-50 with a dark-mode background', () => {
    const offenders = sourceFiles('src')
      .filter(
        f =>
          !f.includes('.stories.') &&
          !f.includes('/test/') &&
          !f.includes('/components/ui/')
      )
      .flatMap(f =>
        classStrings(readFileSync(f, 'utf8'))
          .filter(s => /bg-happy-50(?!\d)/.test(s))
          .filter(s => !DARK_BACKGROUND.test(s))
          .map(s => `${f}: ${s}`)
      );

    expect(offenders).toEqual([]);
  });

  // The same defect with a blunter instrument. The fullscreen selector's
  // category chips were `bg-white` under `text-foreground`, which in dark put
  // all six labels at 1.18:1 — not dim, gone. `--card` is the theme-aware
  // near-white, and reads 10.2:1 there.
  it('never pairs a hardcoded bg-white with a theme-aware text token', () => {
    const offenders = sourceFiles('src')
      .filter(
        f =>
          !f.includes('.stories.') &&
          !f.includes('/test/') &&
          !f.includes('/components/ui/')
      )
      .flatMap(f =>
        classStrings(readFileSync(f, 'utf8'))
          .filter(s => /(^|\s)(hover:)?bg-white(\/\d+)?(\s|$)/.test(s))
          .filter(s => /text-foreground|text-muted-foreground/.test(s))
          .filter(s => !DARK_BACKGROUND.test(s))
          .map(s => `${f}: ${s}`)
      );

    expect(offenders).toEqual([]);
  });
});
