import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';

import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton';

import { sourceFiles, stripComments } from './source-scan';

const css = readFileSync('src/index.css', 'utf8');

function classes(className?: string): string[] {
  const { unmount } = render(<Skeleton className={className} />);
  const el = document.querySelector('[data-slot=skeleton]');
  expect(el, 'no skeleton rendered').toBeTruthy();
  const list = [...(el?.classList ?? [])];
  unmount();
  return list;
}

// `--muted` carried `--card`'s exact value in dark, so a skeleton on a card
// painted pixels identical to its ground: 1.00:1, and the pulse could not
// rescue it either, because animating the opacity of a fill that already
// matches its ground changes nothing. Measured after the retune: 1.152:1 on
// --card, 1.442:1 on --background.
function token(block: 'root' | 'dark', name: string): string {
  const start =
    block === 'root' ? css.indexOf(':root {') : css.indexOf('.dark {');
  expect(start, `no ${block} block`).toBeGreaterThan(-1);
  const body = css.slice(start, css.indexOf('\n}', start));
  const match = body.match(new RegExp(`--${name}:\\s*(oklch\\([^)]*\\))`, 'm'));
  expect(match, `--${name} not declared in ${block}`).toBeTruthy();
  return match![1];
}

describe('a recessed fill is a step off the surface it recesses from', () => {
  it.each(['root', 'dark'] as const)(
    '--muted differs from --card and --background in %s',
    block => {
      const muted = token(block, 'muted');
      expect(muted).not.toBe(token(block, 'card'));
      expect(muted).not.toBe(token(block, 'background'));
    }
  );

  it('--muted stays clear of the roles either side of it in dark', () => {
    const muted = token('dark', 'muted');
    // Landing on --accent's or --border's value would move the collision
    // rather than fix it.
    expect(muted).not.toBe(token('dark', 'accent'));
    expect(muted).not.toBe(token('dark', 'border'));
  });
});

describe('the radius is part of the shape, not a container default', () => {
  it('defaults to a step a text line can actually render', () => {
    // CSS clamps a radius past half the shorter side, so `rounded-card` (20px)
    // rendered a full pill on every placeholder under 40px tall.
    expect(classes()).toContain('rounded-md');
    expect(classes()).not.toContain('rounded-card');
  });

  it('lets a caller ask for the container radius', () => {
    expect(classes('h-32 rounded-card')).toContain('rounded-card');
  });

  it('paints the recessed fill and pulses', () => {
    const list = classes();
    expect(list).toContain('bg-muted');
    expect(list).toContain('animate-pulse');
  });
});

describe('the wait is announced, not only pulsed', () => {
  it('a shape carries no semantics of its own', () => {
    render(<Skeleton />);
    expect(document.querySelector('[data-slot=skeleton]')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
  });

  it('the group is the live region, once for the whole set', () => {
    render(
      <SkeletonGroup>
        <Skeleton />
        <Skeleton />
      </SkeletonGroup>
    );
    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-busy', 'true');
    // `status` takes no name from its content, so what a screen reader reads
    // is the live text itself. Assert that, not the accessible name.
    expect(region.textContent?.trim()).not.toBe('');
    expect(document.querySelectorAll('[role=status]')).toHaveLength(1);
  });

  it('takes a surface-specific message over the generic one', () => {
    render(<SkeletonGroup label='Loading recommendations' />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading recommendations'
    );
  });
});

describe('no loading state announces nothing', () => {
  // Every spinner these replaced was icon-only: two of the three had no
  // accessible text at all, so a screen reader got silence where a sighted
  // user got motion.
  it('no shipped surface renders a bare Skeleton outside a group', () => {
    const offenders = sourceFiles('src')
      .filter(f => !f.includes('.stories.') && !f.includes('/test/'))
      .filter(f => {
        const src = stripComments(readFileSync(f, 'utf8'));
        if (!/<Skeleton[\s/>]/.test(src)) return false;
        // sidebar.tsx composes them into its own row, which the menu
        // announces; every other consumer wraps them in a group.
        return !/SkeletonGroup|data-sidebar='menu-skeleton'/.test(src);
      });
    expect(offenders).toEqual([]);
  });
});

describe('a placeholder renders the same twice', () => {
  it('no component derives a shape from Math.random()', () => {
    const offenders = sourceFiles('src/components')
      .filter(f => /Skeleton/.test(readFileSync(f, 'utf8')))
      .filter(f =>
        /Math\.random\(/.test(stripComments(readFileSync(f, 'utf8')))
      );
    expect(offenders).toEqual([]);
  });
});
