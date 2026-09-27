import { cn } from '@/lib/utils';

/**
 * Brand lockup: the squirrel-and-mushroom mark plus a live-text wordmark.
 * The wordmark used to be baked into logo_funges.png in the mark's dark red,
 * which vanished on the dark theme; as text it takes the theme's foreground.
 * Size it with a `text-*` class — the mark scales with the font.
 */
export const Logo = ({ className }: { className?: string }) => (
  <span
    className={cn(
      'inline-flex items-center gap-[0.3em] font-display font-bold leading-none tracking-tight text-foreground',
      className
    )}
  >
    <img
      src={`${import.meta.env.BASE_URL}icons/logo_1.png`}
      alt=''
      className='size-[1.9em] shrink-0 object-contain'
    />
    {'Funges'}
  </span>
);
