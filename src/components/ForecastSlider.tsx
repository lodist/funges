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
      className={`rounded-lg border bg-secondary/95 shadow-lg px-3 py-2 backdrop-blur ${className}`}
    >
      <div className='flex items-center justify-between text-xs font-medium mb-1'>
        <span className='text-muted-foreground'>
          {t('forecast.label', { defaultValue: 'Forecast' })}
        </span>
        <span>{activeLabel}</span>
      </div>
      <input
        type='range'
        min={0}
        max={FORECAST_DAYS - 1}
        step={1}
        value={activeDay}
        onChange={e => setActiveDay(Number(e.target.value))}
        aria-label={t('forecast.label', { defaultValue: 'Forecast day' })}
        className='w-full accent-[#800020]'
      />
      <div className='flex justify-between text-[10px] text-muted-foreground/70 mt-0.5'>
        {Array.from({ length: FORECAST_DAYS }, (_, i) => (
          <span key={i}>{i === 0 ? '•' : forecastDayLabel(base, i)}</span>
        ))}
      </div>
    </div>
  );
}
