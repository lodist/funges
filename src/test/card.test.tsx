import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { Card, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

// Card shipped an unconditional clip that ate the focus ring of anything
// touching its edge, an unconditional hover lift on cards nobody could
// activate, a title that was a `div`, and six call sites whose background was
// spelled with a doubled opacity modifier — a class Tailwind never emits and
// tailwind-merge still counts, so the base fill was dropped and the card had
// no background at all.
//
// The variant assertions read the rendered class list rather than the source,
// because the source only says where a class is written: smuggling the clip
// into a different variant reintroduces the same defect.
function classes(ui: React.ReactElement, slot = 'card'): string[] {
  const { container, unmount } = render(ui);
  const el = container.querySelector(`[data-slot=${slot}]`);
  const list = [...(el?.classList ?? [])];
  unmount();
  return list;
}

const card = readFileSync('src/components/ui/card.tsx', 'utf8');
const globals = readFileSync('src/styles/globals.scss', 'utf8');

// A class named in prose is not a class the browser sees: strip comments
// before scanning, or a guard fails on the comment explaining the bug it
// guards against.
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/[^\n]*/g, '$1');
}

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, acc);
    else if (/\.tsx?$/.test(entry)) acc.push(full);
  }
  return acc;
}

const src = sourceFiles('src');

describe('the clip is opt-in', () => {
  it('no default combination clips', () => {
    for (const padding of ['content', 'none'] as const) {
      for (const surface of ['solid', 'glass'] as const) {
        expect(
          classes(<Card padding={padding} surface={surface} />),
          `padding=${padding} surface=${surface}`
        ).not.toContain('overflow-hidden');
      }
    }
  });

  it('`media` is the only thing that clips', () => {
    expect(classes(<Card media />)).toContain('overflow-hidden');
  });
});

describe('the hover lift is opt-in', () => {
  it('no card lifts unless it says it is interactive', () => {
    for (const padding of ['content', 'none'] as const) {
      for (const surface of ['solid', 'glass'] as const) {
        expect(
          classes(<Card padding={padding} surface={surface} media />),
          `padding=${padding} surface=${surface}`
        ).not.toContain('elevation-interactive');
      }
    }
    expect(classes(<Card interactive={false} />)).not.toContain(
      'elevation-interactive'
    );
  });

  it('every card is raised', () => {
    expect(classes(<Card />)).toContain('elevation-raised');
  });

  it('`interactive` is what lifts', () => {
    expect(classes(<Card interactive />)).toContain('elevation-interactive');
  });
});

describe('the fill belongs to a variant', () => {
  // Tailwind utilities outrank the components layer `.glass-regular` lives
  // in, so a `bg-card` anywhere in the composition wins over the glass fill.
  it('glass is never overpainted by the paper fill', () => {
    for (const padding of ['content', 'none'] as const) {
      for (const interactive of [true, false]) {
        const list = classes(
          <Card surface='glass' padding={padding} interactive={interactive} />
        );
        expect(list, `padding=${padding}`).toContain('glass-regular');
        expect(list, `padding=${padding}`).not.toContain('bg-card');
      }
    }
  });

  it('solid paints the paper', () => {
    expect(classes(<Card />)).toContain('bg-card');
    expect(classes(<Card />)).toContain('border-0');
  });
});

describe('padding is a named step, not a per-call-site value', () => {
  it('the card owns the vertical rhythm and the regions the horizontal', () => {
    expect(classes(<Card />)).toContain('py-6');
    expect(classes(<CardHeader />, 'card-header')).toContain('px-6');
  });

  // Each step declares a whole-box `p-*`, so tailwind-merge already discards a
  // narrower padding smuggled in from another variant — except beside the
  // default `py-6`, where an axis utility survives. Assert the exact set.
  it.each([
    ['content', ['py-6']],
    ['compact', ['p-3']],
    ['none', ['p-0']],
  ] as const)('%s renders exactly %s', (padding, expected) => {
    const padded = classes(<Card padding={padding} />).filter(c =>
      /^p[xytrbles]?-/.test(c)
    );
    expect(padded).toEqual(expected);
  });
});

describe('a card title is a heading', () => {
  it('renders `h3` unless `as` says otherwise', () => {
    const { container, unmount } = render(<CardTitle>{'Title'}</CardTitle>);
    expect(container.querySelector('[data-slot=card-title]')?.tagName).toBe(
      'H3'
    );
    unmount();

    const second = render(<CardTitle as='h2'>{'Title'}</CardTitle>);
    expect(
      second.container.querySelector('[data-slot=card-title]')?.tagName
    ).toBe('H2');
    second.unmount();
  });

  it('only heading levels are offerable', () => {
    const union = card.match(/as\?:\s*([^;]*);/);
    expect(union, 'no `as` prop found').toBeTruthy();
    expect(union![1]).toMatch(/^(?:\s*'h[1-6]'\s*\|?)+$/);
  });

  it('no leading-none, so a wrapped title does not collide with itself', () => {
    expect(
      classes(<CardTitle>{'Title'}</CardTitle>, 'card-title')
    ).not.toContain('leading-none');
  });
});

describe('dead shadcn leftovers stay gone', () => {
  it('no sibling-class padding hooks nothing ever sets', () => {
    const hook = /\[\.border-[bt]\]/;
    expect(classes(<CardHeader />, 'card-header').join(' ')).not.toMatch(hook);
    expect(classes(<CardFooter />, 'card-footer').join(' ')).not.toMatch(hook);
  });
});

describe('a doubled opacity modifier is a silent transparent surface', () => {
  it('no class carries two opacity modifiers anywhere in src', () => {
    const doubled =
      /\b(?:bg|text|border|ring|from|via|to)-[\w-]+\/\d{1,3}\/\d{1,3}\b/;
    const offenders = src.filter(f =>
      doubled.test(stripComments(readFileSync(f, 'utf8')))
    );
    expect(offenders).toEqual([]);
  });
});

describe('call sites do not re-declare what the atom owns', () => {
  const openingTags = src.flatMap(file => {
    const text = stripComments(readFileSync(file, 'utf8'));
    return [...text.matchAll(/<Card\b((?:[^>]|\n)*?)>/g)].map(m => ({
      file,
      tag: m[0],
    }));
  });

  it('finds every call site', () => {
    expect(openingTags.length).toBeGreaterThan(15);
  });

  it.each([
    ['border-0', /(?<![\w-])border-0(?![\w-])/],
    ['py-6', /(?<![\w-])py-6(?![\w-])/],
    ['a raw shadow', /(?<![\w-])(?:hover:)?shadow-(?:sm|md|lg|xl)(?![\w-])/],
    ['hand-rolled glass', /(?<![\w-])backdrop-blur-/],
    ['a translucent card fill', /(?<![\w-])bg-card\//],
    ['a hand-rolled lift', /(?<![\w-])elevation-interactive(?![\w-])/],
    // A padding utility here rides on tailwind-merge deciding it outranks the
    // variant. Name the step instead.
    ['a raw padding utility', /(?<![\w-])p[xy]?-\d/],
  ])('none pass %s', (_label, pattern) => {
    const offenders = openingTags
      .filter(({ tag }) => pattern.test(tag))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });
});

describe('a link is readable as text', () => {
  it('the global anchor uses the text step, not the 2.94:1 fill step', () => {
    const rule = globals.match(/\n {2}a \{([\s\S]*?)\n {2}\}/);
    expect(rule, 'no global `a` rule found').toBeTruthy();
    const body = stripComments(rule![1]);
    expect(body).toMatch(/color:\s*var\(--primary-text\)/);
    expect(body).not.toMatch(/var\(--primary\)(?!-)/);
  });
});
