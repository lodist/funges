import type { ComponentType, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { BAND_SURFACE_CLASS } from '@/lib/band-surface';
import { weekday, type PlaceAdvice } from '@/lib/huerta';
import {
  CloudRain,
  Droplets,
  Moon,
  Snowflake,
  Sun,
  Thermometer,
} from '@/lib/icons';
import { cn } from '@/lib/utils';

/** A day of the year as "22 March", in the reader's language. */
const dayOfYear = (day: number, language: string) =>
  new Intl.DateTimeFormat(language, { day: 'numeric', month: 'long' }).format(
    new Date(2026, 0, day)
  );

type Tone = 'band' | 'card';
/** Each fact's icon on a card: warmth in the chart's warm, water in its cool. */
const ICON: Record<'soil' | 'nights' | 'rain' | 'water', string> = {
  soil: 'text-chart-warm',
  nights: 'text-chart-cool',
  rain: 'text-chart-cool',
  water: 'text-chart-cool',
};

/** The week: the frost line, then soil, nights, rain, watering, and under
 *  them this place's frost dates. All on the band (the garden page), or the
 *  frost line on the band over a card with the rest (`card`, the map). */
export function HuertaWeek({
  advice,
  title,
  tone = 'band',
  className,
  children,
}: {
  advice: PlaceAdvice;
  /** A line above the frost line: the place, on the map. */
  title?: ReactNode;
  tone?: Tone;
  className?: string;
  /** More under the frost dates. */
  children?: ReactNode;
}) {
  const card = tone === 'card';
  const { t, i18n } = useTranslation('huerta');
  const FrostIcon = advice.frost === 'none' ? Sun : Snowflake;
  const value = (number: number | null, unit: 'celsius' | 'mm' | 'litres') =>
    number === null ? '–' : t(`units.${unit}`, { value: Math.round(number) });
  const dates = [
    advice.lastFrost == null
      ? null
      : t('week.lastFrost', {
          date: dayOfYear(advice.lastFrost, i18n.language),
        }),
    advice.firstFrost == null
      ? null
      : t('week.firstFrost', {
          date: dayOfYear(advice.firstFrost, i18n.language),
        }),
  ].filter((date): date is string => date !== null);
  const head = (
    <>
      {title}
      <p className='flex items-center gap-2 text-lg font-semibold'>
        <FrostIcon className='size-5 shrink-0 text-happy-300' />
        {t(`frost.${advice.frost}`)}
      </p>
      {advice.laterFrost &&
      advice.laterFrost !== 'none' &&
      advice.laterNight ? (
        <p className='mt-1 pl-7 text-sm text-happy-100'>
          {t(`week.later.${advice.laterFrost}`, {
            night: weekday(advice.laterNight, i18n.language),
          })}
        </p>
      ) : null}
    </>
  );
  const body = (
    <>
      <dl
        className={cn(
          'grid grid-cols-2 gap-6 @lg:grid-cols-4',
          !card && 'mt-6'
        )}
      >
        <Fact tone={tone} icon={Thermometer} fact='soil' label={t('week.soil')}>
          {value(advice.soil, 'celsius')}
        </Fact>
        <Fact tone={tone} icon={Moon} fact='nights' label={t('week.nights')}>
          {value(advice.nights, 'celsius')}
        </Fact>
        <Fact tone={tone} icon={CloudRain} fact='rain' label={t('week.rain')}>
          {value(advice.rain, 'mm')}
        </Fact>
        <Fact tone={tone} icon={Droplets} fact='water' label={t('week.water')}>
          {advice.water === 0
            ? t('week.noWater')
            : value(advice.water, 'litres')}
        </Fact>
      </dl>
      {advice.lastFrost !== undefined ? (
        <p
          className={cn(
            'mt-6 flex flex-wrap gap-x-6 gap-y-1 border-t pt-4 text-sm',
            card
              ? 'mt-5 border-border text-muted-foreground'
              : 'border-happy-100/25 text-happy-100'
          )}
        >
          {dates.length > 0
            ? dates.map(date => <span key={date}>{date}</span>)
            : t('week.noFrostDates')}
        </p>
      ) : null}
      {children}
    </>
  );
  return card ? (
    <section
      aria-label={t('week.label')}
      className={cn(
        '@container overflow-hidden rounded-card bg-card text-foreground',
        className
      )}
    >
      <div className={cn('p-4 sm:p-5', BAND_SURFACE_CLASS)}>{head}</div>
      <div className='p-4 sm:p-5'>{body}</div>
    </section>
  ) : (
    <section
      aria-label={t('week.label')}
      className={cn(
        '@container rounded-card p-6 sm:p-8',
        BAND_SURFACE_CLASS,
        className
      )}
    >
      {head}
      {body}
    </section>
  );
}

function Fact({
  tone,
  icon: Icon,
  fact,
  label,
  children,
}: {
  tone: Tone;
  icon: ComponentType<{ className?: string }>;
  fact: keyof typeof ICON;
  label: string;
  children: ReactNode;
}) {
  const card = tone === 'card';
  return (
    <div className='flex gap-3'>
      <Icon
        className={cn(
          'mt-0.5 size-4 shrink-0',
          card ? ICON[fact] : 'text-happy-300'
        )}
      />
      <div className='min-w-0'>
        <dt
          className={cn(
            'type-micro',
            card ? 'text-muted-foreground' : 'text-happy-100'
          )}
        >
          {label}
        </dt>
        <dd
          className={cn(
            'mt-1 font-display text-2xl font-semibold',
            card ? 'text-foreground' : 'text-band-foreground'
          )}
        >
          {children}
        </dd>
      </div>
    </div>
  );
}
