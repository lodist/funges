import { Dialog, DialogContent, DialogClose } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { Recipe } from '@/data/recipes';
import {
  Clock,
  Users,
  AlertTriangle,
  Info,
  CheckCircle2,
  UtensilsCrossed,
  XIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface RecipeModalDesktopProps {
  recipe: Recipe | null;
  isOpen: boolean;
  onClose: () => void;
}

const difficultyColor = (difficulty: string) => {
  switch (difficulty.toLowerCase()) {
    case 'easy':
      return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30';
    case 'medium':
      return 'bg-amber-500/10 text-amber-600 border-amber-500/30';
    case 'hard':
      return 'bg-rose-500/10 text-rose-600 border-rose-500/30';
    default:
      return 'bg-background-secondary text-text-primary border-border';
  }
};

export const RecipeModalDesktop = ({
  recipe,
  isOpen,
  onClose,
}: RecipeModalDesktopProps) => {
  const { t } = useTranslation(['recipes', 'common']);

  if (!recipe) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        showCloseButton={false}
        className='max-w-[98vw] w-full max-h-[98vh] flex flex-col bg-gradient-to-br from-background to-background/95 backdrop-blur-sm pt-12'
        style={{
          width: 'min(98vw, 1400px)',
          maxWidth: 'min(98vw, 1400px)',
          minWidth: 'min(98vw, 1400px)',
        }}
      >
        {/* Close Button */}
        <div className='absolute right-3 top-3 z-10'>
          <DialogClose asChild>
            <Button
              variant='ghost'
              size='icon'
              className='h-8 w-8 rounded-md text-text-secondary transition-all duration-200 hover:bg-background-secondary/50 hover:text-text-primary'
            >
              <XIcon className='h-4 w-4' />
              <span className='sr-only'>{t('close', { ns: 'common' })}</span>
            </Button>
          </DialogClose>
        </div>

        <div className='flex-1 overflow-y-auto space-y-8'>
          <header className='hidden lg:grid grid-cols-5 gap-8 items-start'>
            {/* Photo and Title Section - 2/5 of the width */}
            <div className='col-span-3 space-y-4'>
              <div className='flex items-center gap-6'>
                {/* Recipe Image */}
                {recipe.image && (
                  <div className='flex-shrink-0'>
                    <div className='relative w-40 h-40 bg-gradient-to-br from-green-50 to-green-100 overflow-hidden rounded-xl'>
                      <img
                        src={recipe.image}
                        alt={recipe.title}
                        className='w-full h-full object-cover object-center'
                        loading='lazy'
                      />
                      <div className='absolute inset-0 bg-black/10' />
                    </div>
                  </div>
                )}

                {/* Title, Info and Warnings */}
                <div className='flex-1 min-w-0 space-y-4'>
                  <h1 className='text-3xl font-bold leading-tight text-text-primary'>
                    {recipe.title}
                  </h1>
                  <div className='flex flex-wrap items-center gap-4'>
                    <Badge
                      className={`${difficultyColor(recipe.difficulty)} border px-3 py-1.5 text-xs font-medium`}
                    >
                      <span className='flex items-center gap-1.5'>
                        {recipe.difficulty.toLowerCase() === 'easy' && (
                          <span className='text-sm text-emerald-500'>
                            {'●'}
                          </span>
                        )}
                        {recipe.difficulty.toLowerCase() === 'medium' && (
                          <span className='text-sm text-amber-500'>{'●●'}</span>
                        )}
                        {recipe.difficulty.toLowerCase() === 'hard' && (
                          <span className='text-sm text-rose-500'>{'●●●'}</span>
                        )}
                        <span className='capitalize'>{recipe.difficulty}</span>
                      </span>
                    </Badge>
                    <div className='flex items-center gap-1.5 text-text-secondary'>
                      <Clock className='h-4 w-4 text-primary' />
                      <span className='text-sm font-medium'>
                        {recipe.prepTime}
                      </span>
                    </div>
                    <div className='flex items-center gap-1.5 text-text-secondary'>
                      <Users className='h-4 w-4 text-primary' />
                      <span className='text-sm font-medium'>
                        {recipe.servings}
                      </span>
                    </div>
                  </div>

                  {recipe.warnings.length > 0 && (
                    <section className='flex flex-wrap gap-2'>
                      {recipe.warnings.map(warning => (
                        <div
                          key={warning}
                          className='flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/10 p-2'
                        >
                          <AlertTriangle className='mt-0.5 h-3 w-3 flex-shrink-0 text-amber-600' />
                          <span className='text-xs font-medium leading-relaxed text-amber-700'>
                            {warning}
                          </span>
                        </div>
                      ))}
                    </section>
                  )}
                </div>
              </div>
            </div>

            {/* Ingredients Section - 2/5 of the width */}
            <div className='col-span-2'>
              <Card className='bg-gradient-to-br from-background to-background-secondary/20 border-border/30 shadow-none'>
                <CardContent className='p-3'>
                  <div className='mb-2'>
                    <h3 className='text-sm font-bold text-text-primary'>
                      {t('ingredients')}
                    </h3>
                  </div>
                  <div className='grid grid-cols-2 gap-1.5'>
                    {recipe.ingredients.map(ing => (
                      <div
                        key={ing}
                        className='flex items-center gap-2 rounded-md border border-border/20 bg-background-secondary/30 px-2 py-1.5 transition-all duration-200 hover:border-border/40 hover:bg-background-secondary/50'
                      >
                        <CheckCircle2 className='h-3 w-3 flex-shrink-0 text-emerald-500' />
                        <span className='text-xs font-medium text-text-primary truncate'>
                          {ing}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </header>

          <header className='lg:hidden space-y-6'>
            <div className='space-y-3'>
              <div className='flex items-start gap-6'>
                {/* Recipe Image for Mobile */}
                {recipe.image && (
                  <div className='flex-shrink-0'>
                    <div className='relative w-32 h-32 bg-gradient-to-br from-green-50 to-green-100 overflow-hidden rounded-xl'>
                      <img
                        src={recipe.image}
                        alt={recipe.title}
                        className='w-full h-full object-cover object-center'
                        loading='lazy'
                      />
                      <div className='absolute inset-0 bg-black/10' />
                    </div>
                  </div>
                )}

                {/* Title, Info and Warnings for Mobile */}
                <div className='flex-1 min-w-0 space-y-4'>
                  <h1 className='text-2xl font-bold leading-tight text-text-primary'>
                    {recipe.title}
                  </h1>
                  <div className='flex flex-wrap items-center gap-4'>
                    <Badge
                      className={`${difficultyColor(recipe.difficulty)} border px-3 py-1.5 text-xs font-medium`}
                    >
                      <span className='flex items-center gap-1.5'>
                        {recipe.difficulty.toLowerCase() === 'easy' && (
                          <span className='text-sm text-emerald-500'>
                            {'●'}
                          </span>
                        )}
                        {recipe.difficulty.toLowerCase() === 'medium' && (
                          <span className='text-sm text-amber-500'>{'●●'}</span>
                        )}
                        {recipe.difficulty.toLowerCase() === 'hard' && (
                          <span className='text-sm text-rose-500'>{'●●●'}</span>
                        )}
                        <span className='capitalize'>{recipe.difficulty}</span>
                      </span>
                    </Badge>
                    <div className='flex items-center gap-1.5 text-text-secondary'>
                      <Clock className='h-4 w-4 text-primary' />
                      <span className='text-sm font-medium'>
                        {recipe.prepTime}
                      </span>
                    </div>
                    <div className='flex items-center gap-1.5 text-text-secondary'>
                      <Users className='h-4 w-4 text-primary' />
                      <span className='text-sm font-medium'>
                        {recipe.servings}
                      </span>
                    </div>
                  </div>

                  {recipe.warnings.length > 0 && (
                    <section className='flex flex-wrap gap-2'>
                      {recipe.warnings.map(warning => (
                        <div
                          key={warning}
                          className='flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/10 p-2'
                        >
                          <AlertTriangle className='mt-0.5 h-3 w-3 flex-shrink-0 text-amber-600' />
                          <span className='text-xs font-medium leading-relaxed text-amber-700'>
                            {warning}
                          </span>
                        </div>
                      ))}
                    </section>
                  )}
                </div>
              </div>
            </div>

            <div className='w-full'>
              <Card className='bg-gradient-to-br from-background to-background-secondary/20 border-border/30 shadow-none'>
                <CardContent className='p-4'>
                  <div className='mb-3 flex items-center gap-3'>
                    <div className='rounded-lg border border-emerald-500/30 bg-gradient-to-br from-emerald-500/20 to-emerald-500/10 p-2'>
                      <UtensilsCrossed className='h-4 w-4 text-emerald-600' />
                    </div>
                    <h3 className='text-base font-bold text-text-primary'>
                      {t('ingredients')}
                    </h3>
                  </div>
                  <div className='grid grid-cols-2 gap-2'>
                    {recipe.ingredients.map(ing => (
                      <div
                        key={ing}
                        className='flex items-center gap-2 rounded-md border border-border/20 bg-background-secondary/30 px-3 py-2 transition-all duration-200 hover:border-border/40 hover:bg-background-secondary/50'
                      >
                        <CheckCircle2 className='h-3 w-3 flex-shrink-0 text-emerald-500' />
                        <span className='text-sm font-medium text-text-primary truncate'>
                          {ing}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </header>

          <section className='grid grid-cols-1 gap-8 lg:grid-cols-2'>
            <div className='lg:col-span-2 space-y-6'>
              <Card className='bg-gradient-to-br from-background to-background-secondary/20 border-border/30 shadow-none'>
                <CardContent className='p-8'>
                  <ol className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4'>
                    {recipe.steps.map((step, index) => (
                      <li
                        key={step.step}
                        className='relative rounded-xl border-2 border-border/60 bg-background-secondary/20 p-4 transition-all duration-200 hover:border-border/80'
                      >
                        <div className='absolute -top-2 -left-2 flex h-10 w-10 items-center justify-center rounded-full border-4 border-background bg-gradient-to-br from-blue-500 to-blue-600 text-base font-bold text-white'>
                          {index + 1}
                        </div>
                        <div className='space-y-3 pt-2'>
                          <p className='text-base font-medium leading-relaxed text-text-primary'>
                            {step.instruction}
                          </p>
                          <div className='space-y-2'>
                            {step.tip && (
                              <div className='flex items-start gap-2 rounded-lg border border-blue-500/20 bg-blue-500/5 p-3'>
                                <Info className='mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600' />
                                <div>
                                  <p className='mb-1 text-xs font-semibold text-blue-700'>
                                    {t('tip')}
                                  </p>
                                  <p className='text-sm leading-relaxed text-blue-600'>
                                    {step.tip}
                                  </p>
                                </div>
                              </div>
                            )}
                            {step.warning && (
                              <div className='flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3'>
                                <AlertTriangle className='mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600' />
                                <div>
                                  <p className='mb-1 text-xs font-semibold text-amber-700'>
                                    {t('warning')}
                                  </p>
                                  <p className='text-sm leading-relaxed text-amber-600'>
                                    {step.warning}
                                  </p>
                                </div>
                              </div>
                            )}
                            {step.duration && (
                              <div className='flex items-center gap-2 rounded-lg border border-border/20 bg-background-secondary/30 p-2'>
                                <Clock className='h-4 w-4 text-text-secondary' />
                                <span className='text-sm font-medium text-text-secondary'>
                                  {t('duration')}: {step.duration}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default RecipeModalDesktop;
