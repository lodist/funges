import { useEffect, useRef, useState, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  Camera,
  Download,
  ImageIcon,
  Lock,
  Plus,
  ScanSearch,
  Smartphone,
  WifiOff,
  XIcon,
} from '@/lib/icons';
import LoadingSquirrel from '@/assets/images/loading_squirrel.gif';
import SEO from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton';
import { IdentifyResults } from '@/components/IdentifyResults';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  MAX_PHOTOS,
  useIdentifyFlow,
  type IdentifyFlow,
  type StagedPhoto,
} from '@/hooks/use-identify-flow';
import { BAND_SURFACE_CLASS } from '@/lib/band-surface';
import { BIOCLIP_LABELS } from '@/data/bioclip-labels';
import { cn } from '@/lib/utils';

/*
 * Photo identification, as its own page.
 *
 * THESIS: the find laid out like a field-guide plate — two labelled frames for
 * the two views that matter, the matches set beside it. Refuses the dialog over
 * the map, and refuses a hero "top match": every match is an equal plate,
 * because the interface never implies a certainty the model does not have.
 * OWN-WORLD: the Trailhead. The deep-green band, warm paper, rounded-card
 * frames, pill actions, the permanent-notice treatment for safety.
 * FIRST VIEWPORT (phone): band with title and the three on-device facts, the
 * safety notice, the plate's two frames and its Identify button. Desktop
 * splits the band with a forest photograph and sets the matches beside a
 * sticky plate.
 * FORM: structure #3, "Two-frame specimen plate", seed 88422509, chosen 18 Oct
 * 2026. The surface brief holds the rest.
 *
 * The page is served cross-origin isolated (lib/isolation) so the model can run
 * on several CPU threads; every route into or out of it loads a fresh document.
 */

const BASE = import.meta.env.BASE_URL;
const formatMb = (bytes: number) => `${Math.round(bytes / 1e6)} MB`;
// Square on a phone, so the plate's Identify button clears the bottom bar in
// the first viewport; the field-guide 4:5 from sm up.
const FRAME_ASPECT = 'aspect-square sm:aspect-[4/5]';

export default function IdentifyPage() {
  const { t, i18n } = useTranslation('identify');
  const flow = useIdentifyFlow();
  const isMobile = useIsMobile();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLHeadingElement>(null);
  const { phase } = flow;

  // Results sit below the plate on a phone: bring them into view, and move
  // focus so a screen reader starts reading at the heading.
  useEffect(() => {
    if (phase.name !== 'results') return;
    const reduce = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)'
    ).matches;
    resultsRef.current?.focus({ preventScroll: true });
    resultsRef.current?.scrollIntoView({
      behavior: reduce ? 'auto' : 'smooth',
      block: 'start',
    });
  }, [phase.name]);

  const onPick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    // Reset so picking the same file twice still fires a change event.
    event.target.value = '';
    flow.addPhotos(files);
  };

  // A frame opens the camera on a phone, where the find is in front of you,
  // and the file chooser elsewhere. The gallery button covers the other case.
  const openFrame = () => (isMobile ? cameraRef : galleryRef).current?.click();

  return (
    <>
      <SEO
        title={t('page.title')}
        description={t('page.seoDescription')}
        canonicalUrl={`${BASE}identify`}
      />
      {/* md:pb-20 lets the footer's remove link scroll clear of the floating
          language pill, which desktop pins to the bottom-right corner. */}
      <div className='mx-auto flex max-w-6xl flex-col gap-4 pb-6 sm:gap-6 sm:py-4 md:pb-20'>
        <Band />

        {/* Under the title and in every state, not only beside results: it is
            read before a photo is taken. The softest of the three warning
            treatments, so the toxic banner and the deadly-pair alert in the
            results still outrank it. */}
        <p className='flex items-start gap-2 rounded-lg bg-status-warning-background px-3 py-2 ring-2 ring-status-warning-border/60'>
          <AlertTriangle className='mt-0.5 size-4 shrink-0 text-status-warning-text' />
          <span className='text-sm font-medium text-status-warning-text'>
            {t('disclaimer.neverEat')}
          </span>
        </p>

        <div className='grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start lg:gap-8'>
          <Plate
            flow={flow}
            isMobile={isMobile}
            onOpenFrame={openFrame}
            onOpenGallery={() => galleryRef.current?.click()}
          />

          {phase.name === 'results' ? (
            <section aria-labelledby='identify-results'>
              <h2
                id='identify-results'
                ref={resultsRef}
                tabIndex={-1}
                className='scroll-mt-4 text-xl font-semibold text-foreground focus:outline-none'
              >
                {t('results.heading')}
              </h2>
              {phase.used > 1 ? (
                <p className='mt-1 text-sm text-muted-foreground'>
                  {t('capture.combined', { total: phase.used })}
                </p>
              ) : null}
              <div className='mt-4'>
                <IdentifyResults candidates={phase.candidates} />
              </div>
            </section>
          ) : (
            <Guide />
          )}
        </div>

        <footer className='mt-4 flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:gap-6'>
          <p>{t('download.provenance')}</p>
          <div className='flex flex-wrap items-center gap-x-4'>
            {/* Surfaced on purpose: a silent fall back to one CPU thread is
                seconds on a low-end phone, and which engine ran is the
                difference between "slow" and "broken". */}
            {flow.provider ? (
              <span className='tabular-nums'>
                {t('download.engine', { provider: flow.provider })}
                {flow.variant
                  ? ` · ${t('download.model', { variant: flow.variant })}`
                  : ''}
                {flow.lastMs !== null
                  ? ` · ${(flow.lastMs / 1000).toLocaleString(i18n.language, {
                      maximumFractionDigits: 1,
                      minimumFractionDigits: 1,
                    })} s`
                  : ''}
              </span>
            ) : null}
            {flow.variant ? (
              <button
                type='button'
                onClick={flow.removeModel}
                className='focus-ring inline-flex min-h-11 items-center rounded-full underline underline-offset-2 hover:text-foreground'
              >
                {t('download.remove')}
              </button>
            ) : null}
          </div>
        </footer>
      </div>

      {/* Visually hidden, driven by the frames and the gallery button. */}
      <input
        ref={cameraRef}
        type='file'
        accept='image/*'
        capture='environment'
        className='sr-only'
        tabIndex={-1}
        aria-hidden='true'
        onChange={onPick}
      />
      <input
        ref={galleryRef}
        type='file'
        accept='image/*'
        multiple
        className='sr-only'
        tabIndex={-1}
        aria-hidden='true'
        onChange={onPick}
      />
    </>
  );
}

/** The page's title on the deep-green band, with the three facts that make
 *  this identification different. The photograph joins it from md up. */
function Band() {
  const { t } = useTranslation('identify');
  const facts = [
    { icon: Smartphone, label: t('page.onDevice') },
    { icon: Lock, label: t('page.noUpload') },
    { icon: WifiOff, label: t('page.offline') },
  ];

  return (
    <header
      className={cn(
        BAND_SURFACE_CLASS,
        'grid overflow-hidden rounded-card elevation-raised md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]'
      )}
    >
      <div className='flex flex-col gap-4 p-6 sm:p-8 lg:p-10'>
        <h1 className='text-3xl font-semibold leading-tight text-balance hyphens-auto break-words text-happy-50 sm:text-4xl'>
          {t('page.title')}
        </h1>
        <p className='max-w-[46ch] text-happy-100 sm:text-lg'>
          {t('page.lead')}
        </p>
        <ul className='flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-happy-50'>
          {facts.map(({ icon: Icon, label }) => (
            <li key={label} className='inline-flex items-center gap-2'>
              <Icon className='size-4 shrink-0 text-happy-300' />
              {label}
            </li>
          ))}
        </ul>
      </div>
      <div className='relative hidden min-h-56 md:block'>
        <img
          src={`${BASE}landing/lingonberries-pine-forest.webp`}
          alt=''
          width={768}
          height={576}
          decoding='async'
          className='absolute inset-0 size-full object-cover'
        />
      </div>
    </header>
  );
}

/** The specimen plate: two frames, then the action for the current state. */
function Plate({
  flow,
  isMobile,
  onOpenFrame,
  onOpenGallery,
}: {
  flow: IdentifyFlow;
  isMobile: boolean;
  onOpenFrame: () => void;
  onOpenGallery: () => void;
}) {
  const { t, i18n } = useTranslation('identify');
  const { phase, staged } = flow;
  const showFrames =
    phase.name === 'capture' ||
    phase.name === 'working' ||
    phase.name === 'results';
  const needsDownload =
    phase.name === 'needsModel' || phase.name === 'downloading';

  return (
    <section
      aria-labelledby='identify-plate'
      className='rounded-card bg-card p-4 elevation-raised sm:p-6 lg:sticky lg:top-6'
    >
      <h2 id='identify-plate' className='text-xl font-semibold text-foreground'>
        {t('plate.title')}
      </h2>

      {phase.name === 'checking' ? (
        // The plate's own shape while the device is checked for a model, so
        // nothing jumps when the frames arrive.
        <SkeletonGroup label={t('status.preparing')}>
          <p className='mt-1 text-sm text-muted-foreground'>
            {t('capture.hint')}
          </p>
          <div className='mt-4 grid grid-cols-2 gap-3 sm:gap-4'>
            <Skeleton className={cn(FRAME_ASPECT, 'w-full rounded-card')} />
            <Skeleton className={cn(FRAME_ASPECT, 'w-full rounded-card')} />
          </div>
          <Skeleton className='mt-5 h-12 w-full rounded-full' />
        </SkeletonGroup>
      ) : null}

      {phase.name === 'error' ? (
        <div role='alert' className='mt-4 flex flex-col items-start gap-3'>
          <p className='text-sm font-medium text-destructive-text'>
            {t('status.failed')}
          </p>
          <p className='text-sm text-muted-foreground'>{phase.message}</p>
          <Button onClick={flow.startOver}>{t('status.retry')}</Button>
        </div>
      ) : null}

      {/* Before the download too, as outlines: a first visit sees the plate it
          is downloading for, and the download button takes Identify's slot.
          Not on a phone, where the outlines push that button under the bar. */}
      {showFrames || needsDownload ? (
        <div className={cn(needsDownload && 'hidden sm:block')}>
          <p className='mt-1 text-sm text-muted-foreground'>
            {t('capture.hint')}
          </p>
          <ol className='mt-4 grid grid-cols-2 gap-3 sm:gap-4'>
            {[0, 1].map(index => (
              <li key={index} className='min-w-0'>
                <Frame
                  index={index}
                  photo={staged[index]}
                  // The second view is optional and comes second: until the
                  // first frame holds a photo, it waits rather than taking the
                  // photo meant for the first.
                  available={
                    !needsDownload && (index === 0 || staged.length >= 1)
                  }
                  // A short strip before the download, so its button still
                  // lands in the first desktop viewport.
                  compact={needsDownload}
                  isMobile={isMobile}
                  onOpen={onOpenFrame}
                  onDrop={flow.addPhotos}
                  onRemove={flow.removePhoto}
                />
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {needsDownload ? <DownloadStep flow={flow} /> : null}

      {showFrames ? (
        <>
          {/* lg:hidden: on desktop the guide beside the plate says the same. */}
          {staged.length === 1 && phase.name !== 'working' ? (
            <p className='mt-3 text-sm text-muted-foreground lg:hidden'>
              {t('capture.addAngleHint')}
            </p>
          ) : null}

          {isMobile && staged.length < MAX_PHOTOS ? (
            <Button
              variant='ghost'
              className='mt-2 w-full'
              onClick={onOpenGallery}
            >
              <ImageIcon className='size-4' />
              {staged.length === 0
                ? t('capture.choosePhoto')
                : t('capture.chooseAnother')}
            </Button>
          ) : null}

          <div className='mt-4'>
            {phase.name === 'working' ? (
              <Working
                // `total`, not `count`: i18next reserves `count` for plurals.
                message={t(flow.workingMessage, {
                  total: BIOCLIP_LABELS.length.toLocaleString(i18n.language),
                })}
              />
            ) : phase.name === 'results' ? (
              <Button
                variant='outline'
                size='lg'
                className='w-full'
                onClick={flow.startOver}
              >
                {t('capture.retake')}
              </Button>
            ) : (
              <Button
                size='lg'
                className='w-full'
                disabled={staged.length === 0}
                onClick={() => void flow.identify()}
              >
                <ScanSearch className='size-5' />
                {t('capture.run')}
              </Button>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}

/** One frame of the plate, with its label underneath like a specimen label. */
function Frame({
  index,
  photo,
  available,
  compact = false,
  isMobile,
  onOpen,
  onDrop,
  onRemove,
}: {
  index: number;
  photo: StagedPhoto | undefined;
  available: boolean;
  compact?: boolean;
  isMobile: boolean;
  onOpen: () => void;
  onDrop: (files: File[]) => void;
  onRemove: (key: number) => void;
}) {
  const { t } = useTranslation('identify');
  const [dragging, setDragging] = useState(false);
  const label = index === 0 ? t('plate.frameTop') : t('plate.frameUnder');
  const action =
    index === 1
      ? t('plate.optional')
      : isMobile
        ? t('plate.tapToShoot')
        : t('plate.clickToAdd');

  const dropProps = available
    ? {
        onDragOver: (event: DragEvent) => {
          event.preventDefault();
          setDragging(true);
        },
        onDragLeave: () => setDragging(false),
        onDrop: (event: DragEvent) => {
          event.preventDefault();
          setDragging(false);
          onDrop(Array.from(event.dataTransfer.files));
        },
      }
    : {};

  let body: React.ReactNode;
  if (!photo) {
    body = available ? (
      <button
        type='button'
        onClick={onOpen}
        aria-label={`${label}: ${action}`}
        {...dropProps}
        className={cn(
          FRAME_ASPECT,
          'focus-ring flex w-full flex-col items-center justify-center gap-3 rounded-card p-3 text-center transition-colors duration-base',
          index === 0
            ? 'bg-secondary hover:bg-happy-100 dark:hover:bg-accent'
            : 'bg-muted hover:bg-secondary',
          dragging && 'bg-happy-100 dark:bg-accent'
        )}
      >
        {/* dark:bg-background: a card-coloured disc on the muted frame all
            but vanishes on Night Canvas. */}
        <span className='flex size-14 items-center justify-center rounded-full bg-card text-primary-text elevation-raised dark:bg-background'>
          {index === 0 ? (
            <Camera className='size-6' />
          ) : (
            <Plus className='size-6' />
          )}
        </span>
        <span className='text-xs font-medium text-muted-foreground'>
          {action}
        </span>
      </button>
    ) : (
      // Not a control yet: an outline of the view, so the plate shows from the
      // start what belongs here — before the download, and for the second
      // frame until the first holds a photo.
      <div
        className={cn(
          compact ? 'aspect-[3/2]' : FRAME_ASPECT,
          'flex w-full flex-col items-center justify-center gap-3 rounded-card bg-muted/60 p-3 text-center'
        )}
      >
        <span
          className={cn(
            'flex items-center justify-center rounded-full bg-card/70 text-muted-foreground dark:bg-background/70',
            compact ? 'size-11' : 'size-14'
          )}
        >
          {index === 0 ? (
            <Camera className='size-6' />
          ) : (
            <Plus className='size-6' />
          )}
        </span>
        {/* The first frame's action is not on offer yet, so it says nothing. */}
        {index === 1 && !compact ? (
          <span className='text-xs font-medium text-muted-foreground'>
            {action}
          </span>
        ) : null}
      </div>
    );
  } else if (photo.failed) {
    body = (
      <div
        className={cn(
          FRAME_ASPECT,
          'relative flex w-full flex-col items-center justify-center gap-2 rounded-card bg-muted p-3 text-center'
        )}
      >
        <AlertTriangle className='size-6 text-destructive-text' />
        <span className='text-sm font-medium text-destructive-text'>
          {t('capture.photoFailed')}
        </span>
        <RemoveButton onClick={() => onRemove(photo.key)} />
      </div>
    );
  } else if (!photo.previewUrl) {
    body = (
      <SkeletonGroup
        label={t('capture.loadingPhoto', { number: index + 1 })}
        className='relative'
      >
        <Skeleton className={cn(FRAME_ASPECT, 'w-full rounded-card')} />
        {/* The group already announces this; the visible copy is for eyes. */}
        <span
          aria-hidden='true'
          className='absolute inset-0 flex items-center justify-center p-3 text-center text-xs font-medium text-muted-foreground'
        >
          {t('capture.loadingPhoto', { number: index + 1 })}
        </span>
      </SkeletonGroup>
    );
  } else {
    body = (
      <div className='relative overflow-hidden rounded-card bg-muted'>
        {/* The thumbnail is also proof of what was decoded: it comes from the
            same downscaled canvas the tensor does, so a blank tensor shows as
            a blank frame rather than passing unnoticed. */}
        <img
          src={photo.previewUrl}
          alt={t('plate.photoNumber', { number: index + 1 })}
          className={cn(
            FRAME_ASPECT,
            'w-full object-cover animate-in fade-in-0 duration-slow'
          )}
        />
        <RemoveButton onClick={() => onRemove(photo.key)} />
      </div>
    );
  }

  return (
    <figure className='flex flex-col gap-2'>
      {body}
      <figcaption
        className={cn(
          'text-sm font-semibold leading-snug',
          available || photo ? 'text-foreground' : 'text-muted-foreground'
        )}
      >
        {label}
      </figcaption>
    </figure>
  );
}

/** Sits on a photo, so it is a solid dark disc rather than a pale ghost: a
 *  pale pill over pale foliage is unreadable. 44px, past the glyph, because a
 *  miss on a phone opens the camera underneath. */
function RemoveButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation('identify');
  return (
    <button
      type='button'
      onClick={onClick}
      aria-label={t('capture.removePhoto')}
      className='focus-ring absolute right-2 top-2 flex size-11 items-center justify-center rounded-full bg-foreground/85 text-background elevation-raised [&_svg]:shrink-0'
    >
      <XIcon className='size-5' aria-hidden='true' />
    </button>
  );
}

/** First visit: the one-time download, with the privacy reason up front. */
function DownloadStep({ flow }: { flow: IdentifyFlow }) {
  const { t } = useTranslation('identify');
  const { phase } = flow;
  if (phase.name !== 'needsModel' && phase.name !== 'downloading') return null;
  const size = formatMb(phase.spec.approxBytes);

  if (phase.name === 'downloading') {
    const percent = Math.round((phase.fraction ?? 0) * 100);
    return (
      <div className='mt-4 flex flex-col gap-3'>
        <p className='text-sm font-medium text-foreground' role='status'>
          {t('download.progress', { percent })}
        </p>
        <div
          className='h-2 w-full overflow-hidden rounded-full bg-muted'
          role='progressbar'
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label={t('download.title')}
        >
          <div
            className='h-full bg-primary transition-[width] duration-base'
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className='text-xs tabular-nums text-muted-foreground'>
          {`${formatMb(phase.receivedBytes)} / ${size}`}
        </p>
        <Button
          variant='outline'
          className='self-start'
          onClick={flow.cancelDownload}
        >
          {t('download.cancel')}
        </Button>
      </div>
    );
  }

  return (
    <div className='mt-4 flex flex-col gap-4'>
      <div className='flex items-start gap-3'>
        <span className='flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary text-primary-text'>
          <Download className='size-5' />
        </span>
        <div className='min-w-0'>
          <h3 className='text-base font-semibold leading-snug text-foreground'>
            {t('download.title')}
          </h3>
          {/* Leads with the privacy fact: it is the reason the download
              exists, not an excuse for it. */}
          <p className='mt-1 text-sm text-foreground'>
            {t('download.why', { size })}
          </p>
        </div>
      </div>
      <ul className='flex flex-col gap-1 text-sm text-muted-foreground'>
        <li>{t('download.notAFile')}</li>
        <li>{t('download.onWifi')}</li>
      </ul>
      <Button
        size='lg'
        className='w-full'
        onClick={() => void flow.startDownload(phase.spec)}
      >
        <Download className='size-5' />
        {t('download.start', { size })}
      </Button>
    </div>
  );
}

/** The wait, with the squirrel the app already uses for "working". */
function Working({ message }: { message: string }) {
  return (
    <div className='flex items-center gap-3 rounded-full bg-secondary px-4 py-2'>
      <img
        src={LoadingSquirrel}
        alt=''
        aria-hidden='true'
        className='size-10 shrink-0'
      />
      <p
        className='text-sm font-medium text-secondary-foreground'
        role='status'
      >
        {message}
      </p>
    </div>
  );
}

/** Before any result: what to photograph, one numbered step per frame. Two
 *  numbers, never three: the plate takes two photos, and a third step read
 *  as a third slot. The fallback for disagreeing matches is a plain tip. */
function Guide() {
  const { t } = useTranslation('identify');
  const steps = [t('guide.top'), t('guide.under')];

  return (
    <section aria-labelledby='identify-guide' className='lg:pt-6'>
      <h2 id='identify-guide' className='text-xl font-semibold text-foreground'>
        {t('guide.title')}
      </h2>
      <ol className='mt-4 flex flex-col gap-4'>
        {steps.map((step, index) => (
          <li key={step} className='flex items-start gap-3'>
            <span className='flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-primary-text tabular-nums'>
              {index + 1}
            </span>
            <p className='pt-1 text-foreground'>{step}</p>
          </li>
        ))}
      </ol>
      {/* pl-11 lines the tip up with the step text, past the number disc. */}
      <p className='mt-4 pl-11 text-sm text-muted-foreground'>
        {t('guide.disagree')}
      </p>
    </section>
  );
}
