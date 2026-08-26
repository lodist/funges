import { cn } from '@/lib/utils';

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot='skeleton'
      // Trailhead (#213): bigger radius, matching the redesigned atoms.
      className={cn('bg-muted animate-pulse rounded-card', className)}
      {...props}
    />
  );
}

export { Skeleton };
