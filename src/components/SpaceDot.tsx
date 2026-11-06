import type { Space } from '@/lib/spaces';

/** A space's dot, in that space's own colour wherever it is drawn: the dot
 *  carries its space, so the brand scale under it is that space's. */
export const SpaceDot = ({ space }: { space: Space }) => (
  <span
    data-space={space}
    aria-hidden='true'
    className='size-3 shrink-0 rounded-full bg-happy-500'
  />
);
