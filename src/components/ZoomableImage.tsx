import { useEffect, useState, type ReactNode } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

type Phase = 'closed' | 'open' | 'closing';

interface ZoomableImageProps {
  src: string;
  /** What the picture shows; screen readers hear it after the action. */
  alt?: string;
  /** The thumbnail's frame: size, shape, background. */
  className?: string;
  imgClassName?: string;
  /** Overlays drawn on the thumbnail, such as a tint. */
  children?: ReactNode;
}

/**
 * A thumbnail that grows into the whole, uncropped picture on a click, over
 * the page or the open dialog. Any press, on the picture or outside it, or
 * Escape shrinks it back.
 */
export function ZoomableImage({
  src,
  alt = '',
  className,
  imgClassName,
  children,
}: ZoomableImageProps) {
  const { t } = useTranslation('common');
  const [phase, setPhase] = useState<Phase>('closed');
  const open = phase === 'open';

  useEffect(() => {
    if (!open) return;
    // Window capture runs before a dialog's own outside-press and Escape
    // handlers, so shrinking the picture never closes the dialog as well.
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
        onClick={() => setPhase(open ? 'closing' : 'open')}
        className={cn(
          'focus-ring group relative block shrink-0 cursor-zoom-in overflow-hidden',
          className
        )}
      >
        <span className='sr-only'>
          {t(open ? 'common.shrinkImage' : 'common.enlargeImage')}
        </span>
        <img
          src={src}
          alt={alt}
          loading='lazy'
          className={cn(
            'size-full object-cover transition-transform duration-base ease-standard group-hover:scale-[1.03]',
            imgClassName
          )}
        />
        {children}
      </button>
      {phase !== 'closed' &&
        createPortal(
          // A modal dialog sets pointer-events: none on <body>; the layer
          // takes them back so it shows the zoom-out cursor.
          <div
            aria-hidden='true'
            data-state={state}
            data-testid='zoomed-image'
            style={{ pointerEvents: 'auto' }}
            onAnimationEnd={event => {
              // Only the layer's own fade, not the picture's zoom bubbling up.
              // Unmount in the same frame, as Radix Presence does: a render
              // later the finished animation has already let go of opacity 0.
              if (event.target === event.currentTarget && phase === 'closing')
                flushSync(() => setPhase('closed'));
            }}
            className='data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=closed]:fill-mode-forwards fixed inset-0 z-[60] grid cursor-zoom-out place-items-center bg-scrim p-6 transition-none duration-base ease-standard [container-type:size]'
          >
            <img
              src={src}
              alt=''
              data-state={state}
              className='data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:zoom-in-90 data-[state=closed]:zoom-out-90 data-[state=closed]:fill-mode-forwards size-[min(100cqw,100cqh,36rem)] rounded-card object-contain elevation-floating transition-none duration-base ease-standard'
            />
          </div>,
          document.body
        )}
    </>
  );
}
