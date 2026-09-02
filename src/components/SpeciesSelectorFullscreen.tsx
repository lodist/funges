import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Search, X } from '@/lib/icons';
import { useTranslation } from 'react-i18next';
import { useMapStore } from '@/store/mapStore';
import { cn } from '@/lib/utils';
import { getSpeciesImage } from '@/lib/utils';
import { useNavigate } from '@tanstack/react-router';
import { useOfflineStore } from '@/store/offlineStore';
import { usePWA } from '@/hooks/use-pwa';
import { SPECIES_DATA } from '@/data/species';
import { Button } from './ui/button';
import { motion } from 'framer-motion';
import { DURATION_BASE, EASE_STANDARD } from '@/lib/motion';
import { useIsMobile } from '@/hooks/use-mobile';

interface SpeciesSelectorFullscreenProps {
  isOpen: boolean;
  onClose: () => void;
  className?: string;
}

const SpeciesSelectorFullscreen: React.FC<SpeciesSelectorFullscreenProps> = ({
  isOpen,
  onClose,
  className = '',
}) => {
  const { t } = useTranslation('map');
  const { t: tSpecies } = useTranslation('species');
  const {
    selectedSpecies,
    speciesOptions,
    setSelectedSpecies,
    updateVisibleLayers,
  } = useMapStore();
  const { cached } = useOfflineStore();
  // ponytail: offline caching is per-continent (no per-species data files exist),
  // so we can't tell which species a cached continent actually covers here —
  // treat "any continent cached" as "species are available offline".
  const hasAnyCachedRegion = Object.keys(cached).length > 0;
  const { isOnline } = usePWA();
  const navigate = useNavigate({ from: '/' });
  const isMobile = useIsMobile();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Close on escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  // Reset search and category when opening
  useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
      setSelectedCategory('all');
    }
  }, [isOpen]);

  // Category options for quick filters
  const categories = [
    { value: 'all', label: tSpecies('allTypes'), icon: '🍃' },
    { value: 'mushroom', label: tSpecies('mushrooms'), icon: '🍄' },
    { value: 'plant', label: tSpecies('plants'), icon: '🌿' },
    { value: 'berry', label: tSpecies('berries'), icon: '🫐' },
    { value: 'nut', label: tSpecies('nuts'), icon: '🌰' },
    { value: 'flower', label: tSpecies('flowers'), icon: '🌸' },
  ];

  // Filter and sort species based on search term and category
  const filteredSpecies = speciesOptions
    .filter(option => {
      const speciesData = SPECIES_DATA.find(
        speciesData => speciesData.id === option.code
      );

      const matchesSearch =
        searchTerm === '' ||
        tSpecies(`list_of_species.${option.code}.name`)
          .toLowerCase()
          .includes(searchTerm.toLowerCase());

      const matchesCategory =
        selectedCategory === 'all' ||
        (speciesData && speciesData.category === selectedCategory);

      return matchesSearch && matchesCategory;
    })
    .sort((a, b) =>
      tSpecies(`list_of_species.${a.code}.name`).localeCompare(
        tSpecies(`list_of_species.${b.code}.name`)
      )
    );

  const handleSpeciesSelect = (speciesCode: string) => {
    setSelectedSpecies(speciesCode);
    navigate({
      search: { species: speciesCode },
    });
    onClose();
    updateVisibleLayers();
  };

  if (!isOpen) return null;

  return (
    <motion.div
      layoutId='species-selector'
      initial={{ opacity: 0, scale: 0.8, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.8, y: 20 }}
      transition={{ duration: DURATION_BASE, ease: EASE_STANDARD }}
      className={cn(
        'fixed inset-0 z-60 bg-black/15 backdrop-blur-lg',
        'flex flex-col w-full h-full',
        className
      )}
    >
      {/* Header */}
      <div className='flex items-center gap-4 px-6 py-4 bg-white/3 backdrop-blur-lg'>
        <div className='relative flex-1 max-w-md lg:max-w-lg xl:max-w-xl mx-auto'>
          <Search className='absolute left-3 top-1/2 transform -translate-y-1/2 text-white/60 h-5 w-5' />
          <Input
            type='text'
            placeholder={t('species.search')}
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className='pl-12 pr-4 h-10 text-lg border-white/30 bg-white/20 text-white placeholder:text-white/60 focus:border-white/50 focus:ring-white/20 backdrop-blur-sm w-full'
            autoFocus={!isMobile}
          />
        </div>

        <Button
          variant='ghost'
          size='icon'
          onClick={onClose}
          aria-label={t('common:common.close')}
          className='bg-white/20 hover:bg-white/40 text-white border-white/30 hover:border-white/50 flex-shrink-0'
        >
          <X className='size-5' />
        </Button>
      </div>

      {/* Quick Filters */}
      <div className='px-6 py-3 bg-white/3 backdrop-blur-lg'>
        <div className='flex flex-wrap gap-2 justify-center'>
          {categories.map(category => (
            <button
              key={category.value}
              onClick={() => setSelectedCategory(category.value)}
              // Trailhead (#213): filter chip — selected stays the same
              // neutral fill as unselected, marked by weight only (no
              // colour swap), no border.
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-full text-sm transition-all duration-base border-0 backdrop-blur-sm',
                selectedCategory === category.value
                  ? 'bg-white text-foreground font-semibold shadow-[0_1px_4px_rgba(0,0,0,0.08)]'
                  : 'bg-white/90 text-foreground font-medium hover:bg-white'
              )}
            >
              <span className='text-base'>{category.icon}</span>
              <span className='hidden sm:inline'>{category.label}</span>
            </button>
          ))}
        </div>

        {/* Results Count */}
        <div className='text-sm text-white/60 mt-3 text-center'>
          {tSpecies('search.found')} {filteredSpecies.length}{' '}
          {tSpecies('search.species')}
        </div>
      </div>

      {/* Species grid */}
      <div className='flex-1 overflow-hidden bg-white/3 backdrop-blur-lg'>
        <div className='h-full overflow-y-auto p-6'>
          {filteredSpecies.length === 0 ? (
            <motion.div
              className='text-center text-white/80 py-12'
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Search className='mx-auto mb-4 text-white/40 h-16 w-16' />
              <p className='text-lg font-medium'>{t('species.noResults')}</p>
              <p className='text-sm text-white/60'>
                {t(
                  'species.noResultsDescription',
                  'Nessuna specie trovata con questo nome'
                )}
              </p>
              {/* Clear filters button */}
              {(searchTerm !== '' || selectedCategory !== 'all') && (
                <Button
                  variant='outline'
                  onClick={() => {
                    setSearchTerm('');
                    setSelectedCategory('all');
                  }}
                  className='mt-4 bg-white/20 border-white/30 text-white hover:bg-white/30 hover:border-white/50'
                >
                  {tSpecies('search.clear')}
                </Button>
              )}
            </motion.div>
          ) : (
            <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4'>
              {filteredSpecies.map((species, _index) => {
                const disabled = !isOnline && !hasAnyCachedRegion;
                const isSelected = selectedSpecies === species.code;

                return (
                  <motion.button
                    key={species.code}
                    onClick={() =>
                      !disabled && handleSpeciesSelect(species.code)
                    }
                    disabled={disabled}
                    tabIndex={disabled ? -1 : 0}
                    title={
                      disabled
                        ? t('species.notAvailableOffline')
                        : tSpecies(`list_of_species.${species.code}.name`)
                    }
                    aria-disabled={disabled}
                    // Trailhead (#213): no border — selection is a shadow
                    // lift + tint + the corner checkmark badge, not a ring.
                    className={cn(
                      'group relative bg-card rounded-card border-0 transition-all duration-base hover:shadow-[0_6px_20px_rgba(0,0,0,0.14)]',
                      'p-4 text-center min-h-[140px] flex flex-col items-center justify-center',
                      'hover:scale-105 active:scale-95',
                      disabled
                        ? 'opacity-50 cursor-not-allowed'
                        : isSelected
                          ? 'shadow-[0_6px_20px_rgba(0,0,0,0.14)] bg-happy-50 scale-105'
                          : 'shadow-[0_2px_16px_rgba(0,0,0,0.10)]'
                    )}
                  >
                    {/* Selection indicator */}
                    {isSelected && (
                      <div className='absolute -top-3 -right-3 w-8 h-8 bg-happy-600 rounded-full flex items-center justify-center shadow-[0_2px_8px_rgba(0,0,0,0.18)] border-2 border-white'>
                        <div className='w-3 h-3 bg-white rounded-full' />
                      </div>
                    )}

                    {/* Species Image */}
                    <div
                      className={cn(
                        'relative w-16 h-16 bg-secondary bg-secondary overflow-hidden rounded-lg mb-3',
                        'flex-shrink-0 transition-transform duration-base group-hover:scale-110'
                      )}
                    >
                      {getSpeciesImage(species.code) ? (
                        <img
                          src={getSpeciesImage(species.code)!}
                          alt={tSpecies(`list_of_species.${species.code}.name`)}
                          className='w-full h-full object-cover object-center'
                          loading='lazy'
                        />
                      ) : (
                        <div className='w-full h-full flex items-center justify-center text-2xl'>
                          {species.emoji}
                        </div>
                      )}
                      <div className='absolute inset-0 bg-black/10' />
                    </div>

                    {/* Species name */}
                    <div className='flex-1 min-w-0'>
                      <h3
                        className={cn(
                          'font-semibold text-foreground leading-tight mb-1 break-words text-sm',
                          isSelected && 'text-primary-text'
                        )}
                      >
                        {tSpecies(`list_of_species.${species.code}.name`)}
                      </h3>

                      {/* Scientific name */}
                      <p className='text-xs text-muted-foreground italic leading-tight break-words'>
                        {SPECIES_DATA.find(
                          speciesData => speciesData.id === species.code
                        )?.scientificName || species.code}
                      </p>
                    </div>

                    {/* Offline indicator */}
                    {disabled && (
                      <div className='absolute top-2 left-2'>
                        <div className='w-2 h-2 bg-destructive rounded-full' />
                      </div>
                    )}
                  </motion.button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default SpeciesSelectorFullscreen;
