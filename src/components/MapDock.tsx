import { useTranslation } from 'react-i18next';
import { BAND_SURFACE_CLASS } from '@/lib/band-surface';
import { FORECAST_DAYS } from '@/lib/forecast';
import { getScoreGradientCss } from '@/lib/scoreColor';
import { cn } from '@/lib/utils';
import { Slider } from '@/components/ui/slider';
import { useMapStore } from '@/store/mapStore';

interface MapDockProps {
  /** A layer with its own scale (cherry blossom) passes its ramp and labels. */
  gradient?: string;
  low?: string;
  label?: string;
  high?: string;
  className?: string;
}

/** The forecast day and the colour scale in one dock, on the green band the
 *  other pages lead with. The days are named chips, not a slider with blank
 *  ticks: which day the map shows is readable before anything is touched. */
export default function MapDock({
  gradient,
  low,
  label,
  high,
  className,
}: MapDockProps) {
  const { activeDay, setActiveDay } = useMapStore();
  const { t, i18n } = useTranslation('map');

  // ponytail: base date = device today; tiles regenerate daily so d0 == today.
  const base = new Date();
  const weekday = new Intl.DateTimeFormat(i18n.language, { weekday: 'short' });
  const days = Array.from({ length: FORECAST_DAYS }, (_, day) => {
    const date = new Date(base);
    date.setDate(date.getDate() + day);
    return {
      day,
      name:
        day === 0
          ? t('forecast.today', { defaultValue: 'Today' })
          : weekday.format(date),
      date: date.getDate(),
    };
  });

  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-card p-3',
        BAND_SURFACE_CLASS,
        className
      )}
    >
      <div
        role='group'
        aria-label={t('forecast.label', { defaultValue: 'Forecast' })}
        className='grid grid-cols-7 gap-1'
      >
        {days.map(({ day, name, date }) => {
          const active = day === activeDay;
          return (
            <button
              key={day}
              type='button'
              aria-pressed={active}
              onClick={() => setActiveDay(day)}
              className={cn(
                'focus-ring flex min-h-11 min-w-0 flex-col items-center justify-center rounded-xl leading-tight transition-colors',
                active
                  ? 'bg-happy-50 text-happy-900 dark:bg-happy-50 dark:text-happy-900'
                  : 'text-happy-100 hover:bg-happy-50/10 dark:hover:bg-happy-50/10'
              )}
            >
              <span className='max-w-full truncate text-xs font-medium'>
                {name}
              </span>
              <span
                className={cn(
                  'text-xs tabular-nums',
                  !active && 'text-happy-300'
                )}
              >
                {date}
              </span>
            </button>
          );
        })}
      </div>

      {/* Drag across the week to watch the map change; the chips above follow.
          Inset half a column each side so the thumb stops under each chip.
          The slider draws in --foreground on --background, so the band
          re-points both: a fine light-green line instead of ink. */}
      <div
        className='-mt-1 [--background:var(--happy-900)] [--foreground:var(--happy-300)]'
        style={{ marginInline: `calc(100% / ${FORECAST_DAYS * 2} - 0.5rem)` }}
      >
        <Slider
          min={0}
          max={FORECAST_DAYS - 1}
          step={1}
          value={[activeDay]}
          onValueChange={([next]) => setActiveDay(next)}
          formatValue={day => `${days[day].name} ${days[day].date}`}
          aria-label={t('forecast.label', { defaultValue: 'Forecast' })}
        />
      </div>

      <div>
        <div className='mb-1.5 flex items-center justify-between text-xs leading-none text-happy-100'>
          <span>{low ?? t('scale.low')}</span>
          <span className='font-semibold text-happy-50'>
            {label ?? t('scale.label')}
          </span>
          <span>{high ?? t('scale.high')}</span>
        </div>
        {/* The real fill-color ramp from the map style, so the legend is what
            is painted, not a decoration in the same hues. */}
        <div
          className='h-2 rounded-full'
          style={{ background: gradient ?? getScoreGradientCss() }}
        />
      </div>
    </div>
  );
}
