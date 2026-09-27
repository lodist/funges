import { cn } from '@/lib/utils';

const base = import.meta.env.BASE_URL;

/**
 * Brand lockup: the squirrel-and-mushroom mark plus the original FUNGES
 * lettering. The lettering used to be baked into logo_funges.png at a fifth
 * of the mark's height, in a red that fell to 2.19:1 on the dark theme. Here
 * it is a mask (wordmark_funges.png, cut from that file) filled with
 * `--wordmark`, so the letterforms stay and only the red adapts.
 * Size it with a height class — both parts scale with it.
 */
export const Logo = ({ className }: { className?: string }) => (
  <span
    role='img'
    aria-label='Funges'
    className={cn('inline-flex h-10 items-center gap-2', className)}
  >
    <img
      src={`${base}icons/logo_1.png`}
      alt=''
      className='aspect-square h-full shrink-0 object-contain'
    />
    <span
      className='aspect-[531/84] h-[40%] shrink-0 bg-wordmark'
      style={{
        maskImage: `url(${base}icons/wordmark_funges.png)`,
        maskSize: 'contain',
        maskRepeat: 'no-repeat',
      }}
    />
  </span>
);
