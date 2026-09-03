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
  // One function for the two places a day is spoken: the caption a sighted user
  // reads and the aria-valuetext a screen reader hears.
  const dayLabel = (day: number) =>
    day === 0
      ? t('forecast.today', { defaultValue: 'Today' })
      : forecastDayLabel(base, day, i18n.language);
  const activeLabel = dayLabel(activeDay);

  return (
    <Card
      surface='glass'
      padding='compact'
      // No shadow: it sits on the map beside controls that carry their own, and
      // a second one read as a competing floating layer.
      className={`shadow-none ${className}`}
    >
      <div className='flex items-center justify-between text-xs mb-2.5'>
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
        formatValue={dayLabel}
        aria-label={t('forecast.label', { defaultValue: 'Forecast day' })}
      />
    </Card>
  );
}
