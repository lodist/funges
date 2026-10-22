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

/** A chosen filter chip: the band's deep green, the same in both themes.
 *  Weight and a soft lift alone left every chip white over the map's glass,
 *  so the choice could not be seen. */
export const SELECTED_CHIP_CLASS =
  'bg-happy-900 font-semibold text-happy-50 shadow-[0_1px_4px_rgba(0,0,0,0.08)] hover:bg-happy-900 hover:text-happy-50 dark:bg-happy-900 dark:hover:bg-happy-900 dark:hover:text-happy-50';

/** The species-type filter: one chip per type, the selected one on the band's
 * green. Shared by the map species panel, the area species list and the
 * Species page, so the three cannot drift apart again. Labels hide below
 * `sm:`, which is why each chip also carries its label as `aria-label`. */
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
            aria-pressed={selected}
            aria-label={chip.label}
            onClick={() => onChange(chip.value)}
            // Ghost brings the focus ring and pill; its green hover is
            // replaced in both themes, since a filter is not a call to action.
            // Default size: 44px is the touch floor (touch-target.test.ts);
            // only the side padding is trimmed to chip width.
            className={cn(
              'px-4',
              selected
                ? SELECTED_CHIP_CLASS
                : cn(
                    'font-medium text-foreground hover:text-foreground dark:hover:text-foreground',
                    tone === 'glass'
                      ? 'bg-card/90 backdrop-blur-sm hover:bg-card dark:hover:bg-card'
                      : 'bg-muted hover:bg-muted/80 dark:hover:bg-muted/80'
                  )
            )}
          >
            <img src={chip.icon} alt='' className='size-6' />
            <span className='hidden sm:inline'>{chip.label}</span>
          </Button>
        );
      })}
    </div>
  );
}
