import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// The defect this file exists for was not a class: `Tooltip` used to wrap
// itself in a `TooltipProvider`, so an ancestor governed nothing. A declared
// 300ms delay measured 17ms, and the sidebar's own provider was dead code. A
// source scan would not have caught it and neither would a class assertion, so
// the first guard is the structural one — no provider above, no tooltip.
function open(ui: React.ReactElement) {
  const { unmount } = render(ui);
  const el = document.body.querySelector('[data-slot=tooltip-content]');
  expect(el, 'no [data-slot=tooltip-content] rendered').toBeTruthy();
  const list = [...(el?.classList ?? [])];
  unmount();
  return list;
}

const content = (
  <TooltipProvider>
    <Tooltip defaultOpen>
      <TooltipTrigger>{'Trigger'}</TooltipTrigger>
      <TooltipContent>{'Recentre the map'}</TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

describe('the provider is the tooltip', () => {
  it('refuses to render without one above it', () => {
    // Re-nesting a provider inside `Tooltip` would make this pass again while
    // silently shadowing every ancestor, which is the whole bug.
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() =>
      render(
        <Tooltip defaultOpen>
          <TooltipTrigger>{'Trigger'}</TooltipTrigger>
          <TooltipContent>{'Recentre the map'}</TooltipContent>
        </Tooltip>
      )
    ).toThrow(/TooltipProvider/);
    quiet.mockRestore();
  });

  it('is mounted once at the app root', () => {
    // Nothing else mounts one, so a tooltip added to any page depends on this
    // line existing. Deleting it breaks every call site at runtime only.
    const root = readFileSync('src/routes/__root.tsx', 'utf8');
    expect(root).toMatch(/<TooltipProvider/);
  });

  it('carries the delay, so the rail can nest its own', () => {
    const source = readFileSync('src/components/ui/tooltip.tsx', 'utf8');
    expect(source).toMatch(/delayDuration = 300/);
    const sidebar = readFileSync('src/components/ui/sidebar.tsx', 'utf8');
    expect(sidebar).toMatch(/<TooltipProvider delayDuration=\{0\}>/);
  });
});

describe('the tooltip surface', () => {
  // Read the rendered class list, not the source: the source only says where a
  // class is written, and `tailwind-merge` decides which one survives.
  const list = () => open(content);

  it('is the floating role its three siblings already carry', () => {
    expect(list()).toContain('elevation-floating');
  });

  it('sets text at the 14px label step, not the micro size', () => {
    expect(list()).toContain('text-sm');
    expect(list()).toContain('font-medium');
    expect(list()).not.toContain('text-xs');
  });

  it('takes the container radius, which a pill collapses into', () => {
    // `rounded-full` clamps to half the short side, which reads as a pill at
    // one line and as a 46px lozenge at four. `rounded-card` clamps to the
    // same 16px at one line -- hit-tested, the two corner masks are identical
    // -- and holds 20px when the box grows. One token, both shapes.
    expect(list()).toContain('rounded-card');
    expect(list()).not.toContain('rounded-full');
  });

  it('sets no display utility, so the sidebar can hide it', () => {
    // `SidebarMenuButton` passes `hidden` to the content, which only works
    // while nothing in this class list paints `display`.
    expect(
      list().filter(c =>
        /^(block|inline|inline-block|flex|inline-flex|grid|inline-grid|contents|hidden|table)$/.test(
          c
        )
      )
    ).toEqual([]);
  });
});
