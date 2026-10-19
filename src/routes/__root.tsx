import { createRootRoute, Outlet, useLocation } from '@tanstack/react-router';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useScroll, useMotionValueEvent, MotionConfig } from 'framer-motion';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppSidebar } from '@/components/Sidebar/AppSidebar';
import MobileNavbar from '@/components/Mobile/MobileNavbar';
import FloatingLanguageSwitcher from '@/components/FloatingLanguageSwitcher';
import { useIsMobile } from '@/hooks/use-mobile';
import { recordPath } from '@/lib/nav-history';
import { crossesIsolationBoundary } from '@/lib/isolation';
import { currentSpace, rememberPath } from '@/lib/spaces';

// Evaluated once per document load: the route this document was served for.
const DOCUMENT_PATH =
  typeof window === 'undefined' ? '/' : window.location.pathname;

export const Route = createRootRoute({
  // Photo ID is served cross-origin isolated and nothing else is, and a page's
  // isolation is fixed when it loads. A client-side move across that line —
  // a link, the back button — becomes a fresh load of the same URL. Decided
  // before the route renders, so the page being left stays up (blurred, by
  // index.html's view transition) until the new one has drawn.
  beforeLoad: ({ location, preload }) => {
    if (preload || !crossesIsolationBoundary(DOCUMENT_PATH, location.pathname))
      return;
    // The router has already pushed the URL. A replace, not a reload: reloads
    // never get a view transition. With a '#' a same-URL replace would only
    // scroll, so that case reloads.
    const href = window.location.href;
    if (href.includes('#')) window.location.reload();
    else window.location.replace(href);
    return new Promise<never>(() => {}); // this document never renders the route
  },
  component: RootComponent,
});

function RootComponent() {
  const isMobile = useIsMobile();
  const location = useLocation();
  recordPath(location.pathname);

  // The space's colours hang off <html>, so dialogs and menus portalled out of
  // the page wear them too; set before paint, so a page never flashes green.
  const space = currentSpace(location.pathname);
  useLayoutEffect(() => {
    document.documentElement.dataset.space = space;
  }, [space]);
  useEffect(() => rememberPath(location.pathname), [location.pathname]);

  // The map is the one route that owns the viewport (no document scroll).
  const isMapPage =
    location.pathname.replace(/\/+$/, '') ===
    `${import.meta.env.BASE_URL}map`.replace(/\/+$/, '');
  // The landing page is the other full-bleed route: no sidebar, no padding.
  const isLandingPage =
    location.pathname.replace(/\/+$/, '') ===
    import.meta.env.BASE_URL.replace(/\/+$/, '');
  const mainRef = useRef<HTMLDivElement>(null);
  const [hideNavbar, setHideNavbar] = useState(false);
  const lastScrollYRef = useRef(0);
  const { scrollY } = useScroll(isMapPage ? undefined : { container: mainRef });

  useMotionValueEvent(scrollY, 'change', latest => {
    if (!isMobile) return;

    if (latest > lastScrollYRef.current && latest > 100) {
      setHideNavbar(true);
    } else if (latest < lastScrollYRef.current) {
      setHideNavbar(false);
    }

    lastScrollYRef.current = latest;
  });

  return (
    // Motion (#225): the global CSS reduced-motion rule collapses CSS
    // transitions, but it cannot touch the inline transforms framer-motion
    // writes from JS — its own default is `reducedMotion: 'never'`. Measured
    // before this wrapper: with prefers-reduced-motion: reduce, MobileNavbar
    // still travelled 0→120px through 39 distinct transform values. One
    // provider covers every motion component, present and future.
    <MotionConfig reducedMotion='user'>
      {/* The delay and the skip-delay window live on the atom; a subtree that
          needs a different one nests its own provider. */}
      <TooltipProvider>
        <div className='app-root h-screen flex flex-col'>
          <SidebarProvider defaultOpen={!isMobile}>
            {!isMobile && !isLandingPage && <AppSidebar />}
            <SidebarInset>
              <main
                ref={mainRef}
                className={`flex-1 bg-background ${isMobile && isMapPage ? 'overflow-hidden' : 'overflow-y-auto'}`}
              >
                <div
                  className={
                    isMobile && isMapPage
                      ? 'h-full bg-background'
                      : `bg-background ${isLandingPage ? '' : 'p-4'} ${isMobile ? 'mobile-navbar-spacing' : ''}`
                  }
                >
                  {/* Mobile pages get extra bottom padding to account for fixed navbar */}
                  <Outlet />
                </div>
              </main>
            </SidebarInset>
          </SidebarProvider>
          {isMobile && <MobileNavbar hidden={hideNavbar} />}
          {!isMobile && <FloatingLanguageSwitcher onBand={isMapPage} />}
        </div>
      </TooltipProvider>
    </MotionConfig>
  );
}
