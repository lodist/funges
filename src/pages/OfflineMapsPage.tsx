import { useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import SEO from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { usePWA } from '@/hooks/use-pwa';
import { BAND_SURFACE_CLASS } from '@/lib/band-surface';
import {
  AlertTriangle,
  CheckCircle,
  Download,
  Map,
  RefreshCw,
  WifiOff,
  X,
} from '@/lib/icons';
import { OFFLINE_PACKAGE_MAX_AGE_MS } from '@/lib/offlineCache';
import { packageHasBasemap, packageSize } from '@/lib/offline-packages';
import { cn } from '@/lib/utils';
import { useMapStore } from '@/store/mapStore';
import { useOfflineStore } from '@/store/offlineStore';

function formatBytes(bytes: number | null): string {
  if (bytes === null) return '—';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/** What still works with no signal, and what does not. It lived on the
 *  Instructions page, where nobody looks the night before a trip. */
const OFFLINE_GUIDE = [
  { key: 'prepare', icon: Download },
  { key: 'available', icon: CheckCircle },
  { key: 'unavailable', icon: WifiOff },
] as const;

export default function OfflineMapsPage() {
  const { t, i18n } = useTranslation(['offline', 'instructions']);
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
    await navigate({ to: '/map' });
  };

  useEffect(() => {
    if (!ready && !loading) void initialize();
  }, [initialize, loading, ready]);

  const day = new Intl.DateTimeFormat(i18n.language, {
    day: 'numeric',
    month: 'long',
  });
  const validUntil = (cachedAt: number) =>
    day.format(new Date(cachedAt + OFFLINE_PACKAGE_MAX_AGE_MS));
  const regionName = (definition: (typeof available)[number]) =>
    t(`catalog.${definition.id}.name`, { defaultValue: definition.name });

  // The status band answers one question: can I leave without signal?
  const valid = available.filter(
    definition => cached[definition.id] && !cached[definition.id].expired
  );
  const expired = available.filter(
    definition => cached[definition.id]?.expired
  );
  const soonest = Math.min(
    ...valid.map(definition => cached[definition.id].cachedAt)
  );
  const status =
    valid.length > 0 ? 'ready' : expired.length > 0 ? 'expired' : 'notReady';
  const usedFraction =
    storage.usageBytes !== null && storage.quotaBytes
      ? Math.min(1, storage.usageBytes / storage.quotaBytes)
      : null;

  return (
    <>
      <SEO
        title={t('title')}
        description={t('description')}
        canonicalUrl={`${import.meta.env.BASE_URL}offline`}
      />
      <div className='container mx-auto max-w-5xl px-4 py-8'>
        <h1 className='mb-8 text-3xl leading-tight font-semibold text-foreground sm:text-4xl'>
          {t('title')}
        </h1>

        {!isOnline || error ? (
          <div className='mb-6 flex flex-col gap-3'>
            {!isOnline ? (
              <p className='flex items-start gap-2 rounded-lg bg-status-warning-background px-3 py-2 text-sm font-medium text-status-warning-text ring-2 ring-status-warning-border/60'>
                <AlertTriangle className='mt-0.5 size-4 shrink-0' />
                {t('offlineBanner')}
              </p>
            ) : null}
            {error ? (
              <p className='rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive-text'>
                {error}
              </p>
            ) : null}
          </div>
        ) : null}

        <section
          aria-labelledby='offline-status'
          className={cn(BAND_SURFACE_CLASS, 'rounded-card p-6 sm:p-8 lg:p-10')}
        >
          <div className='flex items-start gap-4 sm:gap-5'>
            <span className='grid size-12 shrink-0 place-items-center rounded-full bg-happy-50/10 dark:bg-happy-50/10'>
              {status === 'ready' ? (
                <CheckCircle className='size-6 text-happy-300' />
              ) : (
                <WifiOff className='size-6 text-happy-300' />
              )}
            </span>
            <div className='min-w-0'>
              <h2
                id='offline-status'
                className='text-3xl leading-tight font-semibold text-balance text-happy-50 sm:text-4xl'
              >
                {t(`status.${status}`)}
              </h2>
              <p className='mt-2 text-happy-100 sm:text-lg'>
                {status === 'ready'
                  ? t('status.readyDetail', {
                      regions: valid.map(regionName).join(', '),
                      date: validUntil(soonest),
                    })
                  : status === 'expired'
                    ? t('status.expiredDetail')
                    : t('intro')}
              </p>
            </div>
          </div>

          <div className='mt-8 max-w-xl'>
            <div className='flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1'>
              <p className='type-micro text-happy-100'>{t('storage.title')}</p>
              <p className='text-sm text-happy-50'>
                {t('storage.summary', {
                  used: formatBytes(storage.usageBytes),
                  quota: formatBytes(storage.quotaBytes),
                })}
              </p>
            </div>
            <span
              aria-hidden='true'
              className='mt-2 block h-2 overflow-hidden rounded-full bg-happy-50/15 dark:bg-happy-50/15'
            >
              <span
                className='block h-full rounded-full bg-happy-500'
                style={{ width: `${(usedFraction ?? 0) * 100}%` }}
              />
            </span>
            <p className='mt-2 text-xs text-happy-100'>
              {storage.persisted
                ? t('storage.persistent')
                : t('storage.bestEffort')}
            </p>
          </div>
        </section>

        <section aria-labelledby='offline-packages' className='mt-10'>
          <h2
            id='offline-packages'
            className='mb-5 text-2xl font-semibold text-foreground sm:text-3xl'
          >
            {t('packages.title')}
          </h2>
          {loading ? (
            <p className='text-muted-foreground'>{t('packages.loading')}</p>
          ) : null}
          {!loading && available.length === 0 ? (
            <p className='text-muted-foreground'>{t('packages.empty')}</p>
          ) : null}

          <ul className='flex flex-col gap-4'>
            {available.map(definition => {
              const installed = cached[definition.id];
              const currentProgress = progress[definition.id];
              const updateAvailable =
                Boolean(installed) &&
                (installed.expired || installed.version !== definition.version);
              const hasBasemap = packageHasBasemap(definition);

              return (
                <li
                  key={definition.id}
                  className='flex flex-col gap-4 rounded-card bg-card p-5 elevation-raised sm:p-6'
                >
                  <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
                    <div className='min-w-0 flex-1'>
                      <h3 className='text-xl leading-tight font-semibold text-foreground'>
                        {regionName(definition)}
                      </h3>
                      <p className='mt-1 text-sm text-muted-foreground'>
                        {t(`catalog.${definition.id}.description`, {
                          defaultValue: definition.description,
                        })}
                      </p>
                      <p className='mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm'>
                        <span className='font-medium text-foreground'>
                          {formatBytes(packageSize(definition))}
                        </span>
                        {installed ? (
                          <span
                            className={
                              installed.expired
                                ? 'text-status-warning-text'
                                : 'text-primary-text'
                            }
                          >
                            {installed.expired
                              ? t('packages.expired')
                              : t('packages.validUntil', {
                                  date: validUntil(installed.cachedAt),
                                })}
                          </span>
                        ) : null}
                      </p>
                    </div>

                    {!currentProgress && !installed ? (
                      <Button
                        disabled={!isOnline}
                        onClick={() => void download(definition.id)}
                      >
                        <Download />
                        {t('packages.download')}
                      </Button>
                    ) : null}
                    {!currentProgress && installed && updateAvailable ? (
                      <div className='flex flex-wrap gap-2 sm:justify-end'>
                        <Button
                          disabled={!isOnline}
                          onClick={() => void download(definition.id)}
                        >
                          <RefreshCw />
                          {t('packages.update')}
                        </Button>
                        <Button
                          variant='outline'
                          onClick={() => void remove(definition.id)}
                        >
                          {t('packages.remove')}
                        </Button>
                      </div>
                    ) : null}
                    {!currentProgress && installed && !updateAvailable ? (
                      <div className='flex flex-wrap gap-2 sm:justify-end'>
                        {hasBasemap ? (
                          <Button onClick={() => void openPackage(definition)}>
                            <Map />
                            {t('packages.open')}
                          </Button>
                        ) : null}
                        <Button
                          variant='outline'
                          onClick={() => void remove(definition.id)}
                        >
                          {t('packages.remove')}
                        </Button>
                      </div>
                    ) : null}
                  </div>

                  {currentProgress ? (
                    <div className='flex flex-col gap-2'>
                      <div className='flex items-center justify-between gap-3 text-sm'>
                        <span>
                          {t('packages.progress', {
                            percent: Math.round(currentProgress.fraction * 100),
                          })}
                        </span>
                        <Button
                          variant='ghost'
                          onClick={() => cancel(definition.id)}
                        >
                          <X />
                          {t('packages.cancel')}
                        </Button>
                      </div>
                      <div
                        className='h-2 overflow-hidden rounded-full bg-muted'
                        role='progressbar'
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(
                          currentProgress.fraction * 100
                        )}
                      >
                        <div
                          className='h-full rounded-full bg-primary-text transition-[width]'
                          style={{
                            width: `${currentProgress.fraction * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby='offline-guide' className='mt-12'>
          <h2
            id='offline-guide'
            className='mb-5 text-2xl font-semibold text-foreground sm:text-3xl'
          >
            {t('instructions:offline.title')}
          </h2>
          <ul className='grid gap-4 md:grid-cols-3'>
            {OFFLINE_GUIDE.map(({ key, icon: Icon }) => (
              <li
                key={key}
                className='flex flex-col gap-3 rounded-card bg-card p-5 elevation-raised'
              >
                <span className='grid size-10 place-items-center rounded-full bg-secondary'>
                  <Icon className='size-5 text-primary-text' />
                </span>
                <h3 className='text-lg leading-snug font-semibold text-foreground'>
                  {t(`instructions:offline.${key}Title`)}
                </h3>
                <p className='text-sm leading-relaxed text-foreground'>
                  {t(`instructions:offline.${key}`)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
