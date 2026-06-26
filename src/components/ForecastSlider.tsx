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
      className={`bg-white/95 backdrop-blur-sm border border-gray-200 px-3 py-2 md:px-4 md:py-3 rounded-lg shadow-sm ${className}`}
    >
      <div className='flex items-center justify-between text-xs leading-none mb-1 md:mb-2'>
        <span className='font-bold text-gray-900'>
          {t('forecast.label', { defaultValue: 'Forecast' })}
        </span>
        <span className='text-gray-600'>{activeLabel}</span>
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
    </div>
  );
}
