import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { Recipe } from '@/data/recipes';
import {
  Clock,
  Users,
  ChefHat,
  AlertTriangle,
  Info,
  CheckCircle2,
  Timer,
  UtensilsCrossed,
  XIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface RecipeModalProps {
  recipe: Recipe | null;
  isOpen: boolean;
  onClose: () => void;
}

const difficultyColor = (difficulty: string) => {
  switch (difficulty.toLowerCase()) {
    case 'easy':
      return 'bg-green-500/10 text-green-500 border-green-500/30';
    case 'medium':
      return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30';
    case 'hard':
      return 'bg-red-500/10 text-red-500 border-red-500/30';
    default:
      return 'bg-(--background-secondary) text-foreground border-border';
  }
};

export const RecipeModal = ({ recipe, isOpen, onClose }: RecipeModalProps) => {
  const { t } = useTranslation(['recipes', 'common']);

  if (!recipe) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        showCloseButton={false}
        className='max-w-4xl max-h-[90vh] flex flex-col'
      >
        <DialogHeader className='pb-6 border-b border-border/50 flex-shrink-0'>
          <div className='flex items-start justify-between'>
            <div className='flex-1'>
              <div className='flex items-center gap-3 mb-3'>
                <div className='p-2 rounded-lg bg-primary/10'>
                  <ChefHat className='h-6 w-6 text-primary' />
                </div>
                <DialogTitle className='text-2xl font-bold text-foreground'>
                  {recipe.title}
                </DialogTitle>
              </div>
              <DialogDescription className='flex flex-wrap items-center gap-4 mt-4'>
                <Badge
                  className={difficultyColor(recipe.difficulty) + ' border'}
                >
                  <span className='flex items-center gap-1'>
                    {recipe.difficulty.toLowerCase() === 'easy' && (
                      <span className='text-green-500'>{'●'}</span>
                    )}
                    {recipe.difficulty.toLowerCase() === 'medium' && (
                      <span className='text-yellow-500'>{'●●'}</span>
                    )}
                    {recipe.difficulty.toLowerCase() === 'hard' && (
                      <span className='text-red-500'>{'●●●'}</span>
                    )}
                  </span>
                </Badge>
                <div className='flex items-center gap-2 text-sm text-muted-foreground'>
                  <Clock className='h-4 w-4' />
                  <span>{recipe.prepTime}</span>
                </div>
                <div className='flex items-center gap-2 text-sm text-muted-foreground'>
                  <Users className='h-4 w-4' />
                  <span>{recipe.servings}</span>
                </div>
              </DialogDescription>
            </div>
            <DialogClose asChild>
              <Button
                variant='ghost'
                size='icon'
                className='text-muted-foreground hover:text-foreground'
              >
                <XIcon className='h-4 w-4' />
                <span className='sr-only'>{t('close', { ns: 'common' })}</span>
              </Button>
            </DialogClose>
          </div>
        </DialogHeader>

        <div className='flex-1 overflow-y-auto pr-2 space-y-6 py-6 min-h-0'>
          {/* Ingredients Section */}
          <Card className='border-border/50 shadow-sm'>
            <CardContent className='p-6'>
              <div className='flex items-center gap-3 mb-4'>
                <div className='p-2 rounded-lg bg-primary/10'>
                  <UtensilsCrossed className='h-5 w-5 text-primary' />
                </div>
                <h3 className='text-lg font-semibold text-foreground'>
                  {t('ingredients')}
                </h3>
              </div>
              <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
                {recipe.ingredients.map(ing => (
                  <div
                    key={ing}
                    className='flex items-center gap-3 p-3 rounded-lg bg-(--background-secondary)/50 border border-border/30 hover:bg-(--background-secondary) transition-colors'
                  >
                    <CheckCircle2 className='h-4 w-4 text-success flex-shrink-0' />
                    <span className='text-sm text-foreground'>{ing}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Instructions Section */}
          <Card className='border-border/50 shadow-sm'>
            <CardContent className='p-6'>
              <div className='flex items-center gap-3 mb-4'>
                <div className='p-2 rounded-lg bg-primary/10'>
                  <Timer className='h-5 w-5 text-primary' />
                </div>
                <h3 className='text-lg font-semibold text-foreground'>
                  {t('instructions')}
                </h3>
              </div>
              <div className='space-y-4'>
                {recipe.steps.map((step, index) => (
                  <div
                    key={step.step}
                    className='relative p-4 rounded-lg bg-(--background-secondary)/30 border border-border/20'
                  >
                    <div className='flex items-start gap-4'>
                      <div className='flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-semibold'>
                        {index + 1}
                      </div>
                      <div className='flex-1 space-y-2'>
                        <p className='text-sm text-foreground leading-relaxed'>
                          {step.instruction}
                        </p>
                        {step.tip && (
                          <div className='flex items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20'>
                            <Info className='h-4 w-4 text-primary flex-shrink-0 mt-0.5' />
                            <p className='text-xs text-primary font-medium'>
                              {step.tip}
                            </p>
                          </div>
                        )}
                        {step.warning && (
                          <div className='flex items-start gap-2 p-3 rounded-lg bg-warning/5 border border-warning/20'>
                            <AlertTriangle className='h-4 w-4 text-warning flex-shrink-0 mt-0.5' />
                            <p className='text-xs text-warning font-medium'>
                              {step.warning}
                            </p>
                          </div>
                        )}
                        {step.duration && (
                          <div className='flex items-center gap-2 text-xs text-muted-foreground'>
                            <Clock className='h-3 w-3' />
                            <span>{step.duration}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Warnings Section */}
          {recipe.warnings.length > 0 && (
            <Card className='border-border/50 shadow-sm'>
              <CardContent className='p-6'>
                <div className='flex items-center gap-3 mb-4'>
                  <div className='p-2 rounded-lg bg-warning/10'>
                    <AlertTriangle className='h-5 w-5 text-warning' />
                  </div>
                  <h3 className='text-lg font-semibold text-foreground'>
                    {t('warnings')}
                  </h3>
                </div>
                <div className='space-y-2'>
                  {recipe.warnings.map(warning => (
                    <div
                      key={warning}
                      className='flex items-start gap-3 p-3 rounded-lg bg-warning/5 border border-warning/20'
                    >
                      <AlertTriangle className='h-4 w-4 text-warning flex-shrink-0 mt-0.5' />
                      <span className='text-sm text-warning font-medium'>
                        {warning}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default RecipeModal;
