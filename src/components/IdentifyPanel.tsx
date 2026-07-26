import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Camera, ImageIcon } from 'lucide-react';
import LoadingSquirrel from '@/assets/images/loading_squirrel.gif';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { IdentifyResults } from '@/components/IdentifyResults';
import { loadTextMatrix, rankPredictions } from '@/lib/bioclip/classify';
import { BlankImageError, prepareImage } from '@/lib/bioclip/imagePrep';
import { preprocessToTensor, TARGET_SIZE } from '@/lib/bioclip/preprocess';
import { BioclipSession } from '@/lib/bioclip/session';
import {
  downloadModel,
  getAnyCachedModel,
  removeModel,
} from '@/lib/modelCache';
import {
  detectVariant,
  markWebgpuUntrusted,
  MODEL_VARIANTS,
  type VariantSpec,
} from '@/lib/bioclip/variant';
import { runSelfCheck } from '@/lib/bioclip/selfCheck';
import { BIOCLIP_LABELS } from '@/data/bioclip-labels';
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
  // Opening state. The cache lookup and, when nothing is cached, the GPU probe
  // are both async, and showing the capture UI first meant a user could pick a
  // photo and only THEN be told to download 280MB — the work discarded. Nothing
  // actionable is offered until we know which state we are actually in.
  | { name: 'checking' }
  | { name: 'capture' }
  // Carries the variant chosen for THIS device, so the consent copy states the
  // size the user will actually download rather than a hardcoded one.
  | { name: 'needsModel'; spec: VariantSpec }
  | {
      name: 'downloading';
      spec: VariantSpec;
      fraction: number | null;
      receivedBytes: number;
    }
  | { name: 'working' }
  | { name: 'results'; candidates: Candidate[]; previewUrl: string }
  | { name: 'error'; message: string };

const formatMb = (bytes: number) => `${Math.round(bytes / 1e6)} MB`;

/**
 * Wait messages, escalating with elapsed time.
 *
 * On-device inference takes ~15s on a mid-range phone (the matmuls run on the
 * CPU there), and a single unchanging "Identifying…" for that long reads as a
 * hung app. The third message is not decoration: at 15s the user is deciding
 * whether it is broken, so it says explicitly that it is still working AND why
 * it is slow — the computation is happening on their phone, which is the same
 * fact that justifies the download in the first place.
 *
 * The species count in the second message is derived from BIOCLIP_LABELS rather
 * than written into the copy, so it cannot drift out of date when the vocabulary
 * changes — and it is passed as `total`, NOT `count`, because i18next reserves
 * `count` for pluralisation and would look for `_one`/`_other` variants instead.
 */
const WORKING_MESSAGES = [
  'status.identifying',
  'status.identifyingLonger',
  'status.identifyingLongest',
] as const;

const WORKING_STAGE_MS = [5000, 15000] as const;

export interface IdentifyPanelProps {
  open: boolean;
  onClose: () => void;
}

export function IdentifyPanel({ open, onClose }: IdentifyPanelProps) {
  const { t, i18n } = useTranslation('identify');
  const isMobile = useIsMobile();
  const [phase, setPhase] = useState<Phase>({ name: 'checking' });
  const [provider, setProvider] = useState<string | null>(null);
  const [workingStage, setWorkingStage] = useState(0);

  const sessionRef = useRef<BioclipSession | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // The variant whose bytes are on this device. Set from the cache on open, or
  // from the download that just completed.
  const cachedSpecRef = useRef<VariantSpec | null>(null);
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
  //
  // The variant probe runs ONLY when nothing is cached. It builds a throwaway ORT
  // session, so doing it on every open would cost a needless WebGPU init on a
  // device that already has its model.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPhase({ name: 'checking' });
    getAnyCachedModel()
      .then(async cached => {
        if (cancelled) return;
        if (cached) {
          cachedSpecRef.current = MODEL_VARIANTS[cached.info.variant];
          // Two explicit branches, not a ternary on `name`: the latter widens to
          // `{ name: 'capture' | 'needsModel' }`, which does not satisfy the
          // discriminated union.
          setPhase({ name: 'capture' });
          return;
        }
        const { spec } = await detectVariant();
        if (cancelled) return;
        setPhase({ name: 'needsModel', spec });
      })
      .catch(() => {
        // Never strand the user on a spinner: offer the conservative variant.
        if (!cancelled)
          setPhase({ name: 'needsModel', spec: MODEL_VARIANTS.int8 });
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Two timeouts rather than a per-second interval: only two thresholds matter,
  // so ticking every second would re-render ~15 times to change text twice.
  useEffect(() => {
    if (phase.name !== 'working') return;
    setWorkingStage(0);
    const timers = WORKING_STAGE_MS.map((ms, i) =>
      window.setTimeout(() => setWorkingStage(i + 1), ms)
    );
    return () => timers.forEach(clearTimeout);
  }, [phase.name]);

  useEffect(
    () => () => {
      sessionRef.current?.dispose();
      sessionRef.current = null;
      abortRef.current?.abort();
      revokePreview();
    },
    [revokePreview]
  );

  const startDownload = async (spec: VariantSpec) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase({ name: 'downloading', spec, fraction: 0, receivedBytes: 0 });
    try {
      await downloadModel(
        spec,
        ({ fraction, receivedBytes }) =>
          setPhase({ name: 'downloading', spec, fraction, receivedBytes }),
        controller.signal
      );
      cachedSpecRef.current = spec;
      setPhase({ name: 'capture' });
    } catch (err) {
      if (controller.signal.aborted) {
        setPhase({ name: 'needsModel', spec });
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

  /**
   * Build a session and PROVE it computes this model before returning it.
   *
   * A GPU backend that initialises but returns wrong numbers is not a
   * theoretical worry — it happened on Android with int4 under `engine: webgpu`,
   * and produced a confident species list from noise. So a failed self-check
   * rebuilds on the CPU backend, and if that is also wrong the feature refuses
   * rather than guessing. Slow and correct beats fast and wrong; wrong and
   * confident is unacceptable for toxicity warnings.
   *
   * `bytes` is transferred into the worker, so the retry needs its own copy —
   * hence the slice before the first attempt rather than a second IDB read.
   */
  const ensureSession = async (): Promise<BioclipSession> => {
    if (sessionRef.current) return sessionRef.current;
    const cached = await getAnyCachedModel();
    if (!cached) throw new Error(t('download.declined'));
    const spec = MODEL_VARIANTS[cached.info.variant];
    cachedSpecRef.current = spec;

    const bytes = await cached.blob.arrayBuffer();
    const retryBytes = bytes.slice(0);

    let { session, info } = await BioclipSession.create(bytes);
    let check = await runSelfCheck(session, spec.variant);

    if (!check.ok && info.provider !== 'wasm') {
      // This device's GPU backend is untrustworthy for this artifact. Remember
      // it so the next download offers the variant whose compute path does not
      // depend on it, instead of repeating this every session.
      markWebgpuUntrusted(spec.variant);
      session.dispose();
      ({ session, info } = await BioclipSession.create(retryBytes, {
        forceWasm: true,
      }));
      check = await runSelfCheck(session, spec.variant);
    }

    if (!check.ok) {
      session.dispose();
      throw new Error(t('status.backendWrong'));
    }

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
      // A failed decode gets its own message. Falling through to the generic
      // error would tell the user "something went wrong" when the actionable
      // fact is that this particular photo could not be read.
      if (err instanceof BlankImageError) {
        setPhase({ name: 'error', message: t('status.unreadable') });
        return;
      }
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
      {/* aria-describedby={undefined} because there is deliberately no
          DialogDescription: Radix otherwise logs a missing-description warning on
          every open. The subtitle it used to hold said nothing the title did not. */}
      <DialogContent
        aria-describedby={undefined}
        className='sm:max-w-lg max-w-[95vw] max-h-[85vh] overflow-y-auto'
      >
        <DialogHeader className='pr-8'>
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>

        {/* Directly under the title and present in EVERY phase, not just results:
            the warning should be read before a photo is taken, not after a list
            of species has already been offered.

            Deliberately the softest of the three amber treatments. The toxic
            banner in IdentifyResults is a filled amber-100 with a 2px amber-500
            border; if this looked the same, a permanent notice would be visually
            indistinguishable from "one of these will kill you", which would train
            users to ignore both. Ranked: halo here, filled border-2 for toxic,
            destructive border for a critical pair.

            No role='alert': it is static, so announcing it on every render would
            fight the toxic banner that genuinely needs the assertive channel. */}
        <div className='flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 ring-2 ring-amber-400/60 dark:bg-amber-950/40 dark:ring-amber-500/40'>
          <AlertTriangle
            className='mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400'
            aria-hidden='true'
          />
          <p className='text-xs font-medium text-amber-900 dark:text-amber-100'>
            {t('disclaimer.neverEat')}
          </p>
        </div>

        <div className='space-y-4'>
          {phase.name === 'checking' && (
            <p
              className='flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground'
              role='status'
            >
              <img
                src={LoadingSquirrel}
                alt=''
                aria-hidden='true'
                className='h-10 w-10'
              />
              {t('status.preparing')}
            </p>
          )}

          {phase.name === 'needsModel' && (
            <section className='space-y-3 rounded-lg border p-4'>
              <h3 className='font-medium'>{t('download.title')}</h3>
              {/* Leads with the privacy fact, because it is the REASON the
                download exists rather than an excuse for it. */}
              <p className='text-sm'>
                {t('download.why', { size: formatMb(phase.spec.approxBytes) })}
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
              <Button onClick={() => void startDownload(phase.spec)}>
                {t('download.start', {
                  size: formatMb(phase.spec.approxBytes),
                })}
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
                {formatMb(phase.receivedBytes)} /{' '}
                {formatMb(phase.spec.approxBytes)}
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
                  // Re-probe rather than reuse the removed variant: removing is
                  // also how a user switches artifacts, so the next offer should
                  // be whichever one is actually best for this device now.
                  void removeModel()
                    .then(async () => {
                      sessionRef.current?.dispose();
                      sessionRef.current = null;
                      cachedSpecRef.current = null;
                      const { spec } = await detectVariant();
                      setPhase({ name: 'needsModel', spec });
                    })
                    .catch(() =>
                      setPhase({
                        name: 'needsModel',
                        spec: MODEL_VARIANTS.int8,
                      })
                    );
                }}
              >
                {t('download.remove')}
              </button>
            </section>
          )}

          {phase.name === 'working' && (
            <div className='flex flex-col items-center gap-2 py-2'>
              {/* The squirrel already means "working" everywhere else in this app
                (AdvancedMap uses it at h-80 while the map loads), so reusing it
                here costs no new asset and no new vocabulary. Much smaller than
                on the map: this sits inside a dialog next to real content. */}
              <img
                src={LoadingSquirrel}
                alt=''
                aria-hidden='true'
                className='h-20 w-20'
              />
              {/* aria-live on the text, not the image, so a screen reader
                announces each new message rather than the decorative gif. */}
              <p className='text-center text-sm' role='status'>
                {t(WORKING_MESSAGES[workingStage], {
                  total: BIOCLIP_LABELS.length.toLocaleString(i18n.language),
                })}
              </p>
            </div>
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
            provider ran is the difference between "slow" and "broken".
            The variant is shown alongside it because the pairing is what
            matters — int4 on wasm is the one combination slower than doing
            nothing, and it is otherwise invisible. */}
          {provider && (
            <p className='text-xs text-muted-foreground'>
              {`engine: ${provider}`}
              {cachedSpecRef.current
                ? ` · model: ${cachedSpecRef.current.variant}`
                : ''}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
