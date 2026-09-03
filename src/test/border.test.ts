import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import { sourceFiles, stripComments } from './source-scan';

// The badge shipped an `outline` variant with border-width 0 — a name
// promising a treatment it never had — and `--destructive-border` existed as a
// token that no component read.
const badge = readFileSync('src/components/ui/badge-variants.ts', 'utf8');
const button = readFileSync('src/components/ui/button.tsx', 'utf8');
const bareBorder = /(?<![\w-])border(?![\w-])/;

// The cva base string, not the raw file: a comment naming a class must not
// satisfy or break an assertion about it.
const VARIANT_NAMES = [
  'default',
  'destructive',
  'outline',
  'enhanced-outline',
  'secondary',
  'ghost',
  'link',
] as const;

function base(src: string): string {
  const m = src.match(/cva\(\s*(?:\/\/[^\n]*\n\s*)*"([^"]*)"/);
  if (!m) throw new Error('no cva base string found');
  return m[1];
}

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

  it('button base declares a border width, so a variant can colour it', () => {
    // With `border-0` on five variants, aria-invalid painted nothing.
    expect(base(button)).toMatch(bareBorder);
    expect(base(button)).toMatch(/border-transparent/);
    for (const name of VARIANT_NAMES) {
      expect(
        variant(button, name),
        `${name} re-declares border-0, which kills the invalid state`
      ).not.toMatch(/border-0/);
    }
  });

  it('button `outline` and `enhanced-outline` carry a visible stroke', () => {
    // --primary-text: happy-600 is 2.94:1, and the stroke is the light
    // variant's only boundary.
    expect(variant(button, 'outline')).toMatch(/border-primary-text/);
    expect(variant(button, 'enhanced-outline')).toMatch(/border-primary-text/);
  });
});

describe('the invalid state is reachable', () => {
  it('no button variant declares a dark-mode border colour of its own', () => {
    // `dark:border-primary` beat aria-invalid, so an invalid button drew the
    // brand green. --destructive-border is the one exception.
    expect(
      base(button),
      'in dark the invalid edge needs --destructive-border; --destructive is 2.50:1'
    ).toMatch(/dark:aria-invalid:border-destructive-border/);
    expect(base(button)).toMatch(/(?<!dark:)aria-invalid:border-destructive/);
    // A variant repainting either half brand green under a red edge reads as a
    // mistake, so the invalid state owns the whole hover.
    expect(base(button)).toMatch(
      /(?<!dark:)aria-invalid:hover:bg-destructive\/10/
    );
    expect(base(button)).toMatch(
      /(?<!dark:)aria-invalid:hover:text-destructive-text/
    );
    // `dark:hover:*` ties on specificity and sorts later, so it needs its own.
    expect(base(button)).toMatch(/dark:aria-invalid:hover:bg-destructive\/10/);
    expect(base(button)).toMatch(
      /dark:aria-invalid:hover:text-destructive-text/
    );
    // A red stroke around a brand-green label reads as a mistake, so the two
    // accent-labelled variants hand the label to the error too.
    for (const name of ['outline', 'enhanced-outline']) {
      expect(variant(button, name)).toMatch(
        /aria-invalid:text-destructive-text/
      );
    }
    const declared = VARIANT_NAMES.map(n => variant(button, n)).join(' ');
    const stray = [...declared.matchAll(/dark:border-[\w-]+/g)]
      .map(m => m[0])
      .filter(c => c !== 'dark:border-destructive-border');
    expect(stray, `stray dark border colours: ${stray.join(', ')}`).toEqual([]);
  });
});

describe('one transition, named', () => {
  it('the button base lists its properties and no variant overrides them', () => {
    // `transition-all` animated layout; ghost's `transition-colors` beat it.
    expect(base(button)).not.toMatch(/transition-all/);
    expect(base(button)).toMatch(
      /transition-\[color,background-color,border-color,box-shadow\]/
    );
    for (const name of VARIANT_NAMES) {
      expect(
        variant(button, name),
        `${name} re-declares a transition`
      ).not.toMatch(/transition-/);
    }
  });
});

// `transition` with no property list is `transition-all` under another name:
// measured on the sheet panel, 22 properties, `display`, `overlay` and
// `content-visibility` among them. The guard above only read the button, so
// the bare utility passed under it for as long as it shipped. Stories are
// excluded: they describe the rule in prose, and prose is not a class.
describe('nothing animates an unnamed property list', () => {
  // `=` is framer-motion's `transition={{...}}` prop and `:` a CSS
  // declaration; neither is a utility. Narrow the pattern to the class token
  // rather than widening the file list to excuse the matches.
  const bareTransition = /(?<![\w-])transition(?![\w-=:])/;

  it('no component reaches for the bare `transition` utility', () => {
    const offenders = sourceFiles('src/components')
      .filter(f => !f.endsWith('.stories.tsx'))
      .filter(f => bareTransition.test(stripComments(readFileSync(f, 'utf8'))));
    expect(offenders).toEqual([]);
  });
});

describe('link is not ghost', () => {
  it('the two variants differ at rest, not only on hover', () => {
    const ghost = variant(button, 'ghost');
    const link = variant(button, 'link');
    // Both spelled `text-primary`, redefined as --foreground: same Ink label.
    expect(link).toMatch(/(?<![\w-])underline(?![\w-])/);
    expect(ghost).not.toMatch(/(?<![\w-])underline(?![\w-])/);
    expect(link.replace(/hover:[\w[\]/.,-]+/g, '')).not.toBe(
      ghost.replace(/hover:[\w[\]/.,-]+/g, '')
    );
  });

  it('globals.scss does not redefine .text-primary', () => {
    const globals = readFileSync('src/styles/globals.scss', 'utf8');
    expect(globals).not.toMatch(/\.text-primary\s*\{/);
  });
});

describe('--destructive-border', () => {
  it('is read by the badge in dark, where the fill alone is 2.50:1', () => {
    expect(variant(badge, 'destructive')).toMatch(
      /dark:border-destructive-border/
    );
  });

  it('is read by the button too, whose fill measures the same 2.50:1', () => {
    // Badge was the token's only consumer; the button sat at `border-0`.
    expect(variant(button, 'destructive')).toMatch(
      /dark:border-destructive-border/
    );
  });
});
