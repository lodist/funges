import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, ImageIcon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { IdentifyResults } from '@/components/IdentifyResults';
import { loadTextMatrix, rankPredictions } from '@/lib/bioclip/classify';
import { prepareImage } from '@/lib/bioclip/imagePrep';
import { preprocessToTensor, TARGET_SIZE } from '@/lib/bioclip/preprocess';
import { BioclipSession } from '@/lib/bioclip/session';
import {
  downloadModel,
  getCachedModel,
  MODEL_APPROX_BYTES,
  removeModel,
} from '@/lib/modelCache';
import { resolvePredictions, type Candidate } from '@/lib/photo-id';
import { useIsMobile } from '@/hooks/use-mobile';

/**
 * The photo-identification flow, as a centred dialog over the map.
 *
 * Uses the same shadcn Dialog as FeatureInfoModal ("Species in this area") so it
 * reads as a card on top of the map rather than a page takeover — the map stays
 * visible behind the bg-black/50 overlay. Dialog also supplies escape-to-close,
 * focus trapping and body scroll lock, so none of that is hand-rolled here.
 *
 * A dialog rather than a route: it is launched from the map control stack and has
 * no useful URL of its own.
 *
 * State is local, not a Zustand store. The result of one photo is ephemeral,
 * per-session, request-scoped state — exactly what dataStore.ts is a cautionary
 * tale for. AdvancedMap handles RouteToDishPanel's async state the same way.
 */

type Phase =
  | { name: 'capture' }
  | { name: 'needsModel' }
  | { name: 'downloading'; fraction: number | null; receivedBytes: number }
  | { name: 'working' }
  | { name: 'results'; candidates: Candidate[]; previewUrl: string }
  | { name: 'error'; message: string };

const formatMb = (bytes: number) => `${Math.round(bytes / 1e6)} MB`;

export interface IdentifyPanelProps {
  open: boolean;
  onClose: () => void;
}

export function IdentifyPanel({ open, onClose }: IdentifyPanelProps) {
  const { t } = useTranslation('identify');
  const isMobile = useIsMobile();
  const [phase, setPhase] = useState<Phase>({ name: 'capture' });
  const [provider, setProvider] = useState<string | null>(null);

  const sessionRef = useRef<BioclipSession | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Monotonic id per attempt. Without it, a slow first identification can
  // resolve AFTER a second one and overwrite a newer result — including
  // replacing a toxic warning with a stale non-toxic one. A ref, not state:
  // it must be readable synchronously inside the async chain.
  const requestIdRef = useRef(0);
  const previewUrlRef = useRef<string | null>(null);

  const revokePreview = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }, []);

  // Decide the opening state from whether the model is already on the device.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getCachedModel()
      .then(cached => {
        if (cancelled) return;
        // Two explicit branches, not a ternary on `name`: the latter widens to
        // `{ name: 'capture' | 'needsModel' }`, which does not satisfy the
        // discriminated union.
        setPhase(cached ? { name: 'capture' } : { name: 'needsModel' });
      })
      .catch(() => {
        if (!cancelled) setPhase({ name: 'needsModel' });
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(
    () => () => {
      sessionRef.current?.dispose();
      sessionRef.current = null;
      abortRef.current?.abort();
      revokePreview();
    },
    [revokePreview]
  );

  const startDownload = async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase({ name: 'downloading', fraction: 0, receivedBytes: 0 });
    try {
      await downloadModel(
        ({ fraction, receivedBytes }) =>
          setPhase({ name: 'downloading', fraction, receivedBytes }),
        controller.signal
      );
      setPhase({ name: 'capture' });
    } catch (err) {
      if (controller.signal.aborted) {
        setPhase({ name: 'needsModel' });
        return;
      }
      setPhase({
        name: 'error',
        message: `${t('download.failed')} ${
          err instanceof Error ? err.message : ''
        }`.trim(),
      });
    } finally {
      abortRef.current = null;
    }
  };

  const ensureSession = async (): Promise<BioclipSession> => {
    if (sessionRef.current) return sessionRef.current;
    const cached = await getCachedModel();
    if (!cached) throw new Error(t('download.declined'));
    const bytes = await cached.blob.arrayBuffer();
    const { session, info } = await BioclipSession.create(bytes);
    sessionRef.current = session;
    setProvider(info.provider);
    return session;
  };

  const identify = async (file: File) => {
    const requestId = ++requestIdRef.current;
    const stale = () => requestId !== requestIdRef.current;

    revokePreview();
    setPhase({ name: 'working' });

    try {
      const [session, matrix] = await Promise.all([
        ensureSession(),
        loadTextMatrix(),
      ]);
      if (stale()) return;

      const { rgba, previewUrl } = await prepareImage(file);
      previewUrlRef.current = previewUrl;
      if (stale()) return;

      const tensor = preprocessToTensor(rgba);
      const embedding = await session.embed(tensor, [
        1,
        3,
        TARGET_SIZE,
        TARGET_SIZE,
      ]);
      if (stale()) return;

      const candidates = resolvePredictions(
        rankPredictions(embedding, matrix, 3)
      );
      if (stale()) return;

      setPhase({ name: 'results', candidates, previewUrl });
    } catch (err) {
      if (stale()) return;
      setPhase({
        name: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const onPick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset so picking the same file twice still fires a change event.
    event.target.value = '';
    if (file) void identify(file);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      {/* Capped height with internal scroll: a long toxic result (three rows,
          each with an expandable checklist) must not push the card past the
          viewport on a phone. DialogContent supplies its own close button. */}
      <DialogContent className='sm:max-w-lg max-w-[95vw] max-h-[85vh] overflow-y-auto'>
        <DialogHeader className='pr-8'>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('subtitle')}</DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          {phase.name === 'needsModel' && (
            <section className='space-y-3 rounded-lg border p-4'>
              <h3 className='font-medium'>{t('download.title')}</h3>
              {/* Leads with the privacy fact, because it is the REASON the
                download exists rather than an excuse for it. */}
              <p className='text-sm'>
                {t('download.why', { size: formatMb(MODEL_APPROX_BYTES) })}
              </p>
              <p className='text-sm text-muted-foreground'>
                {t('download.provenance')}
              </p>
              <p className='text-sm text-muted-foreground'>
                {t('download.notAFile')}
              </p>
              <p className='text-sm text-muted-foreground'>
                {t('download.onWifi')}
              </p>
              <Button onClick={() => void startDownload()}>
                {t('download.start', { size: formatMb(MODEL_APPROX_BYTES) })}
              </Button>
            </section>
          )}

          {phase.name === 'downloading' && (
            <section className='space-y-3 rounded-lg border p-4'>
              <p className='text-sm' role='status'>
                {t('download.progress', {
                  percent: Math.round((phase.fraction ?? 0) * 100),
                })}
              </p>
              <div
                className='h-2 w-full overflow-hidden rounded bg-secondary'
                role='progressbar'
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round((phase.fraction ?? 0) * 100)}
              >
                <div
                  className='h-full bg-primary transition-[width]'
                  style={{ width: `${(phase.fraction ?? 0) * 100}%` }}
                />
              </div>
              <p className='text-xs text-muted-foreground tabular-nums'>
                {formatMb(phase.receivedBytes)} / {formatMb(MODEL_APPROX_BYTES)}
              </p>
              <Button
                variant='outline'
                onClick={() => abortRef.current?.abort()}
              >
                {t('download.cancel')}
              </Button>
            </section>
          )}

          {phase.name === 'capture' && (
            <section className='space-y-3'>
              <div className='bg-status-warning border border-status-warning-border rounded-lg p-3'>
                <p className='text-sm'>{t('disclaimer.beforeCapture')}</p>
              </div>
              <p className='text-sm text-muted-foreground'>
                {t('capture.hint')}
              </p>
              <div className='flex flex-col gap-2 sm:flex-row'>
                {/* `capture` opens the OS camera directly on mobile. No
                  getUserMedia preview: the native picker already yields the
                  File this pipeline needs, and a custom preview would add a
                  video element, permission fallbacks and iOS quirks for
                  nothing. */}
                {isMobile && (
                  <label className='flex-1'>
                    <input
                      type='file'
                      accept='image/*'
                      capture='environment'
                      className='sr-only'
                      onChange={onPick}
                    />
                    <span className='inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border bg-primary px-4 py-2 text-sm font-medium text-primary-foreground'>
                      <Camera className='h-4 w-4' />
                      {t('capture.takePhoto')}
                    </span>
                  </label>
                )}
                <label className='flex-1'>
                  <input
                    type='file'
                    accept='image/*'
                    className='sr-only'
                    onChange={onPick}
                  />
                  <span className='inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border bg-secondary px-4 py-2 text-sm font-medium'>
                    <ImageIcon className='h-4 w-4' />
                    {isMobile
                      ? t('capture.choosePhoto')
                      : t('capture.dropHere')}
                  </span>
                </label>
              </div>
              <button
                type='button'
                className='text-xs text-muted-foreground underline'
                onClick={() => {
                  void removeModel().then(() =>
                    setPhase({ name: 'needsModel' })
                  );
                }}
              >
                {t('download.remove')}
              </button>
            </section>
          )}

          {phase.name === 'working' && (
            <p className='flex items-center gap-2 text-sm' role='status'>
              <Loader2 className='h-4 w-4 animate-spin' />
              {t('status.identifying')}
            </p>
          )}

          {phase.name === 'results' && (
            <section className='space-y-3'>
              <img
                src={phase.previewUrl}
                alt=''
                className='max-h-48 w-full rounded-lg object-contain'
              />
              <IdentifyResults candidates={phase.candidates} />
              <Button
                variant='outline'
                onClick={() => setPhase({ name: 'capture' })}
              >
                {t('capture.retake')}
              </Button>
            </section>
          )}

          {phase.name === 'error' && (
            <section className='space-y-3' role='alert'>
              <p className='text-sm font-medium'>{t('status.failed')}</p>
              <p className='text-sm text-muted-foreground'>{phase.message}</p>
              <Button onClick={() => setPhase({ name: 'capture' })}>
                {t('status.retry')}
              </Button>
            </section>
          )}

          {/* Surfaced deliberately: a silent fall back to single-threaded WASM is
            a multi-second inference on a low-end phone, and knowing which
            provider ran is the difference between "slow" and "broken". */}
          {provider && (
            <p className='text-xs text-muted-foreground'>{`engine: ${provider}`}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
