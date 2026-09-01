import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Info, Map, RefreshCw, X } from '@/lib/icons';
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
    const continentZoom = definition.continent === 'eu' ? 4 : 3.5;
    if (!isOnline) {
      await activateForCoordinate(center[0], center[1]);
    }
    setCenter(center);
    setZoom(
      Math.max(definition.minZoom, Math.min(continentZoom, definition.maxZoom))
    );
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
      <div className='mx-auto max-w-3xl space-y-6 px-4 py-8'>
        <h1 className='text-2xl font-bold sm:text-3xl'>{t('title')}</h1>

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

        <section className='space-y-1.5 rounded-lg border p-4'>
          <h2 className='text-base font-semibold'>{t('storage.title')}</h2>
          <p className='text-sm'>
            {t('storage.summary', {
              used: formatBytes(storage.usageBytes),
              quota: formatBytes(storage.quotaBytes),
            })}
          </p>
          <p className='text-xs text-muted-foreground'>
            {storage.persisted
              ? t('storage.persistent')
              : t('storage.bestEffort')}
          </p>
        </section>

        <section className='space-y-3'>
          <h2 className='text-xl font-semibold'>{t('packages.title')}</h2>
          <div className='flex gap-3 rounded-lg bg-muted/60 p-3 text-sm text-muted-foreground'>
            <Info className='mt-0.5 h-4 w-4 shrink-0 text-foreground' />
            <p>{t('intro')}</p>
          </div>
          {loading && <p>{t('packages.loading')}</p>}
          {!loading && available.length === 0 && (
            <p className='text-muted-foreground'>{t('packages.empty')}</p>
          )}

          {available.map(definition => {
            const installed = cached[definition.id];
            const currentProgress = progress[definition.id];
            const updateAvailable =
              Boolean(installed) &&
              (installed.expired || installed.version !== definition.version);
            const hasBasemap = packageHasBasemap(definition);

            return (
              <article
                key={definition.id}
                className='space-y-3 rounded-lg border p-4 sm:p-5'
              >
                <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
                  <div className='min-w-0 flex-1'>
                    <h3 className='text-lg font-semibold leading-tight'>
                      {definition.name}
                    </h3>
                    <p className='mt-1 text-sm text-muted-foreground'>
                      {definition.description}
                    </p>
                    <p className='mt-2 text-xs font-medium text-muted-foreground'>
                      {formatBytes(packageSize(definition))}
                    </p>
                  </div>

                  {!currentProgress && !installed && (
                    <Button
                      disabled={!isOnline}
                      onClick={() => void download(definition.id)}
                    >
                      <Download className='mr-1 h-4 w-4' />
                      {t('packages.download')}
                    </Button>
                  )}
                  {!currentProgress && installed && updateAvailable && (
                    <div className='flex flex-wrap gap-2 sm:justify-end'>
                      <Button
                        disabled={!isOnline}
                        onClick={() => void download(definition.id)}
                      >
                        <RefreshCw className='mr-1 h-4 w-4' />
                        {t('packages.update')}
                      </Button>
                      <Button
                        variant='outline'
                        onClick={() => void remove(definition.id)}
                      >
                        {t('packages.remove')}
                      </Button>
                    </div>
                  )}
                  {!currentProgress && installed && !updateAvailable && (
                    <div className='flex gap-2'>
                      {hasBasemap && (
                        <Button onClick={() => void openPackage(definition)}>
                          <Map className='mr-1 h-4 w-4' />
                          {t('packages.open')}
                        </Button>
                      )}
                      <Button
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
                    {installed.expired
                      ? t('packages.expired')
                      : t('packages.downloaded', {
                          date: new Date(
                            installed.cachedAt
                          ).toLocaleDateString(),
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
