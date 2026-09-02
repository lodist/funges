import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';

import { Separator } from '@/components/ui/separator';

const rule = (orientation: 'horizontal' | 'vertical') =>
  render(<Separator orientation={orientation} />).container
    .firstElementChild as HTMLElement;

describe('a separator is a rule, not a control', () => {
  it('takes no pointer events in either orientation', () => {
    // SelectSeparator carried `pointer-events-none` and DropdownMenuSeparator
    // did not; the atom said nothing, so the two twins drifted.
    for (const orientation of ['horizontal', 'vertical'] as const) {
      expect(rule(orientation).classList).toContain('pointer-events-none');
    }
  });

  it('is one pixel on its short axis', () => {
    expect(rule('horizontal').classList).toContain(
      'data-[orientation=horizontal]:h-px'
    );
    expect(rule('vertical').classList).toContain(
      'data-[orientation=vertical]:w-px'
    );
  });

  it('is hidden from assistive technology unless a caller opts out', () => {
    expect(rule('horizontal').getAttribute('role')).toBe('none');
    const semantic = render(<Separator decorative={false} />).container
      .firstElementChild as HTMLElement;
    expect(semantic.getAttribute('role')).toBe('separator');
  });
});

describe('the one separator that reimplements the atom still matches it', () => {
  it('DropdownMenuSeparator takes no pointer events either', () => {
    // It renders the Radix primitive rather than the atom, so nothing carries
    // the rule down to it. SidebarSeparator wraps the atom and inherits.
    const source = readFileSync('src/components/ui/dropdown-menu.tsx', 'utf8');
    const [, classes] =
      source.match(
        /data-slot='dropdown-menu-separator'\s*\n\s*className=\{cn\('([^']*)'/
      ) ?? [];
    expect(
      classes,
      'no dropdown-menu-separator class string found'
    ).toBeTruthy();
    expect(classes).toContain('pointer-events-none');
  });
});

describe('the recipe modals are twins and stay twins', () => {
  const twins = ['RecipeModal', 'RecipeModalDesktop'] as const;

  it.each(twins)('%s draws one rule, the scroll boundary', name => {
    const source = readFileSync(`src/components/${name}.tsx`, 'utf8');
    const rules = [...source.matchAll(/<Separator\b/g)];
    // The h3 of each section already announces the division; the only rule
    // left marks where the fixed header stops and the body scrolls.
    expect(rules).toHaveLength(1);
    expect(source).toMatch(/<Separator className='mt-6 shrink-0' \/>/);
  });
});
