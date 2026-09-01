'use client';

import * as React from 'react';
import { ChevronRight, type LucideIcon } from '@/lib/icons';
import { Link, useLocation } from '@tanstack/react-router';

import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface NavItem {
  title: string;
  url: string;
  icon?: LucideIcon;
  isActive?: boolean;
  items?: {
    title: string;
    url: string;
    icon?: LucideIcon;
  }[];
  /** Non-interactive content pinned below this item's flyout rows. */
  flyoutFooter?: React.ReactNode;
}

/**
 * A flyout that opens on hover and stays open while the pointer crosses the
 * gap to it. Click and Enter still work: hover alone would strand keyboard
 * and touch users, who never generate a hover.
 */
function useHoverOpen(graceMs = 260) {
  const [open, setOpen] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout>>(undefined);
  const openRef = React.useRef(false);

  React.useEffect(() => () => clearTimeout(timer.current), []);

  const set = (next: boolean) => {
    openRef.current = next;
    setOpen(next);
  };

  return {
    open,
    onOpenChange: set,
    hoverProps: {
      onPointerEnter: (event: React.PointerEvent) => {
        if (event.pointerType === 'touch') return;
        clearTimeout(timer.current);
        // Re-asserting `true` while the exit animation runs restarts the
        // enter animation, which reads as the menu opening twice.
        if (openRef.current) return;
        set(true);
      },
      onPointerLeave: (event: React.PointerEvent) => {
        if (event.pointerType === 'touch') return;
        clearTimeout(timer.current);
        timer.current = setTimeout(() => set(false), graceMs);
      },
    },
  };
}

/**
 * A parent whose children open beside the panel rather than inside it. An
 * indented second level truncated every label it held at this panel width.
 */
function NavFlyoutItem({
  item,
  subItems,
  isActive,
  pathname,
}: {
  item: NavItem;
  subItems: NonNullable<NavItem['items']>;
  isActive: boolean;
  pathname: string;
}) {
  const { open, onOpenChange, hoverProps } = useHoverOpen();

  return (
    <SidebarMenuItem>
      {/* `modal={false}`: a modal menu sets `pointer-events: none` on the body
          while open, which fires pointerout on the trigger, closes on the
          grace timer, restores pointer events under the still-hovering
          pointer, and reopens — a visible double-open loop. */}
      <DropdownMenu open={open} onOpenChange={onOpenChange} modal={false}>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton
            tooltip={item.title}
            isActive={isActive}
            {...hoverProps}
          >
            {item.icon && <item.icon />}
            <span>{item.title}</span>
            <ChevronRight className='ml-auto' />
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        {/* `align='end'` grows the list upward so its last row lines up with
            the trigger: this parent sits at the bottom of the panel, and
            aligning to the start ran the list off the viewport.
            The offset is measured from the row, which stops 13px short of the
            painted panel edge when expanded and 7px short in the rail, so 20
            clears both without opening a corridor. */}
        <DropdownMenuContent
          side='right'
          align='end'
          sideOffset={20}
          {...hoverProps}
        >
          {subItems.map(subItem => {
            const isSubActive = pathname === subItem.url;

            return (
              <DropdownMenuItem key={subItem.title} asChild>
                <Link
                  to={subItem.url}
                  aria-current={isSubActive ? 'page' : undefined}
                >
                  {subItem.icon && <subItem.icon />}
                  <span>{subItem.title}</span>
                </Link>
              </DropdownMenuItem>
            );
          })}
          {item.flyoutFooter && (
            <>
              <DropdownMenuSeparator />
              <div className='px-4 py-1.5'>{item.flyoutFooter}</div>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
}

export function NavMain({
  items,
  ...props
}: {
  items: NavItem[];
} & React.ComponentPropsWithoutRef<typeof SidebarGroup>) {
  const location = useLocation();

  return (
    <SidebarGroup {...props}>
      <SidebarMenu>
        {items.map(item => {
          const children = item.items ?? [];
          // A parent with children has no destination of its own, so its
          // active state comes from them.
          const isActive =
            location.pathname === item.url ||
            children.some(sub => location.pathname === sub.url);

          if (children.length === 0) {
            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  asChild
                  tooltip={item.title}
                  isActive={isActive}
                >
                  <Link
                    to={item.url}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    {item.icon && <item.icon />}
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          }

          return (
            <NavFlyoutItem
              key={item.title}
              item={item}
              subItems={children}
              isActive={isActive}
              pathname={location.pathname}
            />
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
