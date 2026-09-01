import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { expect, userEvent, within } from 'storybook/test';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { withSidebar } from '@/storybook/decorators';
import { NAV_SURFACE_CLASS } from '@/lib/nav-surface';
import {
  BarChart2,
  BookOpen,
  CalendarRange,
  ChefHat,
  Database,
  Gavel,
  Heart,
  Info,
  LifeBuoy,
  Map,
  ShieldCheck,
} from '@/lib/icons';

/**
 * An organism, not an atom. It lived under `Atoms/` because it ships from
 * `components/ui/`, but the folder is not the taxonomy: this is a composed
 * navigation shell that owns its own layout, disclosure state, keyboard
 * shortcut and responsive swap to a Sheet. Nothing else under `Atoms/` decides
 * anything about the page around it.
 *
 * It is documented at a deliberately reduced bar all the same: one composed
 * shell rather than a story per subcomponent. It carries roughly thirty
 * exported subcomponents — `SidebarMenuAction`, `SidebarRail` and the rest —
 * and none of them mean anything in isolation: a `SidebarMenuBadge` outside a
 * `SidebarMenuItem` outside a `SidebarMenu` outside a `SidebarProvider` is a
 * styled span.
 *
 * What the shell renders is the composition `AppSidebar` actually ships — the
 * props, the surface, the paddings, the divider inset and the grouped flyout
 * all match `src/components/Sidebar/`. A reference that looks different from
 * the running app teaches the wrong thing twice: readers copy the story, and
 * reviewers stop trusting the story.
 */

// Shared by the control and the matrix story, so the two cannot drift.
const SIDEBAR_VARIANTS = ['sidebar', 'floating', 'inset'] as const;

const meta: Meta<typeof Sidebar> = {
  title: 'Organisms/Sidebar',
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
          'The navigation shell: a floating panel that collapses to an icon rail, plus the inset region beside it. Composed the way the application composes it.',
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
  // The shipped pair. The panel is `floating` for layout and shape only; its
  // elevation role is Raised, shared with MobileNavbar.
  args: {
    side: 'left',
    variant: 'floating',
    collapsible: 'icon',
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

const NAV_ITEMS = [
  { icon: Map, label: 'Map' },
  { icon: CalendarRange, label: 'In Season' },
  { icon: Database, label: 'Species' },
  { icon: BarChart2, label: 'Data' },
  { icon: ChefHat, label: 'Recipes' },
  { icon: BookOpen, label: 'Instructions' },
];

const HELP_ITEMS = [
  { icon: Heart, label: 'Support' },
  { icon: Info, label: 'Legal Notice' },
  { icon: ShieldCheck, label: 'Privacy Policy' },
  { icon: Gavel, label: 'Terms of Use' },
];

/**
 * The brand lockup carries the app name, so it is the accessible name of the
 * image rather than decoration beside a wordmark.
 */
const Header = () => (
  <div className='flex items-center gap-2 px-3 pt-4 pb-4 group-data-[collapsible=icon]:px-0'>
    <img
      src='/icons/logo_funges.png'
      alt='Funges'
      className='min-w-0 flex-1 object-contain group-data-[collapsible=icon]:hidden'
    />
    <SidebarTrigger className='shrink-0 group-data-[collapsible=icon]:mx-auto' />
  </div>
);

/**
 * A grouped entry whose children open beside the panel. An indented second
 * level cannot hold these labels at this panel width — measured, the label
 * column fell to 45px and every one truncated.
 */
const HelpFlyout = () => (
  <SidebarMenuItem>
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton tooltip='Help'>
          <LifeBuoy />
          <span>{'Help'}</span>
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent side='right' align='end' sideOffset={20}>
        {HELP_ITEMS.map(item => (
          <DropdownMenuItem key={item.label}>
            <item.icon />
            <span>{item.label}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <div className='px-4 py-1.5'>
          <div className='text-foreground flex items-center gap-1.5 text-xs leading-snug'>
            <Database className='size-3.5 shrink-0' />
            <span>
              {'Updated '}
              <span className='font-medium'>{'yesterday'}</span>
            </span>
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  </SidebarMenuItem>
);

/** The shell every story below renders, so the stories differ only by props. */
const Shell = () => (
  <>
    <Header />
    {/* Inset to the same 12px spine the rows use, and on the sidebar's own
        border token rather than the generic one. */}
    <SidebarSeparator className='mx-3 group-data-[collapsible=icon]:mx-2' />
    <SidebarContent className='px-3 pt-4 pb-0 group-data-[collapsible=icon]:px-2'>
      <SidebarGroup>
        <SidebarMenu>
          {NAV_ITEMS.map((item, index) => (
            <SidebarMenuItem key={item.label}>
              <SidebarMenuButton isActive={index === 0}>
                <item.icon />
                <span>{item.label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroup>
      {/* Utility links sit at the bottom, as they do in the app. */}
      <SidebarGroup className='mt-auto'>
        <SidebarMenu>
          <HelpFlyout />
        </SidebarMenu>
      </SidebarGroup>
    </SidebarContent>
  </>
);

const FLOOR = 44;

export const Default: Story = {
  render: args => (
    <div className='flex min-h-[32rem] w-full'>
      <Sidebar {...args} surfaceClassOverride={NAV_SURFACE_CLASS}>
        <Shell />
      </Sidebar>
      <SidebarInset className='p-6'>
        <p className='text-sm'>{'The inset region beside the panel.'}</p>
      </SidebarInset>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const rows = canvasElement.querySelectorAll(
      '[data-slot="sidebar-menu-button"]'
    );
    await expect(rows.length).toBeGreaterThan(0);

    for (const row of rows) {
      // The default size is the floor, so a call site that names no size
      // lands on it by omission. `h-8` put every shipped row 12px under.
      await expect(Math.round(row.getBoundingClientRect().height)).toBe(FLOOR);
      // 12px, the same radius MobileNavbar's row and the Menus rows take.
      await expect(getComputedStyle(row).borderRadius).toBe('12px');
    }

    // The surface treatment has to land on the painted slot, not on the
    // positioning container `className` targets, or the surface's own
    // background paints over the glass.
    const painted = canvasElement.querySelector('[data-slot="sidebar-inner"]');
    for (const className of NAV_SURFACE_CLASS.split(' ')) {
      await expect(painted?.classList.contains(className)).toBe(true);
    }
    await expect(getComputedStyle(painted!).borderRadius).toBe('20px');
  },
  parameters: {
    docs: {
      description: {
        story:
          'The whole shell as the app composes it: the brand lockup beside the collapse control, an inset divider, the nav rows at the 44px floor, and the grouped Help entry pinned to the bottom.',
      },
    },
  },
};

export const Flyout: Story = {
  render: args => (
    <div className='flex min-h-[32rem] w-full'>
      <Sidebar {...args} surfaceClassOverride={NAV_SURFACE_CLASS}>
        <Shell />
      </Sidebar>
      <SidebarInset className='p-6'>
        <p className='text-sm'>{'Hover Help to open its flyout.'}</p>
      </SidebarInset>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /help/i }));

    // The content is portalled onto body, so it is outside canvasElement.
    const menu = document.querySelector('[data-slot="dropdown-menu-content"]');
    await expect(menu).not.toBeNull();

    const rows = document.querySelectorAll(
      '[data-slot="dropdown-menu-item"]'
    ) as NodeListOf<HTMLElement>;
    await expect(rows).toHaveLength(HELP_ITEMS.length);

    for (const row of rows) {
      // The point of the flyout: it sizes to its content, so no label is cut.
      await expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth);
      // globals.scss styles every bare `a` green at weight 500, and a row that
      // does not pin its own colour inherits that through `asChild`.
      await expect(getComputedStyle(row).fontWeight).toBe('400');
    }

    const panel = canvasElement.querySelector(
      '[data-slot="sidebar-inner"]'
    ) as HTMLElement;
    const panelRight = panel.getBoundingClientRect().right;
    // It must clear the panel it belongs to rather than overlap it.
    await expect(menu!.getBoundingClientRect().left).toBeGreaterThanOrEqual(
      panelRight
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'The grouped entry open. It opens on hover with a grace period and on click or Enter, `align="end"` so the list grows up from a parent at the bottom of the panel, and `modal={false}` — a modal menu drops body pointer events, which closes and reopens under a stationary pointer.',
      },
    },
  },
};

export const IconRail: Story = {
  render: args => (
    // An inner provider pins the collapsed state, so the story documents the
    // rail itself rather than a click that has to land first.
    <SidebarProvider defaultOpen={false}>
      <div className='flex min-h-[32rem] w-full'>
        <Sidebar {...args} surfaceClassOverride={NAV_SURFACE_CLASS}>
          <Shell />
        </Sidebar>
        <SidebarInset className='p-6'>
          <p className='text-sm'>{'Expand the rail back to the panel.'}</p>
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
      // Upstream shrinks these to 32px in the rail, which is why the rail is
      // sized by the target instead of the target by the rail.
      await expect(Math.round(box.height)).toBe(FLOOR);
      await expect(Math.round(box.width)).toBe(FLOOR);

      // At 44px there are 12 pixels spare beside a 16px icon, which showed the
      // label's first glyph. It is clipped, not removed: `display: none` took
      // the accessible name with it and axe found six unnamed buttons.
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
          'Collapsed to the icon rail. `--sidebar-width-icon` is 3.5rem because a 44px row does not fit upstream’s 3rem, the label is clipped rather than removed so the buttons keep their accessible names, and the brand mark becomes the control that expands the panel again.',
      },
    },
  },
};

export const Loading: Story = {
  render: args => (
    <div className='flex min-h-[32rem] w-full'>
      <Sidebar {...args} surfaceClassOverride={NAV_SURFACE_CLASS}>
        <Header />
        <SidebarSeparator className='mx-3' />
        <SidebarContent className='px-3 pt-4 pb-0'>
          <SidebarGroup>
            <SidebarMenu>
              {Array.from({ length: NAV_ITEMS.length }, (_, i) => (
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
  play: async ({ canvasElement }) => {
    const skeletons = canvasElement.querySelectorAll(
      '[data-slot="sidebar-menu-skeleton"]'
    );
    await expect(skeletons.length).toBe(NAV_ITEMS.length);

    for (const skeleton of skeletons) {
      // A placeholder that is not the height of the row it stands in for makes
      // the list jump when the real items arrive.
      await expect(Math.round(skeleton.getBoundingClientRect().height)).toBe(
        FLOOR
      );
    }
  },
  parameters: {
    docs: {
      description: {
        story:
          '`SidebarMenuSkeleton` is worth showing on its own because it is the placeholder a caller has to opt into rather than get for free. It matches the row it replaces, so nothing shifts when the items land.',
      },
    },
  },
};

export const MenuBadge: Story = {
  render: args => (
    <div className='flex min-h-[32rem] w-full'>
      <Sidebar {...args} surfaceClassOverride={NAV_SURFACE_CLASS}>
        <Header />
        <SidebarSeparator className='mx-3' />
        <SidebarContent className='px-3 pt-4 pb-0'>
          <SidebarGroup>
            <SidebarMenu>
              {NAV_ITEMS.slice(0, 3).map((item, index) => (
                <SidebarMenuItem key={item.label}>
                  <SidebarMenuButton isActive={index === 0}>
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                  <SidebarMenuBadge>{`${(index + 1) * 12}`}</SidebarMenuBadge>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
      <SidebarInset className='p-6'>
        <p className='text-sm'>{'Counts beside the rows.'}</p>
      </SidebarInset>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const badges = canvasElement.querySelectorAll(
      '[data-slot="sidebar-menu-badge"]'
    );
    await expect(badges.length).toBe(3);

    for (const badge of badges) {
      // Small and interactive-adjacent: a pill, per the Pill-Or-Card Rule.
      // This shipped at 6px until the sidebar caught up with the system.
      const radius = parseFloat(getComputedStyle(badge).borderRadius);
      await expect(radius).toBeGreaterThanOrEqual(
        badge.getBoundingClientRect().height / 2
      );
    }
  },
  parameters: {
    docs: {
      description: {
        story:
          '`SidebarMenuBadge` documented separately because the application does not use it — kept honest rather than folded into the shell, where it would imply the app shows counts.',
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
            <Sidebar
              variant={variant}
              collapsible='none'
              surfaceClassOverride={NAV_SURFACE_CLASS}
            >
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
          'The three variants side by side. `collapsible="none"` here so each panel stays visible — an off-canvas panel in a 16rem-tall box would just be a sliver. The app ships `floating`.',
      },
    },
  },
};
