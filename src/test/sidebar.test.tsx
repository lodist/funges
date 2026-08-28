import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { render } from '@testing-library/react';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSubButton,
  SidebarProvider,
} from '@/components/ui/sidebar';

/**
 * `sidebar.tsx` was the last shadcn atom still wearing upstream's defaults, and
 * every defect it carried was invisible to the type system because all of it is
 * bare class strings:
 *
 *  - every shipped nav row rendered 134×32, twelve pixels under DESIGN.md's
 *    44px floor, because the cva's `default` size said `h-8`;
 *  - eight `rounded-md` put 6px on rows whose twin in `MobileNavbar` and whose
 *    siblings in `dropdown-menu.tsx` are both `rounded-xl`;
 *  - four `ease-linear` made this the only file in `src` animating off the
 *    one curve the system owns.
 */

const sidebar = readFileSync('src/components/ui/sidebar.tsx', 'utf8');

// A comment naming a banned class is prose, not a call site.
function stripComments(source: string) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

const cvaBase =
  stripComments(sidebar).match(
    /sidebarMenuButtonVariants = cva\(\s*(['"])([\s\S]*?)\1/
  )?.[2] ?? '';

const renderRow = (ui: React.ReactNode) =>
  render(<SidebarProvider>{ui}</SidebarProvider>);

const classesOf = (selector: string) =>
  Array.from(document.querySelector(selector)?.classList ?? []);

describe('the 44px floor reaches the nav rows', () => {
  it('the default size is the floor, so a call site that names none lands on it', () => {
    // Every shipped call site omits `size`. `h-8` meant omission landed 12px
    // under the floor.
    renderRow(
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton>{'Map'}</SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );

    expect(classesOf('[data-slot="sidebar-menu-button"]')).toContain('h-11');
  });

  it('the sub-row is at the floor too', () => {
    // Dead in the app today, but it is a public export: the next consumer
    // inherits whatever this says.
    renderRow(<SidebarMenuSubButton>{'Support'}</SidebarMenuSubButton>);

    expect(classesOf('[data-slot="sidebar-menu-sub-button"]')).toContain(
      'h-11'
    );
  });

  it('the icon rail keeps its rows square at the floor, not at shadcn 32px', () => {
    // The rail had to widen to hold them; a 3rem rail cannot.
    expect(cvaBase).toMatch(/group-data-\[collapsible=icon\]:size-11!/);
    expect(sidebar).toMatch(/SIDEBAR_WIDTH_ICON = '3\.5rem'/);
  });

  it('hides the rail label from the eye but not from the a11y tree', () => {
    // `hidden` removed the accessible name too: eight icon-only buttons, none
    // of them named. axe caught six button-name violations on the rail story.
    expect(cvaBase).toMatch(
      /group-data-\[collapsible=icon\]:\[&>span\]:sr-only/
    );
    expect(cvaBase).not.toMatch(
      /group-data-\[collapsible=icon\]:\[&>span\]:hidden/
    );
  });
});

describe('shape and motion follow the system, not upstream', () => {
  it('no 6px radius survives in the sidebar', () => {
    expect(stripComments(sidebar)).not.toMatch(/\brounded(-[trbl]{1,2})?-md\b/);
  });

  it('the interactive row takes the same radius as its twin rows', () => {
    // MobileNavbar's row and dropdown-menu's row are both 12px.
    expect(cvaBase).toMatch(/\brounded-xl\b/);
  });

  it('nothing in src animates on a curve the system does not own', () => {
    // `sidebar.tsx` held the only four, against 32 uses of the token.
    const offenders = readdirSync('src', {
      recursive: true,
      encoding: 'utf8',
    })
      .filter(p => /\.(tsx?|css|scss)$/.test(p) && !p.startsWith('test/'))
      .filter(p =>
        /ease-linear/.test(stripComments(readFileSync(`src/${p}`, 'utf8')))
      );
    expect(offenders).toEqual([]);
  });

  it('the row transitions the tint it actually changes', () => {
    // The declared list was width/height/padding — none of which move in the
    // shipped collapsible mode — while the hover background snapped.
    expect(cvaBase).toMatch(/transition-\[[^\]]*background-color[^\]]*\]/);
  });
});

describe('the separator can be inset', () => {
  it('overrides the orientation width variant rather than tying with it', () => {
    // `data-[orientation=horizontal]:w-full` from Separator outranks a plain
    // `w-auto`, so an inset separator overflowed its container by the margin.
    expect(sidebar).toMatch(/data-\[orientation=horizontal\]:w-auto/);
  });
});
