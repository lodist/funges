import { Link, useLocation } from '@tanstack/react-router';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import ThemeToggle from '@/components/ThemeToggle';
import InstallAppButton from '@/components/InstallAppButton';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { useTranslation } from 'react-i18next';
import SEO from '@/components/SEO';
import {
  BookOpen,
  Download,
  Heart,
  Info,
  ShieldCheck,
  Gavel,
  Smartphone,
  Squirrel,
  BarChart2,
} from '@/lib/icons';
import { shouldShowOfflineFeatures } from '@/lib/feature-flags';
import { currentSpace } from '@/lib/spaces';
import { isPlayApp, offersPlayStore, PLAY_STORE_URL } from '@/lib/platform';
import MapLastUpdated from '@/components/MapLastUpdated';
import { SpaceSwitcher } from '@/components/SpaceSwitcher';
import { HuertaAccount } from '@/components/HuertaAccount';

export default function SettingsPage() {
  const { t } = useTranslation('settings');
  const { t: tCommon } = useTranslation('common');
  const { t: tNav } = useTranslation('sidebar');
  const { pathname } = useLocation();
  // Each space has its own Settings (/settings, /huerta/settings): Data and
  // the offline maps are Terra's alone, the Huerta account Huerta's.
  const huerta = currentSpace(pathname) === 'huerta';
  const links = [
    // On phones the bottom bar gave Data's slot to Identify, so the hub
    // carries it; the desktop sidebar still lists it directly.
    ...(huerta
      ? []
      : [
          {
            url: '/data',
            label: tNav('data'),
            icon: BarChart2,
          },
        ]),
    {
      // Each space explains itself.
      url: huerta ? '/huerta/instructions' : '/instructions',
      label: t('instructions'),
      icon: BookOpen,
    },
    {
      url: '/play',
      label: tCommon('game.title'),
      icon: Squirrel,
    },
    ...(shouldShowOfflineFeatures && !huerta
      ? [
          {
            url: '/offline',
            label: t('offlineMaps'),
            icon: Download,
          },
        ]
      : []),
    ...(isPlayApp()
      ? []
      : [
          {
            url: '/support',
            label: t('support'),
            icon: Heart,
          },
        ]),
    ...(offersPlayStore()
      ? [
          {
            url: PLAY_STORE_URL,
            label: tNav('googlePlay'),
            icon: Smartphone,
          },
        ]
      : []),
    {
      url: '/impressum',
      label: t('impressum'),
      icon: Info,
    },
    {
      url: '/privacy-policy',
      label: t('privacyPolicy'),
      icon: ShieldCheck,
    },
    {
      url: '/termsuse',
      label: t('termsOfUse'),
      icon: Gavel,
    },
  ];

  return (
    <>
      <SEO
        title={huerta ? t('huertaTitle') : t('title')}
        description={tCommon('common.appDescription')}
        canonicalUrl={`${import.meta.env.BASE_URL}${huerta ? 'huerta/' : ''}settings`}
      />
      <div className='settings-page max-w-4xl mx-auto px-4 py-8 space-y-6'>
        <h1 className='text-3xl font-bold text-foreground dark:text-white'>
          {t('title')}
        </h1>
        {/* Phones have no sidebar: the hub is where the spaces meet. */}
        <SpaceSwitcher className='w-fit' />
        {/* Signed in to Huerta: the account and its morning alerts, in
            Huerta's Settings only. */}
        {huerta ? <HuertaAccount /> : null}

        <div className='space-y-4'>
          {links.map(link => (
            <Link key={link.url} to={link.url} className='block'>
              <Card interactive>
                <CardContent>
                  <div className='flex items-center gap-3'>
                    {link.icon && (
                      <link.icon className='h-5 w-5 text-muted-foreground' />
                    )}
                    <CardTitle>{link.label}</CardTitle>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {/* How fresh Terra's map data is: Terra's alone, like Data. */}
        {huerta ? null : (
          <div className='flex justify-center'>
            <MapLastUpdated variant='mobile' />
          </div>
        )}
        <div className='flex flex-col items-center justify-center py-6 space-y-6'>
          <ThemeToggle className='w-40' />
          <LanguageSwitcher />
          <InstallAppButton />
        </div>
      </div>
    </>
  );
}
