import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Database, Download, Map, RefreshCw, X } from 'lucide-react';
import SEO from '@/components/SEO';
import { usePWA } from '@/hooks/use-pwa';
import { useOfflineStore } from '@/store/offlineStore';
import { packageHasBasemap, packageSize } from '@/lib/offline-packages';
import { Button } from '@/components/ui/button';
import { useMapStore } from '@/store/mapStore';
import { useNavigate } from '@tanstack/react-router';

function formatBytes(bytes: number | null): string {
  if (bytes === null) return '—';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export default function OfflineMapsPage() {
  const { t } = useTranslation('offline');
  const { isOnline } = usePWA();
  const navigate = useNavigate({ from: '/offline' });
  const { setCenter, setZoom } = useMapStore();
  const {
    available,
    cached,
    progress,
    storage,
    ready,
    loading,
    error,
    initialize,
    download,
    cancel,
    remove,
    activateForCoordinate,
  } = useOfflineStore();

  const openPackage = async (
    definition: (typeof available)[number]
  ): Promise<void> => {
    const [west, south, east, north] = definition.bounds;
    const center: [number, number] = [(west + east) / 2, (south + north) / 2];
    await activateForCoordinate(center[0], center[1]);
    setCenter(center);
    setZoom(Math.min(8, definition.maxZoom));
    await navigate({ to: '/' });
  };

  useEffect(() => {
    if (!ready && !loading) void initialize();
  }, [initialize, loading, ready]);

  return (
    <>
      <SEO
        title={t('title')}
        description={t('description')}
        canonicalUrl={`${import.meta.env.BASE_URL}offline`}
      />
      <div className='mx-auto max-w-4xl space-y-6 px-4 py-8'>
        <div>
          <h1 className='text-3xl font-bold'>{t('title')}</h1>
          <p className='mt-2 text-muted-foreground'>{t('intro')}</p>
        </div>

        {!isOnline && (
          <div className='rounded bg-yellow-100 px-4 py-2 text-yellow-800'>
            {t('offlineBanner')}
          </div>
        )}
        {error && (
          <div className='rounded bg-red-100 px-4 py-2 text-red-800'>
            {error}
          </div>
        )}

        <section className='space-y-2 rounded-lg border p-4'>
          <h2 className='text-xl font-semibold'>{t('storage.title')}</h2>
          <p>
            {t('storage.summary', {
              used: formatBytes(storage.usageBytes),
              quota: formatBytes(storage.quotaBytes),
            })}
          </p>
          <p className='text-sm text-muted-foreground'>
            {storage.persisted
              ? t('storage.persistent')
              : t('storage.bestEffort')}
          </p>
        </section>

        <section className='space-y-3'>
          <h2 className='text-xl font-semibold'>{t('packages.title')}</h2>
          {loading && <p>{t('packages.loading')}</p>}
          {!loading && available.length === 0 && (
            <p className='text-muted-foreground'>{t('packages.empty')}</p>
          )}

          {available.map(definition => {
            const installed = cached[definition.id];
            const currentProgress = progress[definition.id];
            const updateAvailable =
              Boolean(installed) && installed.version !== definition.version;
            const hasBasemap = packageHasBasemap(definition);

            return (
              <article
                key={definition.id}
                className='space-y-3 rounded-lg border p-4'
              >
                <div className='flex flex-wrap items-start justify-between gap-3'>
                  <div className='min-w-0 flex-1'>
                    <h3 className='font-semibold'>{definition.name}</h3>
                    <p className='text-sm text-muted-foreground'>
                      {definition.description}
                    </p>
                    <div className='mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground'>
                      <span>{formatBytes(packageSize(definition))}</span>
                      <span>
                        {t('packages.zoomRange', {
                          min: definition.minZoom,
                          max: definition.maxZoom,
                        })}
                      </span>
                      <span className='inline-flex items-center gap-1'>
                        {hasBasemap ? (
                          <Map className='h-3.5 w-3.5' />
                        ) : (
                          <Database className='h-3.5 w-3.5' />
                        )}
                        {hasBasemap
                          ? t('packages.fullMap')
                          : t('packages.forecastOnly')}
                      </span>
                    </div>
                  </div>

                  {!currentProgress && !installed && (
                    <Button
                      size='sm'
                      disabled={!isOnline}
                      onClick={() => void download(definition.id)}
                    >
                      <Download className='mr-1 h-4 w-4' />
                      {t('packages.download')}
                    </Button>
                  )}
                  {!currentProgress && installed && updateAvailable && (
                    <Button
                      size='sm'
                      disabled={!isOnline}
                      onClick={() => void download(definition.id)}
                    >
                      <RefreshCw className='mr-1 h-4 w-4' />
                      {t('packages.update')}
                    </Button>
                  )}
                  {!currentProgress && installed && !updateAvailable && (
                    <div className='flex gap-2'>
                      {hasBasemap && (
                        <Button
                          size='sm'
                          onClick={() => void openPackage(definition)}
                        >
                          <Map className='mr-1 h-4 w-4' />
                          {t('packages.open')}
                        </Button>
                      )}
                      <Button
                        size='sm'
                        variant='outline'
                        onClick={() => void remove(definition.id)}
                      >
                        {t('packages.remove')}
                      </Button>
                    </div>
                  )}
                </div>

                {installed && (
                  <p className='text-xs text-muted-foreground'>
                    {t('packages.downloaded', {
                      date: new Date(installed.cachedAt).toLocaleDateString(),
                      version: installed.version,
                    })}
                  </p>
                )}

                {currentProgress && (
                  <div className='space-y-2'>
                    <div className='flex items-center justify-between text-sm'>
                      <span>
                        {t('packages.progress', {
                          percent: Math.round(currentProgress.fraction * 100),
                        })}
                      </span>
                      <Button
                        size='sm'
                        variant='ghost'
                        onClick={() => cancel(definition.id)}
                      >
                        <X className='mr-1 h-4 w-4' />
                        {t('packages.cancel')}
                      </Button>
                    </div>
                    <div
                      className='h-2 overflow-hidden rounded bg-muted'
                      role='progressbar'
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(currentProgress.fraction * 100)}
                    >
                      <div
                        className='h-full bg-primary transition-[width]'
                        style={{
                          width: `${currentProgress.fraction * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </section>
      </div>
    </>
  );
}
