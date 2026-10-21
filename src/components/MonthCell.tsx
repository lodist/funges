import { cn } from '@/lib/utils';

/** One month's cell: sowing (band), harvest (light), both (split), or neither. */
export function MonthCell({
  sow,
  harvest,
  now,
  className,
}: {
  sow: boolean;
  harvest: boolean;
  now: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'block w-full rounded-sm',
        sow && harvest
          ? 'bg-[linear-gradient(var(--band)_50%,var(--happy-300)_50%)]'
          : sow
            ? 'bg-band'
            : harvest
              ? 'bg-happy-300'
              : 'bg-muted',
        now && 'ring-2 ring-foreground ring-offset-1 ring-offset-background',
        className
      )}
    />
  );
}
