import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface CategoryChip {
  value: string;
  label: string;
  /** URL of the type icon, from `CATEGORY_ICONS`. */
  icon: string;
}

interface CategoryChipsProps {
  chips: readonly CategoryChip[];
  value: string;
  onChange: (value: string) => void;
  /** `muted` on page and dialog surfaces; `glass` over the map or a photo. */
  tone?: 'muted' | 'glass';
  className?: string;
}

/** The species-type filter: one chip per type, the selected one marked by
 * weight and a soft lift only, never a colour swap (Trailhead #213). Shared by
 * the map species panel, the area species list and the Species page, so the
 * three cannot drift apart again. Labels hide below `sm:`, which is why each
 * chip also carries its label as `aria-label`. */
export function CategoryChips({
  chips,
  value,
  onChange,
  tone = 'muted',
  className,
}: CategoryChipsProps) {
  return (
    <div className={cn('flex flex-wrap justify-center gap-2', className)}>
      {chips.map(chip => {
        const selected = chip.value === value;
        return (
          <Button
            key={chip.value}
            type='button'
            variant='ghost'
            size='sm'
            aria-pressed={selected}
            aria-label={chip.label}
            onClick={() => onChange(chip.value)}
            // Ghost brings the focus ring and pill; its green hover is
            // replaced in both themes, since a filter is not a call to action.
            className={cn(
              'text-foreground hover:text-foreground dark:hover:text-foreground',
              tone === 'glass'
                ? 'backdrop-blur-sm hover:bg-card dark:hover:bg-card'
                : 'bg-muted hover:bg-muted/80 dark:hover:bg-muted/80',
              tone === 'glass' && (selected ? 'bg-card' : 'bg-card/90'),
              selected
                ? 'font-semibold shadow-[0_1px_4px_rgba(0,0,0,0.08)]'
                : 'font-medium'
            )}
          >
            <img src={chip.icon} alt='' className='size-5' />
            <span className='hidden sm:inline'>{chip.label}</span>
          </Button>
        );
      })}
    </div>
  );
}
