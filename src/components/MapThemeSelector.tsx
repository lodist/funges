import React, { useEffect, useRef, useState } from 'react';
import { Check, Palette } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { useMapStore, MAP_THEMES } from '@/store/mapStore';
import { cn } from '@/lib/utils';

interface MapThemeSelectorProps {
  className?: string;
}

const MapThemeSelector: React.FC<MapThemeSelectorProps> = ({
  className = '',
}) => {
  const { t } = useTranslation('map');
  const { mapStyleIndex, darkLayersVisible, setMapStyleIndex } = useMapStore();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={cn('relative', className)} ref={containerRef}>
      <motion.button
        onClick={() => setIsOpen(open => !open)}
        aria-label={t('themes.select')}
        className={`inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors disabled:pointer-events-none disabled:opacity-50 border h-9 px-3 shadow-lg ${
          darkLayersVisible
            ? 'bg-gray-100 border-gray-300 text-gray-800'
            : 'bg-secondary border-input'
        } ${isOpen ? 'ring-2 ring-primary/20 border-primary/30' : ''}`}
        title={t('themes.select')}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.95 }}
        transition={{
          duration: 0.2,
          type: 'spring',
          stiffness: 400,
          damping: 25,
        }}
      >
        <Palette className='h-4 w-4' />
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -6 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className='absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white rounded-xl border border-gray-200 shadow-xl overflow-hidden z-30'
          >
            <p className='px-3 pt-3 pb-1.5 text-[11px] font-semibold tracking-wide text-gray-400 uppercase'>
              {t('themes.select')}
            </p>
            <ul className='max-h-96 overflow-y-auto py-1'>
              {MAP_THEMES.map(theme => {
                const isSelected = theme.styleIndex === mapStyleIndex;
                return (
                  <li key={theme.id} className='px-1.5'>
                    <button
                      type='button'
                      onClick={() => {
                        setMapStyleIndex(theme.styleIndex);
                        setIsOpen(false);
                      }}
                      aria-pressed={isSelected}
                      className={cn(
                        'appearance-none w-full flex items-center gap-3 rounded-lg border border-transparent bg-transparent px-2 py-2 text-left transition-colors',
                        isSelected ? 'bg-primary/8' : 'hover:bg-gray-50'
                      )}
                    >
                      <div className='relative w-14 h-10 rounded-md overflow-hidden bg-gray-100 flex-shrink-0 border border-gray-200'>
                        <img
                          src={theme.thumbnail}
                          alt=''
                          className='w-full h-full object-cover'
                          loading='lazy'
                        />
                      </div>
                      <div className='min-w-0 flex-1'>
                        <p
                          className={cn(
                            'text-sm font-medium text-gray-900 truncate',
                            isSelected && 'text-primary'
                          )}
                        >
                          {t(`themes.${theme.id}.name`)}
                        </p>
                        <p className='text-xs leading-snug text-gray-500 line-clamp-2'>
                          {t(`themes.${theme.id}.description`)}
                        </p>
                      </div>
                      <Check
                        className={cn(
                          'h-4 w-4 flex-shrink-0 text-primary transition-opacity',
                          isSelected ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MapThemeSelector;
