import { useTranslation } from 'react-i18next';
import { getScoreGradientCss } from '@/lib/scoreColor';

export default function MapInfoCard() {
  const { t } = useTranslation('map');

  return (
    <div className='flex flex-col justify-center bg-white/95 backdrop-blur-sm border border-gray-200 px-3 md:px-4 rounded-lg shadow-sm md:w-96 h-14 md:h-[68px]'>
      <div className='flex items-center justify-between text-xs leading-none mb-1 md:mb-2'>
        <span className='text-gray-600'>{t('scale.low')}</span>
        <span className='font-bold text-gray-900'>{t('scale.label')}</span>
        <span className='text-gray-600'>{t('scale.high')}</span>
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
