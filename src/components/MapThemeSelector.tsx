import React, { useEffect, useRef, useState } from 'react';
import { Check, Palette } from '@/lib/icons';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { DURATION_FAST, EASE_STANDARD } from '@/lib/motion';
import { useMapStore, MAP_THEMES } from '@/store/mapStore';
import { Button } from '@/components/ui/button';
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
    // Radix gives Select and DropdownMenu Escape for free; this surface is
    // hand-rolled, so it has to say so itself.
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  return (
    // Trailhead: w-fit h-fit, not bare `relative`. The popover anchors with
    // `top-full`, which means "below this box" — and a flex or grid parent
    // stretches the box by default, so the anchor silently becomes the bottom
    // of whatever cell the caller put it in. The map's control stack is a
    // flex-col, where stretch is horizontal and the height already hugged the
    // trigger; a flex-row dropped the popover 448px down the page.
    <div className={cn('relative w-fit h-fit', className)} ref={containerRef}>
      <Button
        data-slot='map-theme-trigger'
        variant='outline'
        size='icon'
        onClick={() => setIsOpen(open => !open)}
        aria-label={t('themes.select')}
        aria-expanded={isOpen}
        aria-haspopup='true'
        title={t('themes.select')}
        className={cn(
          darkLayersVisible && 'text-foreground hover:text-foreground',
          isOpen && 'bg-happy-50 dark:bg-accent/50'
        )}
      >
        <Palette className='size-4' />
      </Button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            data-slot='map-theme-content'
            initial={{ opacity: 0, scale: 0.97, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -6 }}
            // Motion (#225): there is a synced JS token file now — see
            // src/lib/motion.ts, guarded against src/index.css by
            // src/test/motion.test.ts.
            transition={{ duration: DURATION_FAST, ease: EASE_STANDARD }}
            // Trailhead: no border, bigger radius + shadow, on the same
            // popover treatment as Select and DropdownMenu. It stays
            // hand-rolled rather than becoming a Select because its rows carry
            // a thumbnail and a two-line description, which SelectItem's single
            // text column has nowhere to put.
            className='absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)] bg-popover text-popover-foreground rounded-card border-0 elevation-floating overflow-hidden z-30'
          >
            <p className='px-4 pt-3 pb-1.5 type-micro text-muted-foreground'>
              {t('themes.select')}
            </p>
            <ul className='max-h-96 overflow-y-auto py-1'>
              {MAP_THEMES.map(theme => {
                const isSelected = theme.styleIndex === mapStyleIndex;
                return (
                  <li key={theme.id} className='px-1.5'>
                    <button
                      data-slot='map-theme-item'
                      type='button'
                      onClick={() => {
                        setMapStyleIndex(theme.styleIndex);
                        setIsOpen(false);
                      }}
                      aria-pressed={isSelected}
                      className={cn(
                        'appearance-none w-full flex items-center gap-3 rounded-xl border-0 bg-transparent px-2.5 py-2 text-left transition-colors',
                        isSelected
                          ? 'bg-happy-100 text-happy-900 dark:bg-happy-900 dark:text-happy-100'
                          : 'hover:bg-happy-50 dark:hover:bg-accent/50'
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
                            'text-sm truncate',
                            isSelected ? 'font-semibold' : 'font-medium'
                          )}
                        >
                          {t(`themes.${theme.id}.name`)}
                        </p>
                        <p
                          className={cn(
                            'text-xs leading-snug line-clamp-2',
                            !isSelected && 'text-muted-foreground'
                          )}
                        >
                          {t(`themes.${theme.id}.description`)}
                        </p>
                      </div>
                      <Check
                        className={cn(
                          'size-4 shrink-0 transition-opacity',
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
