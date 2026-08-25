import React, { useEffect, useRef, useState } from 'react';
import { Check, Palette } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
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

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={cn('relative', className)} ref={containerRef}>
      <Button
        variant='outline'
        size='icon'
        onClick={() => setIsOpen(open => !open)}
        aria-label={t('themes.select')}
        title={t('themes.select')}
        className={cn(
          darkLayersVisible && 'text-foreground hover:text-foreground',
          isOpen && 'bg-happy-50'
        )}
      >
        <Palette className='h-4 w-4' />
      </Button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -6 }}
            // Motion (#200): mirrors CSS --duration-fast (150ms) and
            // --ease-standard (cubic-bezier(0.4, 0, 0.2, 1)). There is no
            // synced JS token file by design, so these numeric values are
            // kept greppable against the CSS tokens they shadow.
            transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
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
                        isSelected ? 'bg-happy-100' : 'hover:bg-muted'
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
                            isSelected && 'text-happy-900'
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
