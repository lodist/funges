import { Link } from '@tanstack/react-router';
import LanguageSwitcher from '@/components/LanguageSwitcher';
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
} from 'lucide-react';
import { shouldShowOfflineFeatures } from '@/lib/feature-flags';
import MapLastUpdated from '@/components/MapLastUpdated';

export default function SettingsPage() {
  const { t } = useTranslation('settings');
  const { t: tCommon } = useTranslation('common');
  const links = [
    {
      url: '/instructions',
      label: t('instructions'),
      icon: BookOpen,
    },
    ...(shouldShowOfflineFeatures
      ? [
          {
            url: '/offline',
            label: t('offlineMaps'),
            icon: Download,
          },
        ]
      : []),
    {
      url: '/support',
      label: t('support'),
      icon: Heart,
    },
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
        title={t('title')}
        description={tCommon('common.appDescription')}
        canonicalUrl={`${import.meta.env.BASE_URL}settings`}
      />
      <div className='settings-page max-w-4xl mx-auto px-4 py-8 space-y-6'>
        <h1 className='text-3xl font-bold text-foreground dark:text-white'>
          {t('title')}
        </h1>

        <div className='space-y-4'>
          {links.map(link => (
            <Link key={link.url} to={link.url} className='block'>
              <Card className='bg-card hover:bg-muted transition-colors'>
                <CardContent className='py-4'>
                  <div className='flex items-center gap-3'>
                    {link.icon && (
                      <link.icon className='h-5 w-5 text-muted-foreground' />
                    )}
                    <CardTitle className='text-foreground dark:text-white'>
                      {link.label}
                    </CardTitle>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {/* Data Freshness Info */}
        <div className='flex justify-center'>
          <MapLastUpdated variant='mobile' />
        </div>
        <div className='flex flex-col items-center justify-center py-6 space-y-6'>
          <LanguageSwitcher />
          <InstallAppButton />
        </div>
      </div>
    </>
  );
}
