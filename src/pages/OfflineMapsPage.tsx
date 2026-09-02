import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import SEO from '@/components/SEO';
import { usePWA } from '@/hooks/use-pwa';
import { useOfflineStore, CONTINENTS } from '@/store/offlineStore';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';

const QUOTA_MB = 500;
const BYTES_PER_MB = 1024 * 1024;

export default function OfflineMapsPage() {
  const { t } = useTranslation('offline');
  const { isOnline } = usePWA();
  const {
    cached,
    downloading,
    error,
    refresh,
    download,
    remove,
    purgeExpired,
  } = useOfflineStore();

  useEffect(() => {
    refresh();
  }, [refresh]);

  const usedMb = Math.round(
    Object.values(cached).reduce(
      (sum, info) => sum + (info?.sizeBytes ?? 0),
      0
    ) / BYTES_PER_MB
  );

  return (
    <>
      <SEO
        title={t('title')}
        description={t('description')}
        canonicalUrl={`${import.meta.env.BASE_URL}offline`}
      />
      <div className='max-w-4xl mx-auto px-4 py-8 space-y-6'>
        <h1 className='text-3xl font-bold'>{t('title')}</h1>

        {!isOnline && (
          <div className='bg-status-warning-background text-status-warning-text px-4 py-2 rounded'>
            {t('offlineBanner')}
          </div>
        )}

        {error && (
          <div className='bg-destructive/10 text-destructive-text px-4 py-2 rounded'>
            {error}
          </div>
        )}

        <section className='space-y-2'>
          <h2 className='text-xl font-semibold'>{t('storage.title')}</h2>
          <p>{t('storage.summary', { used: usedMb, quota: QUOTA_MB })}</p>
          <Button variant='outline' onClick={purgeExpired} className='mt-2'>
            {t('storage.purge')}
          </Button>
          <p className='text-sm text-muted-foreground'>{t('storage.ttl')}</p>
        </section>

        <section className='space-y-2'>
          <h2 className='text-xl font-semibold'>{t('regions.title')}</h2>
          <div className='overflow-x-auto'>
            <table className='min-w-full divide-y divide-border text-sm'>
              <thead>
                <tr>
                  <th className='px-2 py-1 text-left'>{t('regions.name')}</th>
                  <th className='px-2 py-1 text-left'>{t('regions.status')}</th>
                  <th className='px-2 py-1'>
                    <span className='sr-only'>{t('regions.download')}</span>
                  </th>
                </tr>
              </thead>
              <tbody className='divide-y divide-border'>
                {CONTINENTS.map(continent => {
                  const info = cached[continent];
                  const isDownloading = Boolean(downloading[continent]);
                  const nameId = `offline-region-${continent}`;
                  return (
                    <tr key={continent} className='hover:bg-muted'>
                      <td id={nameId} className='px-2 py-2.5'>
                        {t(`regions.${continent}`)}
                      </td>
                      <td className='px-2 py-2.5'>
                        {isDownloading
                          ? t('regions.downloading')
                          : info
                            ? t('regions.cachedOn', {
                                date: new Date(
                                  info.cachedAt
                                ).toLocaleDateString(),
                              })
                            : t('regions.notCached')}
                      </td>
                      <td className='px-2 py-2.5 text-right'>
                        <Switch
                          aria-labelledby={nameId}
                          checked={Boolean(info)}
                          disabled={isDownloading || (!isOnline && !info)}
                          onCheckedChange={on =>
                            on ? download(continent) : remove(continent)
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
