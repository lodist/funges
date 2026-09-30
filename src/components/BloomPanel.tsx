import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from '@/lib/icons';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  BLOOM_SPOTS,
  BLOOM_STATUS_COLOR,
  bloomGradientCss,
  bloomInSeason,
  bloomStatus,
  bloomWhen,
  formatBloomDate,
  sortSpots,
  type BloomPeaks,
  type BloomSpot,
} from '@/lib/bloom';

export interface BloomPanelProps {
  /** Predicted peak per spot id, days since 1970-01-01 (lib/bloom.ts). */
  peaks: BloomPeaks;
  /** The slider's day, in the same unit. */
  day: number;
  onSelectSpot?: (spot: BloomSpot) => void;
  className?: string;
}

/**
 * Takes the score legend's place while the cherry blossom layer is shown: the
 * days-to-peak ramp, and the viewing spots sorted by how soon they peak.
 *
 * Opaque, not glass: a list of names over the map is the text-heavy case the
 * glass rule excludes (see SpeciesSelector).
 */
export default function BloomPanel({
  peaks,
  day,
  onSelectSpot,
  className = '',
}: BloomPanelProps) {
  const { t, i18n } = useTranslation('map');
  const [open, setOpen] = useState(false);
  const inSeason = bloomInSeason(peaks, day);
  const spots = sortSpots(
    BLOOM_SPOTS.map(spot => ({ ...spot, peak: peaks[spot.id] ?? null })),
    day
  );

  return (
    <div
      className={cn(
        'elevation-raised bg-card rounded-lg px-3 py-2 md:px-4 md:w-96',
        className
      )}
    >
      <div className='flex items-center justify-between text-xs leading-none mb-1 md:mb-2'>
        <span className='text-muted-foreground'>{t('bloom.later')}</span>
        <span className='font-bold text-foreground'>{t('bloom.legend')}</span>
        <span className='text-muted-foreground'>{t('bloom.past')}</span>
      </div>
      <div
        className='h-2 md:h-3 rounded-full'
        style={{ background: bloomGradientCss() }}
      />

      {inSeason ? (
        <>
          <Button
            variant='ghost'
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            className='mt-1 w-full justify-between px-1'
          >
            <span>{t('bloom.spotsTitle')}</span>
            <ChevronDown
              className={cn(
                'h-4 w-4 transition-transform duration-base',
                open && 'rotate-180'
              )}
            />
          </Button>
          {open && (
            <ul className='max-h-[35vh] overflow-y-auto'>
              {spots.map(spot => (
                <li key={spot.id}>
                  <button
                    type='button'
                    onClick={() => onSelectSpot?.(spot)}
                    className='flex min-h-11 w-full items-center gap-2 rounded-lg px-1 py-1 text-left hover:bg-muted focus-ring'
                  >
                    <span
                      aria-hidden='true'
                      className='size-2.5 shrink-0 rounded-full ring-1 ring-border'
                      style={{
                        background:
                          spot.peak === null
                            ? BLOOM_STATUS_COLOR.over
                            : BLOOM_STATUS_COLOR[bloomStatus(spot.peak, day)],
                      }}
                    />
                    <span className='min-w-0 flex-1'>
                      <span className='block truncate text-sm text-foreground'>
                        {t(`bloom.spots.${spot.id}`)}
                      </span>
                      <span className='block truncate text-xs text-muted-foreground'>
                        {t(`bloom.variety.${spot.variety}`)}
                      </span>
                    </span>
                    <span className='shrink-0 text-right text-xs text-muted-foreground'>
                      {spot.peak === null ? (
                        t('bloom.noForecast')
                      ) : (
                        <>
                          <span className='block text-foreground'>
                            {formatBloomDate(spot.peak, i18n.language)}
                          </span>
                          <span className='block'>
                            {bloomWhen(t, spot.peak, day)}
                          </span>
                        </>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className='mt-1 text-xs text-muted-foreground'>
          {t('bloom.offSeason')}
        </p>
      )}
    </div>
  );
}
