import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';

/**
 * Radius is entirely bare strings, so nothing here is type-checked. Both
 * defects #225 found were invisible for exactly that reason:
 *
 *  - DESIGN.md declares one container radius (20px, the Pill-Or-Card Rule) but
 *    `card.tsx` hardcoded `rounded-[1.25rem]` while thirteen other containers
 *    used `rounded-2xl` (16px) and three used `rounded-3xl` (24px). The role had
 *    a name in the prose and no token in the code, so every surface picked its
 *    own.
 *  - `button.tsx`'s cva base still carried shadcn's `rounded-md`. Four variants
 *    overrode it with `rounded-full`; `secondary`, `enhanced-outline` and `link`
 *    did not, so they shipped as 6px rectangles nobody chose.
 *
 * A missing `--radius-card` is the worst case: Tailwind simply stops emitting
 * `.rounded-card` and eighteen surfaces go square with no error anywhere.
 */
const indexCss = readFileSync('src/index.css', 'utf8');
const button = readFileSync('src/components/ui/button.tsx', 'utf8');

// A comment naming a banned radius is prose, not a call site. Without this the
// guard fires on the sentence that explains why the radius is banned.
function stripComments(source: string) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

const sources = readdirSync('src', { recursive: true, encoding: 'utf8' })
  .map(p => p.replace(/\\/g, '/'))
  .filter(p => /\.(tsx?|css|scss)$/.test(p) && !p.endsWith('radius.test.ts'))
  .map(
    p => [`src/${p}`, stripComments(readFileSync(`src/${p}`, 'utf8'))] as const
  );

// The foundation story demonstrates the off-scale radii it warns against.
const isFoundationStory = (p: string) =>
  p.endsWith('RadiusAndSpacing.stories.tsx');

describe('--radius-card', () => {
  it('is declared, at DESIGN.md’s 20px', () => {
    expect(indexCss).toMatch(/--radius-card:\s*1\.25rem;/);
  });

  it('is inside @theme, so Tailwind emits a `rounded-card` utility', () => {
    // Declared in :root instead, the variable would resolve but the class
    // would not exist — every call site silently unstyled.
    const theme = indexCss.match(/@theme[^{]*\{([\s\S]*?)\n\}/)?.[1] ?? '';
    expect(theme).toMatch(/--radius-card:/);
  });

  it('does not derive from --radius: containers are deliberately independent', () => {
    expect(indexCss).not.toMatch(/--radius-card:\s*calc\(/);
  });
});

describe('one container radius', () => {
  it('no rounded-2xl or rounded-3xl outside the foundation story', () => {
    const offenders = sources
      .filter(([p]) => !isFoundationStory(p))
      .filter(([, s]) => /\brounded(-[trbl]{1,2})?-(2xl|3xl)\b/.test(s))
      .map(([p]) => p);
    expect(offenders).toEqual([]);
  });

  it('no invented radius, bar the one documented exception', () => {
    // tooltip.tsx's arrow is a 10px square rotated 45°; 2px takes the sting off
    // the point. Neither pill nor container — the rule has nothing to say.
    const allowed = new Set(['src/components/ui/tooltip.tsx']);
    const offenders = sources
      .filter(([p]) => !allowed.has(p) && !isFoundationStory(p))
      .filter(([, s]) => /\brounded(-[trbl]{1,2})?-\[/.test(s))
      .map(([p]) => p);
    expect(offenders).toEqual([]);
  });
});

describe('buttons are pills, decided once', () => {
  // `\s*` alone stops at the comment lines that sit between `cva(` and the
  // base string.
  const base =
    button.match(/cva\(\s*(?:\/\/[^\n]*\n\s*)*(["'])([\s\S]*?)\1/)?.[2] ?? '';

  it('the cva base sets rounded-full', () => {
    expect(base).toMatch(/\brounded-full\b/);
  });

  it('no variant, size or compound re-declares a radius', () => {
    // tailwind-merge lets any later `rounded-*` win, which is how three
    // variants quietly stopped being pills. Keep the decision in one place.
    const afterBase = button.slice(button.indexOf(base) + base.length);
    expect(afterBase).not.toMatch(/\brounded-(none|full|sm|md|lg|xl|card|\[)/);
  });
});

describe('tokens are declared once', () => {
  it.each(['--radius', '--spacing'])('%s has a single definition', name => {
    // Both were declared three times — @theme, :root and an identical .dark
    // copy. The dark copies were dead; a future edit to one of them would have
    // looked like it worked.
    // `--spacing: var(--spacing)` in @theme is not a definition: it is v4's way
    // of telling Tailwind to emit `calc(var(--spacing) * n)` rather than inline
    // the number. Only concrete values count.
    const hits = (
      indexCss.match(new RegExp(`^\\s*${name}:\\s*([^;\\n]+);`, 'gm')) ?? []
    ).filter(d => !d.includes(`var(${name})`));
    expect(hits).toHaveLength(1);
  });
});

describe('the spacing grid', () => {
  it('is 4px', () => {
    expect(indexCss).toMatch(/--spacing:\s*0\.25rem;/);
  });

  it('has no arbitrary values anywhere', () => {
    // This half of the foundation was already clean at #225. Keep it that way:
    // one `p-[13px]` is how a 4px grid stops being a grid.
    const offenders = sources
      .filter(([, s]) =>
        /\b(p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|gap-x|gap-y|space-x|space-y)-\[/.test(
          s
        )
      )
      .map(([p]) => p);
    expect(offenders).toEqual([]);
  });
});
