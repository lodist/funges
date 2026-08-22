import { useMapStore } from '@/store/mapStore';
import { FORECAST_DAYS, forecastDayLabel } from '@/lib/forecast';
import { useTranslation } from 'react-i18next';

// ponytail: base date = device today; tiles regenerate daily so d0 == today.
// Upgrade path (spec D1): fetch a forecast_meta.json base_date if drift appears.
export default function ForecastSlider({
  className = '',
}: {
  className?: string;
}) {
  const { activeDay, setActiveDay } = useMapStore();
  const { t } = useTranslation('map');
  const base = new Date();
  const activeLabel =
    activeDay === 0
      ? t('forecast.today', { defaultValue: 'Today' })
      : forecastDayLabel(base, activeDay);

  return (
    <div
      // Trailhead (#213): floating map control — no border, soft shadow.
      className={`flex flex-col justify-center bg-card/95 backdrop-blur-sm px-3 md:px-4 rounded-2xl shadow-[0_2px_10px_rgba(0,0,0,0.18)] h-14 md:h-[68px] ${className}`}
    >
      <div className='flex items-center justify-between text-xs leading-none mb-1 md:mb-2'>
        <span className='font-bold text-foreground'>
          {t('forecast.label', { defaultValue: 'Forecast' })}
        </span>
        <span className='text-muted-foreground'>{activeLabel}</span>
      </div>
      <input
        type='range'
        min={0}
        max={FORECAST_DAYS - 1}
        step={1}
        value={activeDay}
        onChange={e => setActiveDay(Number(e.target.value))}
        aria-label={t('forecast.label', { defaultValue: 'Forecast day' })}
        className='w-full accent-[var(--happy-600)]'
      />
    </div>
  );
}
