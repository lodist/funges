import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import MobileNavbar, {
  ACTIVE_ACCENT_CLASS,
} from '@/components/Mobile/MobileNavbar';
import { NAV_SURFACE_CLASS } from '@/lib/nav-surface';

/**
 * The mobile bar's contract is a small, fixed item set plus one visibly active
 * entry, so that's what's asserted here — which hrefs render, and which one
 * carries the active marker for a given route. Router hooks and `useIsMobile`
 * are mocked directly rather than wrapped in real providers, following
 * FeatureInfoModal.test.tsx / IdentifyPanel.test.tsx.
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

const { isMobile } = vi.hoisted(() => ({ isMobile: { current: true } }));
vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => isMobile.current,
}));

const { offlineEnabled } = vi.hoisted(() => ({
  offlineEnabled: { current: true },
}));
vi.mock('@/lib/feature-flags', () => ({
  get shouldShowOfflineFeatures() {
    return offlineEnabled.current;
  },
}));

const navLinks = () =>
  screen.getAllByRole('link').map(link => link.getAttribute('href') ?? '');

const activeLink = () => document.querySelector('a[aria-current="page"]');

beforeEach(() => {
  pathname.current = '/';
  isMobile.current = true;
  offlineEnabled.current = true;
});

describe('MobileNavbar', () => {
  it('renders nothing on desktop', () => {
    isMobile.current = false;
    render(<MobileNavbar hidden={false} />);

    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('renders only the six entries that fit a small screen', () => {
    render(<MobileNavbar hidden={false} />);

    // Everything else (instructions, offline maps, legal pages) is reachable
    // through Settings rather than crowding the bar.
    expect(navLinks()).toEqual([
      '/',
      '/worth-foraging-now',
      '/recipes',
      '/species',
      '/data',
      '/settings',
    ]);
  });

  it('marks the entry for the current route as active', () => {
    pathname.current = '/species';
    render(<MobileNavbar hidden={false} />);

    expect(activeLink()).toHaveAttribute('href', '/species');
  });

  it('gives the active entry the accent tint and no other entry', () => {
    pathname.current = '/data';
    render(<MobileNavbar hidden={false} />);

    for (const link of screen.getAllByRole('link')) {
      const isTarget = link.getAttribute('href') === '/data';
      for (const className of ACTIVE_ACCENT_CLASS.split(' ')) {
        // A dark-mode variant is part of the accent, so the light-mode class
        // alone passing would hide a regression in the other theme.
        if (isTarget) {
          expect(link).toHaveClass(className);
        } else {
          expect(link).not.toHaveClass(className);
        }
      }
    }
  });

  it('marks only one entry active at a time', () => {
    pathname.current = '/recipes';
    render(<MobileNavbar hidden={false} />);

    expect(document.querySelectorAll('a[aria-current="page"]')).toHaveLength(1);
  });

  it('keeps Settings active for the sections it rolls up', () => {
    // The bar has no entry of its own for these, so Settings has to stand in
    // for them or the user loses their place entirely.
    for (const route of [
      '/settings',
      '/instructions',
      '/support',
      '/impressum',
      '/privacy-policy',
      '/termsuse',
      '/offline',
    ]) {
      pathname.current = route;
      const { unmount } = render(<MobileNavbar hidden={false} />);

      expect(activeLink(), route).toHaveAttribute('href', '/settings');
      unmount();
    }
  });

  it('stops rolling Offline Maps up into Settings when the flag is off', () => {
    // With the flag off the route is unreachable, so Settings claiming it would
    // be claiming a section that isn't there.
    offlineEnabled.current = false;
    pathname.current = '/offline';
    render(<MobileNavbar hidden={false} />);

    expect(activeLink()).toBeNull();
  });

  it('carries the shared nav surface treatment', () => {
    render(<MobileNavbar hidden={false} />);

    const nav = screen.getByRole('navigation');
    for (const className of NAV_SURFACE_CLASS.split(' ')) {
      expect(nav).toHaveClass(className);
    }
  });
});
