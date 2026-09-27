import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';

const base = import.meta.env.BASE_URL;

const mask = (file: string): CSSProperties => ({
  maskImage: `url(${base}icons/${file})`,
  maskSize: 'contain',
  maskRepeat: 'no-repeat',
});

/** The mark alone, for the collapsed sidebar rail. Size it with a height class. */
export const LogoMark = ({ className }: { className?: string }) => (
  <span
    aria-hidden='true'
    className={cn('block aspect-square h-full shrink-0 bg-logo', className)}
    style={mask('logo_mark_mask.png')}
  />
);

/**
 * Brand lockup: the squirrel-and-mushroom mark plus the original FUNGES
 * lettering. Both are masks cut from the original artwork (logo_1.png and
 * logo_funges.png), filled with `--logo`: the logo red on light, white on
 * dark, where the red fell to 2.19:1. The white highlights in the artwork are
 * cut-outs in the masks, so the detail survives the recolour. The lettering
 * sits at 40% of the mark's height; it was a fifth in logo_funges.png.
 * Size it with a height class — both parts scale with it.
 */
export const Logo = ({ className }: { className?: string }) => (
  <span
    role='img'
    aria-label='Funges'
    className={cn('inline-flex h-10 items-center gap-2', className)}
  >
    <LogoMark />
    <span
      className='aspect-[531/84] h-[40%] shrink-0 bg-logo'
      style={mask('wordmark_funges.png')}
    />
  </span>
);
