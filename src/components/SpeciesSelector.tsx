import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMapStore } from '@/store/mapStore';
import { cn } from '@/lib/utils';
import { getSpeciesImage } from '@/lib/utils';
import { SPECIES_DATA } from '@/data/species';
import SpeciesSelectorFullscreen from './SpeciesSelectorFullscreen';
import { motion, AnimatePresence } from 'framer-motion';

interface SpeciesSelectorProps {
  className?: string;
}

const SpeciesSelector: React.FC<SpeciesSelectorProps> = ({
  className = '',
}) => {
  const { t } = useTranslation('map');
  const { t: tSpecies } = useTranslation('species');
  const { selectedSpecies, speciesOptions } = useMapStore();

  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedSpeciesData = selectedSpecies
    ? speciesOptions.find(opt => opt.code === selectedSpecies)
    : null;

  const selectedSpeciesLabel = selectedSpecies
    ? `${speciesOptions.find(opt => opt.code === selectedSpecies)?.emoji || ''} ${tSpecies(`list_of_species.${selectedSpecies}.name`)}`
    : t('species.select');

  return (
    <div className={cn('relative', className)} ref={dropdownRef}>
      {/* Compact tile - always shown when species is selected */}
      {selectedSpeciesData ? (
        <motion.button
          onClick={() => setIsOpen(!isOpen)}
          // Trailhead (#213): floating map control — no border, soft shadow.
          className={cn(
            'flex items-center border-0 bg-card/95 backdrop-blur-sm hover:bg-[var(--happy-50)]/95 transition-all duration-[var(--duration-base)] shadow-[0_2px_10px_rgba(0,0,0,0.18)]',
            'h-16 px-2 py-2 rounded-2xl',
            isOpen && 'bg-[var(--happy-50)]/95'
          )}
          layoutId='species-selector-button'
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.95 }}
          transition={{
            // Motion (#200): mirrors CSS --duration-base (200ms).
            duration: 0.2,
            type: 'spring',
            stiffness: 400,
            damping: 25,
          }}
        >
          <div className='flex items-center gap-3 w-full'>
            {/* Species Image */}
            <div className='relative w-12 h-12 bg-[var(--happy-50)] overflow-hidden rounded-lg flex-shrink-0'>
              {getSpeciesImage(selectedSpeciesData.code) ? (
                <img
                  src={getSpeciesImage(selectedSpeciesData.code)!}
                  alt={tSpecies(
                    `list_of_species.${selectedSpeciesData.code}.name`
                  )}
                  className='w-full h-full object-cover object-center'
                  loading='lazy'
                />
              ) : (
                <div className='w-full h-full flex items-center justify-center text-lg'>
                  {selectedSpeciesData.emoji}
                </div>
              )}
              <div className='absolute inset-0 bg-black/10' />
            </div>

            {/* Species info */}
            <div className='flex-1 min-w-0 text-left'>
              <h3 className='font-semibold text-foreground text-sm leading-tight mb-1 truncate'>
                {tSpecies(`list_of_species.${selectedSpeciesData.code}.name`)}
              </h3>
              <p className='text-xs text-muted-foreground italic leading-tight truncate'>
                {SPECIES_DATA.find(
                  species => species.id === selectedSpeciesData.code
                )?.scientificName || selectedSpeciesData.code}
              </p>
            </div>
          </div>
        </motion.button>
      ) : (
        /* Full button when no species selected */
        <motion.button
          onClick={() => setIsOpen(!isOpen)}
          // Trailhead (#213): floating map control — no border, soft shadow.
          className={cn(
            'justify-between border-0 bg-card/95 backdrop-blur-sm hover:bg-[var(--happy-50)]/95 transition-all duration-[var(--duration-base)] shadow-[0_2px_10px_rgba(0,0,0,0.18)] rounded-full',
            'w-72 min-h-[32px] px-3 py-1',
            isOpen && 'bg-[var(--happy-50)]/95'
          )}
          layoutId='species-selector-button'
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.95 }}
          transition={{
            // Motion (#200): mirrors CSS --duration-base (200ms).
            duration: 0.2,
            type: 'spring',
            stiffness: 400,
            damping: 25,
          }}
        >
          <div className='flex items-center gap-2 min-w-0 flex-1'>
            <span className={cn('truncate font-medium')}>
              {selectedSpeciesLabel}
            </span>
          </div>
          <ChevronDown
            className={cn(
              'transition-transform duration-[var(--duration-base)] flex-shrink-0',
              'h-3 w-3',
              isOpen ? 'rotate-180' : ''
            )}
          />
        </motion.button>
      )}

      {/* Fullscreen Species Selector with AnimatePresence */}
      <AnimatePresence>
        <SpeciesSelectorFullscreen
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
        />
      </AnimatePresence>
    </div>
  );
};

export default SpeciesSelector;
