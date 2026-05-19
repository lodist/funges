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
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
} from '@/components/ui/sidebar';
import { NavSecondary } from './nav-secondary';
import { NavMain } from './nav-main';
import { useTranslation } from 'react-i18next';
import { useIsMobile } from '@/hooks/use-mobile';
import { shouldShowOfflineFeatures } from '@/lib/feature-flags';
import MapLastUpdated from '@/components/MapLastUpdated';

const basePath = import.meta.env.BASE_URL || '/';

export const AppSidebar = (props: React.ComponentProps<typeof Sidebar>) => {
  const { t } = useTranslation('sidebar');
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
    navSecondary: !isMobile
      ? [
          {
            title: t('support'),
            url: `${basePath}support`,
            icon: Heart,
          },
          {
            title: t('impressum'),
            url: `${basePath}impressum`,
            icon: Info,
            isActive: false,
          },
          {
            title: t('privacyPolicy'),
            url: `${basePath}privacy-policy`,
            icon: ShieldCheck,
            isActive: false,
          },
          {
            title: t('termsOfUse'),
            url: `${basePath}termsuse`,
            icon: Gavel,
            isActive: false,
          },
        ]
      : [],
  };

  return (
    <Sidebar
      variant='floating'
      collapsible='offcanvas'
      className='bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60'
      {...props}
    >
      <SidebarHeader className='border-b px-6 py-4'>
        <div className='flex items-center gap-3'>
          <img
            src='icons/logo_1.png'
            alt='Funges Logo'
            className='h-8 w-8 rounded-lg object-cover'
          />
          <div className='flex flex-col'>
            <h2 className='text-lg font-semibold tracking-tight'>
              {t('appName', { defaultValue: 'Funges' })}
            </h2>
            <p className='text-xs text-muted-foreground'>
              {t('appDescription', { defaultValue: 'Foraging Guide' })}
            </p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent className='px-3 pt-4 pb-0'>
        <NavMain items={data.navMain} />
        <NavSecondary items={data.navSecondary} className='mt-auto' />
      </SidebarContent>
      {!isMobile && (
        <SidebarFooter className='border-t py-3 px-1'>
          <div className='flex flex-col gap-2 items-center justify-center'>
            <div className='flex items-center gap-2 text-[10px] text-muted-foreground justify-center'>
              <div className='w-2 h-2 bg-green-500 rounded-full animate-pulse flex-shrink-0'></div>
              <span className='break-words leading-relaxed'>
                <MapLastUpdated variant='sidebar' />
              </span>
            </div>
          </div>
        </SidebarFooter>
      )}
    </Sidebar>
  );
};
