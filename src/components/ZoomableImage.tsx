import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

type Phase = 'closed' | 'open' | 'closing';

interface ZoomableImageProps {
  src: string;
  /** Size and shape of the thumbnail; the enlarged picture fits the dialog. */
  className?: string;
}

/**
 * A recipe thumbnail that grows into the whole, uncropped picture on a click.
 * Any press — on the picture or outside it — or Escape shrinks it back.
 *
 * It renders inside DialogContent, whose fixed position makes it the
 * containing block, so the enlarged layer covers exactly the dialog.
 */
export function ZoomableImage({ src, className }: ZoomableImageProps) {
  const { t } = useTranslation('recipes');
  const [phase, setPhase] = useState<Phase>('closed');
  const open = phase === 'open';

  useEffect(() => {
    if (!open) return;
    // Window capture runs before the dialog's own outside-press and Escape
    // handlers, so shrinking the picture never closes the recipe as well.
    const shrink = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key !== 'Escape') return;
      event.stopPropagation();
      event.preventDefault();
      setPhase('closing');
    };
    window.addEventListener('pointerdown', shrink, true);
    window.addEventListener('keydown', shrink, true);
    return () => {
      window.removeEventListener('pointerdown', shrink, true);
      window.removeEventListener('keydown', shrink, true);
    };
  }, [open]);

  const state = open ? 'open' : 'closed';

  return (
    <>
      <button
        type='button'
        aria-expanded={open}
        aria-label={t(open ? 'shrinkImage' : 'enlargeImage')}
        onClick={() => setPhase(open ? 'closing' : 'open')}
        className={cn(
          'focus-ring group shrink-0 cursor-zoom-in overflow-hidden rounded-xl',
          className
        )}
      >
        <img
          src={src}
          alt=''
          loading='lazy'
          className='size-full object-cover transition-transform duration-base ease-standard group-hover:scale-[1.03]'
        />
      </button>
      {phase !== 'closed' && (
        <div
          aria-hidden='true'
          data-state={state}
          data-testid='zoomed-image'
          onAnimationEnd={() => phase === 'closing' && setPhase('closed')}
          className='data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 absolute inset-0 z-20 grid cursor-zoom-out place-items-center rounded-card bg-scrim p-4 transition-none duration-base ease-standard [container-type:size]'
        >
          <img
            src={src}
            alt=''
            data-state={state}
            className='data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:zoom-in-90 data-[state=closed]:zoom-out-90 size-[min(100cqw,100cqh,36rem)] rounded-card object-contain elevation-floating transition-none duration-base ease-standard'
          />
        </div>
      )}
    </>
  );
}
