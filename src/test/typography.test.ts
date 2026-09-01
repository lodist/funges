import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';

/**
 * Typography's two load-bearing facts are CSS, so the type system protects
 * neither: `.type-micro` is a bare string at seven call sites, and the heading
 * ramp lives in a base-layer rule nothing imports. Both went wrong in exactly
 * that silent way before #225 — the MDX documented an `h1`-`h4` size mapping no
 * rule implemented, and eleven sites hand-rolled the micro role because it had
 * a name in DESIGN.md and no implementation in code.
 *
 * The impeccable detector already flags an off-ramp font size, but it does not
 * run in `task ci-check`, so these checks are what make the 12px floor and the
 * heading ramp non-regressible.
 */
const globals = readFileSync('src/styles/globals.scss', 'utf8');
const indexCss = readFileSync('src/index.css', 'utf8');

// `readdirSync` recursive rather than a glob dependency or `node:fs`'s
// still-experimental globSync.
const sources = readdirSync('src', { recursive: true, encoding: 'utf8' })
  .filter(p => /\.tsx?$/.test(p) && !p.endsWith('typography.test.ts'))
  .map(p => `src/${p}`);

describe('.type-micro', () => {
  it('is defined in globals.scss', () => {
    // Seven call sites name it as a string; a rename here would leave every one
    // of them silently unstyled rather than failing to compile.
    expect(globals).toMatch(/^\s*\.type-micro\s*\{/m);
  });

  it('is DESIGN.md’s micro role: 12px, 500, tracked, uppercase', () => {
    const rule = globals.match(/\.type-micro\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(rule).toContain('var(--text-xs)');
    expect(rule).toMatch(/font-weight:\s*500/);
    expect(rule).toMatch(/text-transform:\s*uppercase/);
    expect(rule).toMatch(/letter-spacing:\s*0\.06em/);
  });

  it('sets no colour, so a caller can pair it with any surface', () => {
    // These labels sit on paper, on glass and on a warning fill. Baking a
    // colour in would send one of the three back to a hand-rolled class.
    const rule = globals.match(/\.type-micro\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(rule).not.toMatch(/(^|[^-])color:/);
  });
});

describe('the type scale floor', () => {
  it('has no arbitrary font size anywhere in src', () => {
    // 12px is the floor DESIGN.md always claimed and the codebase never held:
    // eleven sites were at 10px and two at 11px until #225.
    const offenders = sources.flatMap(file => {
      const text = readFileSync(file, 'utf8');
      return [...text.matchAll(/text-\[\d+px\]/g)].map(m => `${file}: ${m[0]}`);
    });
    expect(offenders).toEqual([]);
  });
});

describe('the heading ramp', () => {
  // A heading must need no classes to be a heading. Tailwind's preflight resets
  // headings to `font-size: inherit; font-weight: inherit`, so dropping any of
  // these rules silently returns a bare <h1> to 16px/400 -- the same size as
  // the paragraph beside it, which is what it measured before #225.
  const expected = [
    ['h1', '2.25rem', '1.1'],
    ['h2', '1.875rem', '1.2'],
    ['h3', '1.25rem', '1.3'],
  ] as const;

  for (const [tag, size, lineHeight] of expected) {
    it(`${tag} carries its own size, weight and leading`, () => {
      const rule = indexCss.match(
        new RegExp(`\\n\\s*${tag}\\s*\\{([^}]*)\\}`)
      )?.[1];
      expect(rule, `no base-layer rule for ${tag}`).toBeDefined();
      expect(rule).toContain(size);
      expect(rule).toContain(lineHeight);
      // 600 is chosen, not inherited: Space Grotesk ships no 400, so a heading
      // left at the inherited weight resolves to the 500 face -- a silent
      // no-op rather than a visible defect.
      expect(rule).toMatch(/font-weight:\s*600/);
    });
  }

  it('keeps h1–h3 on the display face', () => {
    expect(indexCss).toMatch(
      /h1,\s*\n?\s*h2,\s*\n?\s*h3\s*\{[^}]*var\(--font-display\)/
    );
  });

  it('never asks the display face for a weight it does not ship', () => {
    // Space Grotesk ships 500/600/700. `font-normal` on h1-h3 is always a
    // mistake: there is nothing below 500 to reach, so the class does nothing.
    const offenders = sources.flatMap(file => {
      const text = readFileSync(file, 'utf8');
      return [...text.matchAll(/<h[123][^>]*className=(['"`])([^'"`]*)\1/g)]
        .filter(m => /\bfont-normal\b/.test(m[2]))
        .map(m => `${file}: ${m[0].slice(0, 60)}`);
    });
    expect(offenders).toEqual([]);
  });
});

describe('the third face rule', () => {
  it('declares no --font-serif token', () => {
    // Merriweather held it, rendered on no screen, and shipped 692 KB to dist
    // to do it. A fourth face has to earn a screen before it earns a token.
    expect(indexCss).not.toContain('--font-serif');
  });

  it('has no font-serif utility left in src', () => {
    const offenders = sources.filter(f =>
      /\bfont-serif\b/.test(readFileSync(f, 'utf8'))
    );
    expect(offenders).toEqual([]);
  });

  it('loads the faces from one list, not two', () => {
    // The list used to be duplicated in main.tsx and .storybook/preview.tsx,
    // "kept in sync by hand" -- and the drift that comment predicted happened
    // the first time the list changed: dropping Merriweather broke all 31 story
    // files because only the entrypoint was updated. Storybook never loads
    // main.tsx, so a preview that imports its own faces is a preview that can
    // silently render every story in fallback system fonts.
    const importers = ['src/main.tsx', '.storybook/preview.tsx'];
    for (const file of importers) {
      const text = readFileSync(file, 'utf8');
      expect(
        text,
        `${file} should not import @fontsource directly`
      ).not.toMatch(/@fontsource/);
      expect(text, `${file} should import the shared font list`).toMatch(
        /lib\/fonts/
      );
    }
  });
});
