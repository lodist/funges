import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

interface FilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: string[];
  difficulties: string[];
  tags: string[];
  selectedCategory: string;
  selectedDifficulty: string;
  selectedTag: string;
  onCategoryChange: (category: string) => void;
  onDifficultyChange: (difficulty: string) => void;
  onTagChange: (tag: string) => void;
  onClearFilters: () => void;
}

export default function FilterModal({
  isOpen,
  onClose,
  categories,
  difficulties,
  tags,
  selectedCategory,
  selectedDifficulty,
  selectedTag,
  onCategoryChange,
  onDifficultyChange,
  onTagChange,
  onClearFilters,
}: FilterModalProps) {
  const { t } = useTranslation('recipes');

  if (!isOpen) return null;

  const getCategoryEmoji = (cat: string) => {
    switch (cat) {
      case 'mushroom':
        return '🍄';
      case 'plant':
        return '🌿';
      case 'berry':
        return '🫐';
      case 'nut':
        return '🌰';
      default:
        return '';
    }
  };

  const getDifficultyEmoji = (diff: string) => {
    switch (diff.toLowerCase()) {
      case 'easy':
        return '🟢';
      case 'medium':
        return '🟡';
      case 'hard':
        return '🔴';
      default:
        return '⚪';
    }
  };

  return (
    <div className='fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4'>
      {/* Trailhead (#213): matches Dialog's radius/shadow. */}
      <div className='bg-background rounded-card shadow-[0_8px_32px_rgba(0,0,0,0.24)] max-w-2xl w-full max-h-[90vh] overflow-y-auto flex flex-col relative'>
        {/* Close Button - Top Right */}
        <Button
          variant='ghost'
          size='sm'
          onClick={onClose}
          className='absolute top-4 right-4 z-10 h-8 w-8 p-0 rounded-lg border-0 bg-transparent hover:bg-happy-50 hover:text-happy-700'
        >
          <span className='text-lg'>{'✕'}</span>
        </Button>

        {/* Filters Content */}
        <div className='p-6 space-y-8 flex-1 overflow-y-auto'>
          {/* Category Filters */}
          <div className='space-y-4'>
            <div className='flex items-center gap-2'>
              <span className='text-sm font-semibold text-foreground uppercase tracking-wide'>
                {t('filterBy')}
              </span>
            </div>
            <div className='flex flex-wrap gap-3'>
              <Button
                variant={selectedCategory === 'all' ? 'default' : 'outline'}
                size='sm'
                onClick={() => onCategoryChange('all')}
                className={`transition-all duration-[var(--duration-base)] ${
                  selectedCategory === 'all'
                    ? 'shadow-md scale-105'
                    : 'hover:scale-105'
                }`}
              >
                <span className='flex items-center gap-2'>
                  <span className='text-lg'>🍃</span>
                  <span className='font-medium'>{t('all')}</span>
                </span>
              </Button>
              {categories.map(category => (
                <Button
                  key={category}
                  variant={
                    selectedCategory === category ? 'default' : 'outline'
                  }
                  size='sm'
                  onClick={() => onCategoryChange(category)}
                  className={`transition-all duration-[var(--duration-base)] ${
                    selectedCategory === category
                      ? 'shadow-md scale-105'
                      : 'hover:scale-105'
                  }`}
                >
                  <span className='flex items-center gap-2'>
                    <span className='text-lg'>
                      {getCategoryEmoji(category)}
                    </span>
                    <span className='font-medium'>{t(category)}</span>
                  </span>
                </Button>
              ))}
            </div>
          </div>

          {/* Difficulty Filters */}
          <div className='space-y-4'>
            <div className='flex items-center gap-2'>
              <span className='text-sm font-semibold text-foreground uppercase tracking-wide'>
                {t('difficulty')}
              </span>
            </div>
            <div className='flex flex-wrap gap-3'>
              <Button
                variant={selectedDifficulty === 'all' ? 'default' : 'outline'}
                size='sm'
                onClick={() => onDifficultyChange('all')}
                className={`transition-all duration-[var(--duration-base)] ${
                  selectedDifficulty === 'all'
                    ? 'shadow-md scale-105'
                    : 'hover:scale-105'
                }`}
              >
                <span className='flex items-center gap-2'>
                  <span className='text-lg'>⭐</span>
                  <span className='font-medium'>{t('all')}</span>
                </span>
              </Button>
              {difficulties.map(difficulty => (
                <Button
                  key={difficulty}
                  variant={
                    selectedDifficulty === difficulty ? 'default' : 'outline'
                  }
                  size='sm'
                  onClick={() => onDifficultyChange(difficulty)}
                  className={`transition-all duration-[var(--duration-base)] ${
                    selectedDifficulty === difficulty
                      ? 'shadow-md scale-105'
                      : 'hover:scale-105'
                  }`}
                >
                  <span className='flex items-center gap-2'>
                    <span className='text-lg'>
                      {getDifficultyEmoji(difficulty)}
                    </span>
                    <span className='font-medium'>
                      {t(`tags.${difficulty}`)}
                    </span>
                  </span>
                </Button>
              ))}
            </div>
          </div>

          {/* Tag Filters */}
          <div className='space-y-4'>
            <div className='flex items-center gap-2'>
              <span className='text-sm font-semibold text-foreground uppercase tracking-wide'>
                {'tags'}
              </span>
            </div>
            <div className='flex flex-wrap gap-3'>
              <Button
                variant={selectedTag === 'all' ? 'default' : 'outline'}
                size='sm'
                onClick={() => onTagChange('all')}
                className={`transition-all duration-[var(--duration-base)] ${
                  selectedTag === 'all'
                    ? 'shadow-md scale-105'
                    : 'hover:scale-105'
                }`}
              >
                <span className='flex items-center gap-2'>
                  <span className='text-lg'>{'🏷️'}</span>
                  <span className='font-medium'>{t('all')}</span>
                </span>
              </Button>
              {tags.map(tag => {
                const tagEmoji = '🏷️';
                return (
                  <Button
                    key={tag}
                    variant={selectedTag === tag ? 'default' : 'outline'}
                    size='sm'
                    onClick={() => onTagChange(tag)}
                    className={`transition-all duration-[var(--duration-base)] ${
                      selectedTag === tag
                        ? 'shadow-md scale-105'
                        : 'hover:scale-105'
                    }`}
                  >
                    <span className='flex items-center gap-2'>
                      <span className='text-lg'>{tagEmoji}</span>
                      <span className='font-medium'>{t(`tags.${tag}`)}</span>
                    </span>
                  </Button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer Actions - Fixed at bottom */}
        <div className='flex items-center justify-end gap-3 p-6 border-t border-border bg-(--background-secondary)/30 mt-auto'>
          <Button
            variant='outline'
            onClick={onClearFilters}
            className='hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-colors duration-[var(--duration-base)]'
          >
            {t('clear')}
          </Button>
          <Button onClick={onClose} className='min-w-[100px]'>
            {t('apply')}
          </Button>
        </div>
      </div>
    </div>
  );
}
