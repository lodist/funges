import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import type { Recipe } from '@/data/recipes';
import { Clock, Users, AlertTriangle, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface RecipeModalProps {
  recipe: Recipe | null;
  isOpen: boolean;
  onClose: () => void;
}

export const RecipeModal = ({ recipe, isOpen, onClose }: RecipeModalProps) => {
  const { t } = useTranslation('recipes');

  if (!recipe) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      {/* Trailhead (#213): flat detail layout, no nested Card containers —
          sections are separated by a plain divider instead of stacking a
          bordered/shadowed box inside the dialog's own bordered/shadowed
          box. Standard DialogContent close button (bare X, hover-only fill). */}
      <DialogContent className='flex max-h-[85vh] w-full max-w-lg flex-col'>
        <header className='shrink-0 space-y-3 pr-6'>
          {recipe.image && (
            <img
              src={recipe.image}
              alt=''
              className='h-32 w-full rounded-xl object-cover'
              loading='lazy'
            />
          )}
          <DialogTitle className='text-xl font-bold leading-tight text-foreground'>
            {recipe.title}
          </DialogTitle>
          <DialogDescription className='flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground'>
            <span className='capitalize'>{recipe.difficulty}</span>
            <span className='flex items-center gap-1.5'>
              <Clock className='h-4 w-4' />
              {recipe.prepTime}
            </span>
            <span className='flex items-center gap-1.5'>
              <Users className='h-4 w-4' />
              {recipe.servings}
            </span>
          </DialogDescription>
        </header>

        <Separator className='mt-6 shrink-0' />

        {/* Only the content below the first divider scrolls — the header
            stays put. */}
        <div className='min-h-0 flex-1 space-y-6 overflow-y-auto pr-1 pt-6'>
          <section>
            <h3 className='mb-3 text-sm font-semibold text-foreground'>
              {t('ingredients')}
            </h3>
            <ul className='list-disc space-y-1.5 pl-5 marker:text-foreground'>
              {recipe.ingredients.map(ing => (
                <li key={ing} className='text-sm text-foreground'>
                  {ing}
                </li>
              ))}
            </ul>
          </section>

          <Separator />

          <section>
            <h3 className='mb-3 text-sm font-semibold text-foreground'>
              {t('instructions')}
            </h3>
            <ol className='divide-y divide-border'>
              {recipe.steps.map(step => (
                <li
                  key={step.step}
                  className='space-y-2 py-3 first:pt-0 last:pb-0'
                >
                  <p className='text-sm leading-relaxed text-foreground'>
                    {step.instruction}
                  </p>
                  {step.tip && (
                    <p className='flex items-start gap-1.5 text-xs text-status-info'>
                      <Info className='mt-0.5 h-3.5 w-3.5 flex-shrink-0' />
                      {step.tip}
                    </p>
                  )}
                  {step.warning && (
                    <p className='flex items-start gap-1.5 text-xs text-status-warning-text'>
                      <AlertTriangle className='mt-0.5 h-3.5 w-3.5 flex-shrink-0' />
                      {step.warning}
                    </p>
                  )}
                  {step.duration && (
                    <p className='flex items-center gap-1.5 text-xs text-muted-foreground'>
                      <Clock className='h-3.5 w-3.5' />
                      {step.duration}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </section>

          {recipe.warnings.length > 0 && (
            <>
              <Separator />
              <section>
                <h3 className='mb-3 text-sm font-semibold text-foreground'>
                  {t('warnings')}
                </h3>
                <ul className='space-y-2'>
                  {recipe.warnings.map(warning => (
                    <li
                      key={warning}
                      className='flex items-start gap-2 text-sm text-status-warning-text'
                    >
                      <AlertTriangle className='mt-0.5 h-4 w-4 flex-shrink-0' />
                      {warning}
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default RecipeModal;
