import { createRootRoute, Outlet, useLocation } from '@tanstack/react-router';
import { useRef, useState } from 'react';
import { useScroll, useMotionValueEvent } from 'framer-motion';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/Sidebar/AppSidebar';
import MobileNavbar from '@/components/Mobile/MobileNavbar';
import FloatingLanguageSwitcher from '@/components/FloatingLanguageSwitcher';
import { useIsMobile } from '@/hooks/use-mobile';

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  const isMobile = useIsMobile();
  const location = useLocation();
  const isMapPage =
    location.pathname === import.meta.env.BASE_URL || location.pathname === '/';
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
    <div className='app-root h-screen flex flex-col'>
      <SidebarProvider defaultOpen={!isMobile}>
        {!isMobile && <AppSidebar />}
        <SidebarInset>
          <main
            ref={mainRef}
            className={`flex-1 bg-background ${isMobile && isMapPage ? 'overflow-hidden' : 'overflow-y-auto'}`}
          >
            <div
              className={
                isMobile && isMapPage
                  ? 'h-full bg-background'
                  : `p-4 bg-background ${isMobile ? 'mobile-navbar-spacing' : ''}`
              }
            >
              {/* Mobile pages get extra bottom padding to account for fixed navbar */}
              <Outlet />
            </div>
          </main>
        </SidebarInset>
      </SidebarProvider>
      {isMobile && <MobileNavbar hidden={hideNavbar} />}
      {!isMobile && <FloatingLanguageSwitcher />}
    </div>
  );
}
