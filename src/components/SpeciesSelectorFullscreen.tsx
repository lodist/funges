import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Search, X } from 'lucide-react';
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
  const { cachedSpecies } = useOfflineStore();
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
      transition={{
        duration: 0.2,
        ease: [0.4, 0.0, 0.2, 1],
      }}
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
          size='sm'
          onClick={onClose}
          className='h-10 w-10 p-0 bg-white/20 hover:bg-white/40 text-white border border-white/30 hover:border-white/50 transition-all duration-200 flex-shrink-0'
        >
          <X className='h-5 w-5' />
        </Button>
      </div>

      {/* Quick Filters */}
      <div className='px-6 py-3 bg-white/3 backdrop-blur-lg'>
        <div className='flex flex-wrap gap-2 justify-center'>
          {categories.map(category => (
            <button
              key={category.value}
              onClick={() => setSelectedCategory(category.value)}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200',
                'border backdrop-blur-sm',
                selectedCategory === category.value
                  ? 'bg-primary text-primary-foreground border-primary shadow-lg'
                  : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 hover:text-gray-900'
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
                const disabled =
                  !isOnline && !cachedSpecies.includes(species.code);
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
                    className={cn(
                      'group relative bg-white rounded-xl border-2 transition-all duration-200 hover:shadow-lg',
                      'p-4 text-center min-h-[140px] flex flex-col items-center justify-center',
                      'hover:scale-105 active:scale-95',
                      disabled
                        ? 'opacity-50 cursor-not-allowed border-gray-300'
                        : isSelected
                          ? 'border-primary border-4 shadow-xl shadow-primary/30 bg-gray-100 scale-105'
                          : 'border-gray-300 hover:border-primary/50 hover:shadow-md'
                    )}
                  >
                    {/* Selection indicator */}
                    {isSelected && (
                      <div className='absolute -top-3 -right-3 w-8 h-8 bg-primary rounded-full flex items-center justify-center shadow-lg border-2 border-white'>
                        <div className='w-3 h-3 bg-white rounded-full' />
                      </div>
                    )}

                    {/* Species Image */}
                    <div
                      className={cn(
                        'relative w-16 h-16 bg-gradient-to-br from-green-50 to-green-100 overflow-hidden rounded-lg mb-3',
                        'flex-shrink-0 transition-transform duration-200 group-hover:scale-110'
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
                          'font-semibold text-gray-900 leading-tight mb-1 break-words text-sm',
                          isSelected && 'text-primary'
                        )}
                      >
                        {tSpecies(`list_of_species.${species.code}.name`)}
                      </h3>

                      {/* Scientific name */}
                      <p className='text-xs text-gray-600 italic leading-tight break-words'>
                        {SPECIES_DATA.find(
                          speciesData => speciesData.id === species.code
                        )?.scientificName || species.code}
                      </p>
                    </div>

                    {/* Offline indicator */}
                    {disabled && (
                      <div className='absolute top-2 left-2'>
                        <div className='w-2 h-2 bg-red-500 rounded-full' />
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
