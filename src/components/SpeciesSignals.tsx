import { useTranslation } from 'react-i18next';
import type { ToxicSeverity } from '@/data/toxic-species';
import { AlertTriangle } from '@/lib/icons';
import { cn } from '@/lib/utils';
import { getConfidence } from '@/lib/worth-foraging-now';

interface ConditionsMeterProps {
  /** Today's score, 0–10. */
  score: number;
  /** `band` on the deep-green field, `paper` on a card. */
  tone?: 'band' | 'paper';
  /** Shorter pills and the number alone; the conditions word stays for
   *  screen readers. */
  compact?: boolean;
}

/** Ten steps of one green: the score as depth, never as a new hue. */
export function ConditionsMeter({
  score,
  tone = 'paper',
  compact = false,
}: ConditionsMeterProps) {
  const { t } = useTranslation('common');
  const band = tone === 'band';
  const filled = Math.round(score);
  const label = t(`worthForagingNow.conditions.${getConfidence(score)}`);

  // A span, not a div: tiles that open a sheet are buttons, and a button
  // may only hold phrasing content.
  return (
    <span
      className={cn(
        'flex items-center',
        compact ? 'gap-2' : 'flex-wrap gap-x-3 gap-y-1.5'
      )}
    >
      <span
        aria-hidden='true'
        className={cn(
          'flex shrink-0',
          compact ? 'w-24 gap-0.5' : 'w-36 gap-1 sm:w-44'
        )}
      >
        {Array.from({ length: 10 }, (_, step) => (
          <span
            key={step}
            className={cn(
              'flex-1 rounded-full',
              compact ? 'h-1.5' : 'h-2',
              step < filled
                ? band
                  ? 'bg-happy-500'
                  : 'bg-primary-text'
                : band
                  ? // The band is happy-900 in both themes, so its wash is too.
                    'bg-happy-50/15 dark:bg-happy-50/15'
                  : 'bg-muted'
            )}
          />
        ))}
      </span>
      <span
        className={cn(
          'min-w-0 font-medium',
          compact ? 'text-xs' : 'text-sm',
          band ? 'text-happy-50' : 'text-foreground'
        )}
      >
        <span className={compact ? 'sr-only' : undefined}>
          {label}
          {' · '}
        </span>
        <span className='tabular-nums'>{score}</span>
      </span>
    </span>
  );
}

interface LookalikeTagProps {
  scientificName: string;
  severity: Extract<ToxicSeverity, 'lethal' | 'toxic'>;
  className?: string;
}

/** A compact tile's look-alike warning, in the Identify page's notice colours.
 *  It names the species: a severity alone tells the reader nothing to check. */
export function LookalikeTag({
  scientificName,
  severity,
  className,
}: LookalikeTagProps) {
  const { t } = useTranslation('common');
  return (
    <span
      className={cn(
        'flex items-start gap-1.5 rounded-lg bg-status-warning-background px-2 py-1.5 text-xs text-status-warning-text ring-1 ring-status-warning-border/60',
        className
      )}
    >
      <AlertTriangle className='mt-px size-3 shrink-0' />
      <span>
        <span className='font-semibold'>
          {t(`worthForagingNow.lookalikeBadge.${severity}`)}
        </span>{' '}
        <i>{scientificName}</i>
      </span>
    </span>
  );
}
