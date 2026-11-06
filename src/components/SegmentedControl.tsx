import { cn } from '@/lib/utils';

/** A choice of a few options as words: the chosen one a light halo with dark
 *  text, the others plain text; no track. The Data page's ranges, and a
 *  harvest's verdict on My garden. With nothing chosen (`value` undefined),
 *  all are plain. */
export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T | undefined;
  onChange: (value: T) => void;
  /** Names the group for screen readers where nothing around it does. */
  label?: string;
}) {
  return (
    // The chosen option a light green halo with dark green text, like the map
    // dock's day; the others dark green text (the readable green in dark
    // mode, where dark green would vanish); no track.
    <div
      role={label ? 'group' : undefined}
      aria-label={label}
      className='inline-flex items-center gap-1 rounded-full p-1'
    >
      {options.map(option => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            type='button'
            onClick={() => onChange(option.value)}
            aria-pressed={isActive}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
              isActive
                ? 'bg-happy-100 text-happy-900'
                : 'text-primary-text hover:text-happy-900 dark:hover:text-happy-100'
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
