import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import SEO from '@/components/SEO';
import { usePWA } from '@/hooks/use-pwa';
import { useOfflineStore } from '@/store/offlineStore';
import { useMapStore } from '@/store/mapStore';
import { Button } from '@/components/ui/button';

export default function OfflineMapsPage() {
  const { t } = useTranslation('offline');
  const { isOnline } = usePWA();
  const { cachedSpecies, addSpecies, removeSpecies, clearAll, cacheQuota } =
    useOfflineStore();
  const { speciesOptions } = useMapStore();

  const used = cachedSpecies.length * 10; // rough placeholder per species

  useEffect(() => {
    // placeholder for future daily refresh logic or purge expired
  }, []);

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
          <div className='bg-yellow-100 text-yellow-800 px-4 py-2 rounded'>
            {t('offlineBanner')}
          </div>
        )}

        <section className='space-y-2'>
          <h2 className='text-xl font-semibold'>{t('storage.title')}</h2>
          <p>{t('storage.summary', { used, quota: cacheQuota })}</p>
          <Button variant='outline' onClick={clearAll} className='mt-2'>
            {t('storage.purge')}
          </Button>
          <p className='text-sm text-muted-foreground'>{t('storage.ttl')}</p>
        </section>

        <section className='space-y-2'>
          <h2 className='text-xl font-semibold'>{t('species.title')}</h2>
          <div className='overflow-x-auto'>
            <table className='min-w-full divide-y divide-gray-200 text-sm'>
              <thead>
                <tr>
                  <th className='px-2 py-1 text-left'>{t('species.name')}</th>
                  <th className='px-2 py-1 text-left'>{t('species.status')}</th>
                  <th className='px-2 py-1'></th>
                </tr>
              </thead>
              <tbody className='divide-y divide-gray-200'>
                {speciesOptions.map(s => {
                  const cached = cachedSpecies.includes(s.code);
                  return (
                    <tr key={s.code} className='hover:bg-gray-50'>
                      <td className='px-2 py-1'>
                        {s.emoji} {s.code}
                      </td>
                      <td className='px-2 py-1'>
                        {cached ? t('species.cached') : t('species.notCached')}
                      </td>
                      <td className='px-2 py-1 text-right space-x-2'>
                        {cached ? (
                          <Button
                            size='sm'
                            onClick={() => removeSpecies(s.code)}
                          >
                            {t('species.remove')}
                          </Button>
                        ) : (
                          <Button size='sm' onClick={() => addSpecies(s.code)}>
                            {t('species.download')}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className='flex gap-2 mt-2'>
            <Button
              size='sm'
              onClick={() => speciesOptions.forEach(s => addSpecies(s.code))}
            >
              {t('species.downloadAll')}
            </Button>
            <Button size='sm' variant='destructive' onClick={clearAll}>
              {t('species.removeAll')}
            </Button>
          </div>
        </section>
      </div>
    </>
  );
}
