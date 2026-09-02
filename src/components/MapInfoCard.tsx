import { useTranslation } from 'react-i18next';
import { getScoreGradientCss } from '@/lib/scoreColor';

export default function MapInfoCard() {
  const { t } = useTranslation('map');

  // Glass Regular at elevation raised — the sanctioned material for small
  // chrome floating over the map. Was a hand-rolled bg-white/95 +
  // backdrop-blur-sm + shadow-sm, which bypassed the role system and put a
  // pure white (banned in this warm light theme) over the terrain.
  return (
    <div className='flex flex-col justify-center elevation-raised glass-regular px-3 md:px-4 rounded-lg md:w-96 h-14 md:h-[68px]'>
      <div className='flex items-center justify-between text-xs leading-none mb-1 md:mb-2'>
        <span className='text-muted-foreground'>{t('scale.low')}</span>
        <span className='font-bold text-foreground'>{t('scale.label')}</span>
        <span className='text-muted-foreground'>{t('scale.high')}</span>
      </div>
      {/* Real fill-color ramp from the map style (getScoreGradientCss), not an
          approximated 2-stop gradient — a faithful legend for what's actually
          painted on the map, not just a same-hued decoration. */}
      <div
        className='h-2 md:h-3 rounded-full'
        style={{ background: getScoreGradientCss() }}
      />
    </div>
  );
}
