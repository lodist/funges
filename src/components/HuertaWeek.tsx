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

/** The week on the band: the frost line, then soil, nights, rain, watering,
 *  and under them this place's frost dates. */
export function HuertaWeek({
  advice,
  title,
  className,
  children,
}: {
  advice: PlaceAdvice;
  /** A line above the frost line: the place, on the map. */
  title?: ReactNode;
  className?: string;
  /** More on the band, under the frost dates. */
  children?: ReactNode;
}) {
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
  return (
    <section
      aria-label={t('week.label')}
      className={cn(
        '@container rounded-card p-6 sm:p-8',
        BAND_SURFACE_CLASS,
        className
      )}
    >
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
      <dl className='mt-6 grid grid-cols-2 gap-6 @lg:grid-cols-4'>
        <Fact icon={Thermometer} label={t('week.soil')}>
          {value(advice.soil, 'celsius')}
        </Fact>
        <Fact icon={Moon} label={t('week.nights')}>
          {value(advice.nights, 'celsius')}
        </Fact>
        <Fact icon={CloudRain} label={t('week.rain')}>
          {value(advice.rain, 'mm')}
        </Fact>
        <Fact icon={Droplets} label={t('week.water')}>
          {advice.water === 0
            ? t('week.noWater')
            : value(advice.water, 'litres')}
        </Fact>
      </dl>
      {advice.lastFrost !== undefined ? (
        <p className='mt-6 flex flex-wrap gap-x-6 gap-y-1 border-t border-happy-100/25 pt-4 text-sm text-happy-100'>
          {dates.length > 0
            ? dates.map(date => <span key={date}>{date}</span>)
            : t('week.noFrostDates')}
        </p>
      ) : null}
      {children}
    </section>
  );
}

function Fact({
  icon: Icon,
  label,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className='flex gap-3'>
      <Icon className='mt-0.5 size-4 shrink-0 text-happy-300' />
      <div className='min-w-0'>
        <dt className='type-micro text-happy-100'>{label}</dt>
        <dd className='mt-1 font-display text-2xl font-semibold text-band-foreground'>
          {children}
        </dd>
      </div>
    </div>
  );
}
