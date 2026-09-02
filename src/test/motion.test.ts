import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

import {
  DURATION_FAST,
  DURATION_BASE,
  DURATION_SLOW,
  EASE_STANDARD,
} from '@/lib/motion';

/**
 * Motion (#225). DESIGN.md says three durations and one curve and everything
 * references them. Four separate things made that false, and none of them is
 * visible to TypeScript, to the axe gate, or to a screenshot:
 *
 *  - `duration-*` IS a Tailwind theme namespace (`--transition-duration-*`).
 *    A comment claiming otherwise cost 31 arbitrary-value call sites.
 *  - 20 bare `transition-*` utilities rode Tailwind's own 150ms default,
 *    which matched `--transition-duration-fast` by coincidence and would not
 *    have followed a retune.
 *  - framer-motion writes inline transforms from JS, so the global CSS
 *    reduced-motion rule never reached them; its own default is
 *    `reducedMotion: 'never'`.
 *  - framer-motion discards `duration` when stiffness/damping are set, so
 *    four call sites carried a dead number and a comment promising it
 *    mirrored a token.
 *
 * Each `it` below fails if one of those is reintroduced.
 */
const indexCss = readFileSync('src/index.css', 'utf8');
const globalsScss = readFileSync('src/styles/globals.scss', 'utf8');
const rootRoute = readFileSync('src/routes/__root.tsx', 'utf8');

const sources = readdirSync('src', { recursive: true, encoding: 'utf8' })
  .map(p => p.replace(/\\/g, '/'))
  .filter(
    p => /\.(tsx?|css|scss|mdx)$/.test(p) && !p.endsWith('motion.test.ts')
  )
  .map(p => [`src/${p}`, readFileSync(`src/${p}`, 'utf8')] as const);

const themeBlock = indexCss.match(/@theme[^{]*\{([\s\S]*?)\n\}/)?.[1] ?? '';
const rootBlock = indexCss.match(/\n:root\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';

const SCALE = [
  ['fast', '150ms', DURATION_FAST],
  ['base', '200ms', DURATION_BASE],
  ['slow', '300ms', DURATION_SLOW],
] as const;

describe('the motion scale is the Tailwind duration namespace', () => {
  it.each(SCALE)('--transition-duration-%s is registered in @theme', name => {
    // Declared only in :root, the variable resolves but `duration-<name>`
    // is never emitted — every call site falls back to an arbitrary value.
    expect(themeBlock).toMatch(
      new RegExp(`--transition-duration-${name}\\s*:`)
    );
  });

  it.each(SCALE)(
    '--transition-duration-%s carries its concrete value in :root',
    (name, value) => {
      // @theme inline emits `var(--transition-duration-x)` into the utility,
      // so :root has to be where the number actually lives.
      expect(rootBlock).toMatch(
        new RegExp(`--transition-duration-${name}\\s*:\\s*${value}\\s*;`)
      );
    }
  );

  it('registers --ease-standard so `ease-standard` exists', () => {
    expect(themeBlock).toMatch(/--ease-standard\s*:/);
    expect(rootBlock).toMatch(
      /--ease-standard:\s*cubic-bezier\(0\.4,\s*0,\s*0\.2,\s*1\)/
    );
  });

  it('points Tailwind’s transition defaults at the scale', () => {
    expect(themeBlock).toMatch(
      /--default-transition-duration:\s*var\(--transition-duration-\w+\)/
    );
    expect(themeBlock).toMatch(
      /--default-transition-timing-function:\s*var\(--ease-standard\)/
    );
  });

  it('has no --duration-* left: one role, one name', () => {
    const stragglers = sources.filter(([, s]) => /--duration-\w/.test(s));
    expect(stragglers.map(([p]) => p)).toEqual([]);
  });
});

describe('no call site spells a duration out longhand', () => {
  it('uses no `duration-[...]` arbitrary value', () => {
    const offenders = sources
      .filter(([, s]) => /(?<![\w-])duration-\[/.test(s))
      .map(([p]) => p);
    expect(offenders).toEqual([]);
  });

  it('uses no numeric `duration-<n>` utility', () => {
    const offenders = sources
      .filter(([p]) => /\.(tsx?)$/.test(p))
      .filter(([, s]) => /(?<![\w-])duration-\d/.test(s))
      .map(([p]) => p);
    expect(offenders).toEqual([]);
  });

  it('hardcodes no duration in a CSS/SCSS transition or animation', () => {
    // `transition: color 0.25s ease` and `animation: fadeOut 1.5s` both lived
    // here; both were off the scale, on a curve that was not --ease-standard.
    const offenders: string[] = [];
    for (const [path, src] of sources) {
      if (!/\.(css|scss)$/.test(path)) continue;
      for (const [i, line] of src.split('\n').entries()) {
        if (
          !/^\s*(transition|animation)(-duration)?\s*:|^\s+\w[\w-]*\s+\d/.test(
            line
          )
        )
          continue;
        if (/\d+(\.\d+)?m?s/.test(line) && !/0\.01ms/.test(line))
          offenders.push(`${path}:${i + 1}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('the JS copy of the scale cannot drift from the CSS', () => {
  it.each(SCALE)(
    'DURATION_%s matches --transition-duration-%s in index.css',
    (name, _value, seconds) => {
      const ms = indexCss.match(
        new RegExp(`--transition-duration-${name}:\\s*(\\d+)ms`)
      )?.[1];
      expect(ms).toBeDefined();
      expect(Number(ms)).toBe(Math.round(seconds * 1000));
    }
  );

  it('EASE_STANDARD matches --ease-standard in index.css', () => {
    const curve = indexCss.match(
      /--ease-standard:\s*cubic-bezier\(([^)]+)\)/
    )?.[1];
    expect(curve).toBeDefined();
    const parsed = curve!.split(',').map(n => Number(n.trim()));
    expect(parsed).toEqual([...EASE_STANDARD]);
  });

  it('has no second copy of the curve written out as a literal', () => {
    const offenders = sources
      .filter(([p]) => /\.tsx?$/.test(p) && !p.endsWith('lib/motion.ts'))
      .filter(([, s]) =>
        /\[\s*0\.4\s*,\s*0(\.0)?\s*,\s*0\.2\s*,\s*1\s*\]/.test(s)
      )
      .map(([p]) => p);
    expect(offenders).toEqual([]);
  });
});

describe('framer-motion', () => {
  it('honours the reduced-motion preference globally', () => {
    // Its own default is `reducedMotion: 'never'`, and the global CSS rule
    // cannot reach an inline transform written from JS. Measured without this
    // provider: MobileNavbar still travelled 0→120px under `reduce`.
    expect(rootRoute).toMatch(/<MotionConfig\s+reducedMotion='user'>/);
  });

  it('never pairs `duration` with a spring, where it is discarded', () => {
    const offenders: string[] = [];
    for (const [path, src] of sources) {
      if (!/\.tsx$/.test(path)) continue;
      for (const block of src.match(/transition=\{\{[\s\S]*?\}\}/g) ?? []) {
        if (/'spring'/.test(block) && /(?<!_)\bduration\s*:/.test(block))
          offenders.push(path);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('reduced motion', () => {
  it('collapses rather than removes, so nothing wedges mid-state', () => {
    const reduce =
      globalsScss.match(
        /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n {2}\}/
      )?.[1] ?? '';
    expect(reduce).toMatch(/animation-duration:\s*0\.01ms\s*!important/);
    expect(reduce).toMatch(/transition-duration:\s*0\.01ms\s*!important/);
    expect(reduce).not.toMatch(/transition:\s*none/);
  });

  it('is not claimed by a rule that never matches', () => {
    // src/App.css declared `prefers-reduced-motion: no-preference` and was
    // imported by nothing at all.
    const orphans = sources
      .filter(([p]) => /\.css$/.test(p) && !p.endsWith('src/index.css'))
      .filter(([, s]) => /prefers-reduced-motion/.test(s))
      .map(([p]) => p);
    expect(orphans).toEqual([]);
  });
});
