import * as React from 'react';
import {
  Map,
  Database,
  ChefHat,
  BookOpen,
  CalendarRange,
  Download,
  Settings,
  Heart,
  Info,
  ShieldCheck,
  Gavel,
  BarChart2,
  LifeBuoy,
} from '@/lib/icons';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { NavMain } from './nav-main';
import { useTranslation } from 'react-i18next';
import { useIsMobile } from '@/hooks/use-mobile';
import { shouldShowOfflineFeatures } from '@/lib/feature-flags';
import { NAV_SURFACE_CLASS } from '@/lib/nav-surface';
import MapLastUpdated from '@/components/MapLastUpdated';
import ThemeToggle from '@/components/ThemeToggle';

const basePath = import.meta.env.BASE_URL || '/';

export const AppSidebar = (props: React.ComponentProps<typeof Sidebar>) => {
  const { t } = useTranslation('sidebar');
  const { t: tCommon } = useTranslation('common');
  const { state, toggleSidebar } = useSidebar();
  const isMobile = useIsMobile();
  const data = {
    navMain: [
      {
        title: t('map'),
        url: `${basePath}`,
        icon: Map,
        isActive: true,
      },
      {
        title: t('worthForagingNow'),
        url: `${basePath}worth-foraging-now`,
        icon: CalendarRange,
        isActive: false,
      },
      {
        title: t('species'),
        url: `${basePath}species`,
        icon: Database,
        isActive: false,
      },
      {
        title: t('data'),
        url: `${basePath}data`,
        icon: BarChart2,
        isActive: false,
      },
      {
        title: t('recipes'),
        url: `${basePath}recipes`,
        icon: ChefHat,
        isActive: false,
      },
      ...(!isMobile
        ? [
            {
              title: t('instructions'),
              url: `${basePath}instructions`,
              icon: BookOpen,
              isActive: false,
            },
          ]
        : []),
      ...(!isMobile && shouldShowOfflineFeatures
        ? [
            {
              title: t('offlineMaps'),
              url: `${basePath}offline`,
              icon: Download,
              isActive: false,
            },
          ]
        : []),
      // Add settings to main nav only on mobile
      ...(isMobile
        ? [
            {
              title: t('settings'),
              url: `${basePath}settings`,
              icon: Settings,
              isActive: false,
            },
          ]
        : []),
    ],
    // Four low-frequency utility links under one entry. `#help` is the
    // parent-without-a-destination convention this file already uses.
    navHelp: !isMobile
      ? [
          {
            title: t('help'),
            url: '#help',
            icon: LifeBuoy,
            items: [
              {
                title: t('support'),
                url: `${basePath}support`,
                icon: Heart,
              },
              {
                title: t('impressum'),
                url: `${basePath}impressum`,
                icon: Info,
              },
              {
                title: t('privacyPolicy'),
                url: `${basePath}privacy-policy`,
                icon: ShieldCheck,
              },
              {
                title: t('termsOfUse'),
                url: `${basePath}termsuse`,
                icon: Gavel,
              },
            ],
            flyoutFooter: (
              <div className='flex flex-col gap-2'>
                <ThemeToggle />
                <MapLastUpdated variant='sidebar' />
              </div>
            ),
          },
        ]
      : [],
  };

  return (
    <Sidebar
      variant='floating'
      collapsible='icon'
      // shadcn's `variant='floating'` is layout/shape only; the elevation level
      // here is Raised, shared with MobileNavbar. See CONTEXT.md's note on the
      // naming collision. This replaces a hand-rolled
      // `bg-background/95 backdrop-blur` that sat on the positioning container
      // and so was painted over by the surface's own opaque background.
      surfaceClassOverride={NAV_SURFACE_CLASS}
      {...props}
    >
      {/* px-5 is the spine: the wordmark, the dividers and the nav labels all
          start at 20px from the panel edge. The rail drops to px-2, where the
          44px targets are all that fit. */}
      <SidebarHeader className='px-2 pt-4 pb-4 group-data-[collapsible=icon]:px-0'>
        {state === 'collapsed' && !isMobile ? (
          // In the rail the mark is the only way back, so it is the control.
          <button
            type='button'
            onClick={toggleSidebar}
            aria-label={tCommon('sidebar.toggle')}
            className='focus-ring mx-auto flex size-11 items-center justify-center rounded-full'
          >
            <img
              src='icons/logo_1.png'
              alt=''
              className='size-8 object-contain'
            />
          </button>
        ) : (
          <div className='flex items-center gap-2'>
            <img
              src='icons/logo_funges.png'
              alt={t('appName', { defaultValue: 'Funges' })}
              className='min-w-0 flex-1 object-contain'
            />
            {!isMobile && <SidebarTrigger className='shrink-0' />}
          </div>
        )}
      </SidebarHeader>
      <SidebarSeparator className='mx-2 group-data-[collapsible=icon]:mx-2' />
      <SidebarContent className='px-2 pt-4 pb-0 group-data-[collapsible=icon]:px-0'>
        <NavMain items={data.navMain} />
        <NavMain items={data.navHelp} className='mt-auto' />
      </SidebarContent>
    </Sidebar>
  );
};
