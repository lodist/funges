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
        // Trailhead (#213): circular floating icon button, matching the
        // map's other controls (zoom/locate/layers) — no border.
        className={`inline-flex items-center justify-center rounded-full size-11 border-0 shadow-[0_2px_10px_rgba(0,0,0,0.18)] transition-colors disabled:pointer-events-none disabled:opacity-50 ${
          darkLayersVisible
            ? 'bg-card text-foreground'
            : 'bg-card text-[var(--happy-700)]'
        } ${isOpen ? 'bg-[var(--happy-50)]' : 'hover:bg-[var(--happy-50)]'}`}
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
            // Trailhead (#213): no border, bigger radius + shadow, mirrors
            // the Select/DropdownMenu popover treatment.
            className='absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)] bg-popover rounded-2xl border-0 shadow-[0_4px_20px_rgba(0,0,0,0.16)] overflow-hidden z-30'
          >
            <p className='px-3 pt-3 pb-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase'>
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
                        'appearance-none w-full flex items-center gap-3 rounded-xl border-0 bg-transparent px-2 py-2 text-left transition-colors',
                        isSelected
                          ? 'bg-[var(--happy-100)]'
                          : 'hover:bg-muted'
                      )}
                    >
                      <div className='relative w-14 h-10 rounded-md overflow-hidden bg-muted flex-shrink-0'>
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
                            'text-sm font-medium text-foreground truncate',
                            isSelected && 'text-[var(--happy-900)]'
                          )}
                        >
                          {t(`themes.${theme.id}.name`)}
                        </p>
                        <p className='text-xs leading-snug text-muted-foreground line-clamp-2'>
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
