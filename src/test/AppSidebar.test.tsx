import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import '@/i18n';
import { AppSidebar } from '@/components/Sidebar/AppSidebar';
import { SidebarProvider, useSidebar } from '@/components/ui/sidebar';
import { NAV_SURFACE_CLASS } from '@/lib/nav-surface';

/**
 * `AppSidebar` decides its own item set from platform and feature flags —
 * relevance-based disclosure, per CONTEXT.md. That's the behaviour worth
 * pinning: which entries a given platform/flag combination renders, and which
 * one reads as active. `NavMain`/`NavSecondary` are exercised through the
 * sidebar rather than tested in isolation, since the item list is what they
 * exist to render.
 */

const { pathname } = vi.hoisted(() => ({ pathname: { current: '/' } }));
vi.mock('@tanstack/react-router', () => ({
  useLocation: () => ({ pathname: pathname.current }),
  Link: ({
    to,
    children,
    ...props
  }: {
    to: string;
    children: React.ReactNode;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

const { isMobile } = vi.hoisted(() => ({ isMobile: { current: false } }));
vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => isMobile.current,
}));

const { offlineEnabled } = vi.hoisted(() => ({
  offlineEnabled: { current: false },
}));
vi.mock('@/lib/feature-flags', () => ({
  get shouldShowOfflineFeatures() {
    return offlineEnabled.current;
  },
}));

/**
 * On mobile `Sidebar` becomes an off-canvas Sheet that starts closed, so its
 * items aren't in the DOM until it opens. Nothing in the app renders a
 * `SidebarTrigger` today (mobile navigation goes through `MobileNavbar`
 * instead), so the mobile item set is opened here directly — the disclosure
 * logic under test lives in `AppSidebar`, not in what opens the sheet.
 */
const OpenMobileSheet = () => {
  const { setOpenMobile } = useSidebar();
  React.useEffect(() => setOpenMobile(true), [setOpenMobile]);
  return null;
};

const renderSidebar = () =>
  render(
    <SidebarProvider>
      {isMobile.current && <OpenMobileSheet />}
      <AppSidebar />
    </SidebarProvider>
  );

const navLinks = () =>
  screen.getAllByRole('link').map(link => link.getAttribute('href') ?? '');

/**
 * The flyout opens on hover. React derives `onPointerEnter` from the bubbling
 * `pointerover`, so that is the event to fire; a `pointerenter` never reaches
 * React's root listener.
 */
const openHelp = () =>
  fireEvent.pointerOver(screen.getByRole('button', { name: 'Help' }), {
    pointerType: 'mouse',
  });

beforeEach(() => {
  pathname.current = '/';
  isMobile.current = false;
  offlineEnabled.current = false;
});

describe('AppSidebar', () => {
  it('shows every destination section on desktop without extra taps', () => {
    // The four utility links sit behind the Help disclosure, which is closed
    // on an unrelated route — so they are deliberately absent here.
    renderSidebar();

    expect(navLinks()).toEqual([
      '/',
      '/worth-foraging-now',
      '/species',
      '/data',
      '/recipes',
      '/instructions',
    ]);
  });

  it('keeps Help closed on an unrelated route', () => {
    renderSidebar();

    expect(navLinks()).not.toContain('/support');
    expect(screen.getByText('Help')).toBeInTheDocument();
  });

  it('marks Help active when the current route is one of its children', () => {
    // The parent has no destination of its own. Without this the current page
    // has no representation in the nav at all, because its link lives in a
    // flyout that is closed.
    pathname.current = '/termsuse';
    renderSidebar();

    const help = screen.getByRole('button', { name: 'Help' });
    expect(help).toHaveAttribute('data-active', 'true');
  });

  it('reveals the utility links once Help is hovered', () => {
    renderSidebar();

    expect(navLinks()).not.toContain('/support');
    openHelp();

    // Radix gives each row role="menuitem", which overrides the anchor's
    // implicit link role — so these are not reachable through navLinks().
    const flyout = screen
      .getAllByRole('menuitem')
      .map(item => item.getAttribute('href'));
    expect(flyout).toEqual([
      '/support',
      '/impressum',
      '/privacy-policy',
      '/termsuse',
    ]);
  });

  it('adds Offline Maps on desktop once the flag is enabled', () => {
    offlineEnabled.current = true;
    renderSidebar();

    expect(navLinks()).toContain('/offline');
  });

  it('hides Offline Maps entirely while the flag is off', () => {
    renderSidebar();

    expect(navLinks()).not.toContain('/offline');
  });

  it('does not show Offline Maps on mobile even with the flag enabled', () => {
    // The mobile item set is deliberately the short one; offline maps live
    // behind Settings there.
    offlineEnabled.current = true;
    isMobile.current = true;
    renderSidebar();

    expect(navLinks()).not.toContain('/offline');
  });

  it('trades Instructions and the legal links for Settings on mobile', () => {
    isMobile.current = true;
    renderSidebar();

    expect(navLinks()).toEqual([
      '/',
      '/worth-foraging-now',
      '/species',
      '/data',
      '/recipes',
      '/settings',
    ]);
  });

  it('marks the entry for the current route as active', () => {
    pathname.current = '/data';
    renderSidebar();

    const active = document.querySelectorAll('a[aria-current="page"]');
    expect(active).toHaveLength(1);
    expect(active[0]).toHaveAttribute('href', '/data');
  });

  it('gives the active entry the accent styling and no other entry', () => {
    // The sidebar's accent rides on shadcn's `data-active`, which drives the
    // theme-aware --sidebar-accent-foreground tint. Unlike MobileNavbar's
    // hardcoded tint there's no light-mode-only token here to guard.
    pathname.current = '/recipes';
    renderSidebar();

    const accented = document.querySelectorAll(
      '[data-slot="sidebar-menu-button"][data-active="true"]'
    );
    // `asChild` merges the button into the Link, so the accented element is
    // the anchor itself rather than a wrapper around one.
    expect(accented).toHaveLength(1);
    expect(accented[0]).toHaveAttribute('href', '/recipes');
  });

  it('marks the open flyout link active in markup, not only in colour', () => {
    pathname.current = '/privacy-policy';
    renderSidebar();

    openHelp();

    const active = document.querySelectorAll('a[aria-current="page"]');
    expect(active).toHaveLength(1);
    expect(active[0]).toHaveAttribute('href', '/privacy-policy');
  });

  it('carries the shared nav surface treatment on its painted surface', () => {
    // The same constant MobileNavbar uses, so the two platforms' chrome cannot
    // drift apart. It has to land on the surface, not the positioning
    // container, or the surface's own background paints over it.
    renderSidebar();

    const surface = document.querySelector('[data-slot="sidebar-inner"]');
    expect(surface).not.toBeNull();
    for (const className of NAV_SURFACE_CLASS.split(' ')) {
      expect(surface).toHaveClass(className);
    }
  });
});
