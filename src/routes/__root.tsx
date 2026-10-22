import { createRootRoute, Outlet, useLocation } from '@tanstack/react-router';
import { useRef, useState } from 'react';
import { useScroll, useMotionValueEvent, MotionConfig } from 'framer-motion';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppSidebar } from '@/components/Sidebar/AppSidebar';
import MobileNavbar from '@/components/Mobile/MobileNavbar';
import FloatingLanguageSwitcher from '@/components/FloatingLanguageSwitcher';
import { useIsMobile } from '@/hooks/use-mobile';
import { recordPath } from '@/lib/nav-history';
import { crossesIsolationBoundary } from '@/lib/isolation';
import { activateUpdate, isOutdated } from '@/lib/pwa';

// Evaluated once per document load: the route this document was served for.
const DOCUMENT_PATH =
  typeof window === 'undefined' ? '/' : window.location.pathname;
// The page on screen, so a change of search params alone is not a page change.
let shownPath = DOCUMENT_PATH;

export const Route = createRootRoute({
  // Two kinds of client-side move become a fresh load of the same URL:
  // - across the isolation line. Photo ID is served cross-origin isolated and
  //   nothing else is, and a page's isolation is fixed when it loads.
  // - to another page while a new version of the site is waiting. The update
  //   lands on a page change the visitor asked for, not mid-task.
  // Decided before the route renders, so the page being left stays up
  // (blurred, by index.html's view transition) until the new one has drawn.
  beforeLoad: ({ location, preload }) => {
    if (preload) return;
    const pageChanged = location.pathname !== shownPath;
    shownPath = location.pathname;
    if (
      !(pageChanged && isOutdated()) &&
      !crossesIsolationBoundary(DOCUMENT_PATH, location.pathname)
    )
      return;
    // The router has already pushed the URL. A replace, not a reload: reloads
    // never get a view transition. With a '#' a same-URL replace would only
    // scroll, so that case reloads.
    const href = window.location.href;
    void activateUpdate().then(() => {
      if (href.includes('#')) window.location.reload();
      else window.location.replace(href);
    });
    return new Promise<never>(() => {}); // this document never renders the route
  },
  component: RootComponent,
});

function RootComponent() {
  const isMobile = useIsMobile();
  const location = useLocation();
  recordPath(location.pathname);

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
