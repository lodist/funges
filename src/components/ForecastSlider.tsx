import { useMapStore } from '@/store/mapStore';
import { FORECAST_DAYS, forecastDayLabel } from '@/lib/forecast';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';

// ponytail: base date = device today; tiles regenerate daily so d0 == today.
// Upgrade path (spec D1): fetch a forecast_meta.json base_date if drift appears.
export default function ForecastSlider({
  className = '',
}: {
  className?: string;
}) {
  const { activeDay, setActiveDay } = useMapStore();
  const { t, i18n } = useTranslation('map');
  const base = new Date();
  const activeLabel =
    activeDay === 0
      ? t('forecast.today', { defaultValue: 'Today' })
      : forecastDayLabel(base, activeDay, i18n.language);

  return (
    <Card
      // Trailhead (#213): floating map control. No shadow — it already sits
      // directly on the map next to the button/theme-selector controls, which
      // carry their own shadow; stacking another one here read as a second,
      // competing floating layer instead of one coherent control cluster.
      className={`shadow-none hover:shadow-none bg-card/95 backdrop-blur-sm px-4 py-3 ${className}`}
    >
      <div className='flex items-center justify-between text-xs leading-none mb-2.5'>
        <span className='font-bold text-foreground'>
          {t('forecast.label', { defaultValue: 'Forecast' })}
        </span>
        <span className='text-muted-foreground'>{activeLabel}</span>
      </div>
      <Slider
        min={0}
        max={FORECAST_DAYS - 1}
        step={1}
        value={[activeDay]}
        onValueChange={([next]) => setActiveDay(next)}
        showTicks
        aria-label={t('forecast.label', { defaultValue: 'Forecast day' })}
      />
    </Card>
  );
}
