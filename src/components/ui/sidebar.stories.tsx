import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { expect } from 'storybook/test';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { withSidebar } from '@/storybook/decorators';
import { BarChart2, BookOpen, ChefHat, Leaf, Map, Settings } from '@/lib/icons';

/**
 * Sidebar is documented at a deliberately reduced bar: one composed shell
 * story rather than a story per subcomponent.
 *
 * It carries roughly thirty exported subcomponents — `SidebarMenuAction`,
 * `SidebarMenuSubButton`, `SidebarRail` and the rest — and none of them mean
 * anything in isolation: a `SidebarMenuBadge` outside a `SidebarMenuItem`
 * outside a `SidebarMenu` outside a `SidebarProvider` is a styled span.
 * Holding this primitive to the same per-variant bar as Button would spend
 * most of the documentation budget on internals a reader never assembles by
 * hand, so what is documented here is the shell as it is actually used.
 *
 * The application's own composition lives in `src/components/Sidebar/`, which
 * is an organism and out of scope for this ticket.
 */

// Shared by the control and the matrix story, so the two cannot drift.
const SIDEBAR_VARIANTS = ['sidebar', 'floating', 'inset'] as const;

const meta: Meta<typeof Sidebar> = {
  title: 'Atoms/Sidebar',
  component: Sidebar,
  // Every Sidebar* subcomponent reads the provider's context and throws
  // without it, which is why this primitive was unstoryable before decorators
  // existed.
  decorators: [withSidebar],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The navigation shell: a collapsible off-canvas panel plus the inset region beside it. Documented as one composed shell rather than as thirty subcomponents, since none of the parts mean anything outside the whole.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    side: {
      control: { type: 'radio' },
      options: ['left', 'right'],
      description: 'Which edge the panel is anchored to',
    },
    variant: {
      control: { type: 'select' },
      options: SIDEBAR_VARIANTS,
      description:
        'How the panel meets the page: flush against it, floating as a detached card, or inset with the content shrunk to fit',
    },
    collapsible: {
      control: { type: 'select' },
      options: ['offcanvas', 'icon', 'none'],
      description:
        'What collapsing does — slide fully away, shrink to an icon rail, or nothing at all',
    },
  },
  args: {
    side: 'left',
    variant: 'sidebar',
    collapsible: 'offcanvas',
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

const NAV_ITEMS = [
  { icon: Map, label: 'Map', badge: null },
  { icon: Leaf, label: 'Species', badge: '128' },
  { icon: ChefHat, label: 'Recipes', badge: null },
  { icon: BarChart2, label: 'Data', badge: null },
  { icon: BookOpen, label: 'Instructions', badge: null },
];

/** The shell every story below renders, so the stories differ only by props. */
const Shell = ({ children }: { children?: React.ReactNode }) => (
  <>
    <SidebarHeader>
      <p className='px-2 py-1 font-display text-lg font-semibold'>{'Funges'}</p>
    </SidebarHeader>
    <SidebarSeparator />
    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupLabel>{'Browse'}</SidebarGroupLabel>
        <SidebarMenu>
          {NAV_ITEMS.map((item, index) => (
            <SidebarMenuItem key={item.label}>
              <SidebarMenuButton isActive={index === 0}>
                <item.icon />
                <span>{item.label}</span>
              </SidebarMenuButton>
              {item.badge ? (
                <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>
              ) : null}
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroup>
      {children}
    </SidebarContent>
    <SidebarFooter>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton>
            <Settings />
            <span>{'Settings'}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  </>
);

export const Default: Story = {
  render: args => (
    <div className='flex min-h-[32rem] w-full'>
      <Sidebar {...args}>
        <Shell />
      </Sidebar>
      <SidebarInset className='p-6'>
        <div className='flex items-center gap-3'>
          <SidebarTrigger />
          <p className='text-sm'>{'The inset region beside the panel.'}</p>
        </div>
      </SidebarInset>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The whole shell: header, a grouped menu with an active item and a badge, a footer, and the inset content region with the trigger that collapses the panel.',
      },
    },
  },
};

export const Loading: Story = {
  render: args => (
    <div className='flex min-h-[32rem] w-full'>
      <Sidebar {...args}>
        <SidebarHeader>
          <p className='px-2 py-1 font-display text-lg font-semibold'>
            {'Funges'}
          </p>
        </SidebarHeader>
        <SidebarSeparator />
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>{'Browse'}</SidebarGroupLabel>
            <SidebarMenu>
              {Array.from({ length: 5 }, (_, i) => (
                <SidebarMenuItem key={i}>
                  <SidebarMenuSkeleton showIcon />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
      <SidebarInset className='p-6'>
        <p className='text-sm'>{'Waiting for the nav item set.'}</p>
      </SidebarInset>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          '`SidebarMenuSkeleton` is the one subcomponent worth showing on its own, because it is the placeholder shape a caller has to opt into rather than get for free.',
      },
    },
  },
};

export const AllVariants: Story = {
  render: () => (
    <div className='flex flex-col gap-8 p-6'>
      {SIDEBAR_VARIANTS.map(variant => (
        <div key={variant} className='flex flex-col gap-2'>
          <p className='text-muted-foreground font-mono text-xs'>{variant}</p>
          <div className='flex h-64 w-full overflow-hidden rounded-xl border'>
            <Sidebar variant={variant} collapsible='none'>
              <Shell />
            </Sidebar>
            {/* A plain div, not SidebarInset: the inset renders a <main>, and
                three of them on one page is a duplicate-landmark violation.
                The variant being compared here belongs to the panel anyway. */}
            <div className='flex-1 p-4'>
              <p className='text-sm'>{'Content'}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The three variants side by side. `collapsible="none"` here so each panel stays visible — an off-canvas panel in a 16rem-tall box would just be a sliver.',
      },
    },
  },
};

export const IconRail: Story = {
  args: { collapsible: 'icon', variant: 'floating' },
  render: args => (
    // An inner provider pins the collapsed state, so the story documents the
    // rail itself rather than a click that has to land first.
    <SidebarProvider defaultOpen={false}>
      <div className='flex min-h-[32rem] w-full'>
        <Sidebar {...args}>
          <Shell />
        </Sidebar>
        <SidebarInset className='p-6'>
          <div className='flex items-center gap-3'>
            <SidebarTrigger />
            <p className='text-sm'>{'Expand the rail back to the panel.'}</p>
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  ),
  play: async ({ canvasElement }) => {
    const rows = canvasElement.querySelectorAll(
      '[data-slot="sidebar-menu-button"]'
    );
    await expect(rows.length).toBeGreaterThan(0);

    for (const row of rows) {
      const box = row.getBoundingClientRect();
      // DESIGN.md's floor. Upstream shrinks these to 32px in the rail, which
      // is what the 5rem rail exists to avoid.
      await expect(Math.round(box.height)).toBe(44);
      await expect(Math.round(box.width)).toBe(44);

      // At 44px there are 12 pixels spare beside a 16px icon, which showed
      // the label's first glyph. It is clipped, not removed: `display: none`
      // took the accessible name with it and axe found six unnamed buttons.
      const label = row.querySelector('span');
      if (label) {
        await expect(
          Math.round(label.getBoundingClientRect().width)
        ).toBeLessThanOrEqual(1);
        await expect(label.textContent?.trim()).toBeTruthy();
      }
    }
  },
  parameters: {
    docs: {
      description: {
        story:
          'Collapsed to the icon rail. The rail is 5rem so a row can stay at the 44px floor instead of shrinking to upstream 32px, and everything after the icon is hidden rather than clipped.',
      },
    },
  },
};
