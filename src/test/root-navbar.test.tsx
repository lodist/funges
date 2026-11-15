import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import type { ComponentType, ReactNode } from 'react';
import '@/i18n';

/**
 * The phone bar steps aside while a page scrolls down. The map never scrolls,
 * so a bar hidden on the page before it has to come back on arrival: with it
 * gone there is no way off the map (Worth Foraging Now → "On map").
 */

const { pathname } = vi.hoisted(() => ({ pathname: { current: '' } }));

vi.mock('@tanstack/react-router', () => ({
  createRootRoute: (options: unknown) => ({ options }),
  Outlet: () => null,
  redirect: vi.fn(),
  useLocation: () => ({ pathname: pathname.current }),
  useNavigate: () => vi.fn(),
  Link: ({
    to,
    children,
    reloadDocument: _reloadDocument,
    ...props
  }: {
    to: string;
    children: ReactNode;
    reloadDocument?: boolean;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));
vi.mock('@/components/SpaceSwitcher', () => ({ SpaceNavButton: () => null }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => true }));

const { Route } = await import('@/routes/__root');
const Root = (Route as unknown as { options: { component: ComponentType } })
  .options.component;

const HIDDEN = 'translate-y-[120px]';
const base = import.meta.env.BASE_URL;

describe('the phone nav bar', () => {
  it('comes back on the map after a scrolled page hid it', () => {
    pathname.current = `${base}worth-foraging-now`;
    const { container, rerender } = render(<Root />);
    const nav = container.querySelector('nav')!;
    // The page scrolls the inner <main>; the outer one is the sidebar inset.
    const page = container.querySelector('main main')!;

    Object.defineProperty(page, 'scrollTop', { value: 900 });
    fireEvent.scroll(page);
    expect(nav.className).toContain(HIDDEN);

    pathname.current = `${base}map`;
    rerender(<Root />);
    expect(nav.className).not.toContain(HIDDEN);
  });
});
