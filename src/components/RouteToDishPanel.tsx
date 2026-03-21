import {
  ChefHat,
  ExternalLink,
  LocateFixed,
  MapPinned,
  RouteIcon,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { RouteDishPlan } from '@/lib/route-to-dish';

interface RouteToDishPanelProps {
  plans: RouteDishPlan[];
  error: string | null;
  isLoading: boolean;
  selectedRecipeId: string | null;
  className?: string;
  onDrawRoute: (plan: RouteDishPlan) => void;
  onClearRoute: () => void;
  onClose: () => void;
  onOpenInGoogleMaps: () => void;
}

export default function RouteToDishPanel({
  plans,
  error,
  isLoading,
  selectedRecipeId,
  className = '',
  onDrawRoute,
  onClearRoute,
  onClose,
  onOpenInGoogleMaps,
}: RouteToDishPanelProps) {
  const { t } = useTranslation('recipes');
  const topPlans = plans.slice(0, 5);
  const recipesHref = `${import.meta.env.BASE_URL}recipes`;
  const getSpeciesLabel = (speciesId: string) =>
    t(`species.${speciesId}`, { defaultValue: speciesId });

  return (
    <Card
      className={`w-[min(21.5rem,calc(100vw-1.5rem))] sm:w-[24rem] max-h-[36vh] sm:max-h-[48vh] overflow-hidden bg-white/95 backdrop-blur-sm border border-emerald-200 shadow-sm ${className}`}
    >
      <div className='p-2.5 sm:p-3 space-y-2.5 sm:space-y-3'>
        <div className='flex items-start justify-between gap-3'>
          <div>
            <div className='flex items-center gap-2 text-[13px] sm:text-sm font-semibold text-slate-900'>
              <ChefHat className='h-3.5 w-3.5 sm:h-4 sm:w-4 text-emerald-700' />
              <span>{t('routePanel.title')}</span>
            </div>
            <p className='mt-1 text-xs text-slate-600'>
              {t('routePanel.subtitle')}
            </p>
          </div>
          <div className='flex gap-1.5 sm:gap-2'>
            {selectedRecipeId ? (
              <>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  className='h-7 sm:h-8 px-2'
                  onClick={onOpenInGoogleMaps}
                >
                  <ExternalLink className='h-3.5 w-3.5' />
                </Button>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  className='h-7 sm:h-8 px-2'
                  onClick={onClearRoute}
                >
                  <LocateFixed className='h-3.5 w-3.5' />
                </Button>
              </>
            ) : null}
            <Button
              type='button'
              variant='outline'
              size='sm'
              className='h-7 sm:h-8 px-2'
              onClick={onClose}
            >
              <X className='h-3.5 w-3.5' />
            </Button>
          </div>
        </div>

        {error ? <p className='text-xs text-red-700'>{error}</p> : null}

        {isLoading ? (
          <p className='text-xs text-slate-500'>{t('routePanel.loading')}</p>
        ) : null}

        {!isLoading && !error && topPlans.length === 0 ? (
          <div className='rounded-lg border border-dashed border-slate-300 px-3 py-4 text-xs text-slate-600'>
            {t('routePanel.empty')}
          </div>
        ) : null}

        <div className='space-y-2 overflow-y-auto pr-1 max-h-[calc(36vh-5.25rem)] sm:max-h-[calc(48vh-6rem)]'>
          {topPlans.map(plan => {
            const isSelected = selectedRecipeId === plan.recipeId;

            return (
              <div
                key={plan.recipeId}
                className={`rounded-lg border px-2.5 py-2 sm:px-3 ${
                  isSelected
                    ? 'border-emerald-400 bg-emerald-50'
                    : 'border-slate-200 bg-slate-50'
                }`}
              >
                <div className='flex items-start justify-between gap-2'>
                  <div className='min-w-0'>
                    <p className='text-[13px] sm:text-sm font-medium text-slate-900 line-clamp-2'>
                      {plan.recipeTitle}
                    </p>
                    <p className='mt-1 text-xs text-slate-600'>
                      {t('routePanel.stopsEstimated', {
                        count: plan.orderedStops.length,
                        distance: plan.estimatedDistanceKm.toFixed(1),
                      })}
                    </p>
                  </div>
                  <Badge
                    variant={plan.fullyCovered ? 'default' : 'outline'}
                    className='shrink-0'
                  >
                    {plan.coveredSpecies.length}/{plan.requiredSpecies.length}
                  </Badge>
                </div>

                <div className='mt-2 flex flex-wrap gap-1'>
                  {plan.coveredSpecies.map(speciesId => (
                    <Badge
                      key={`${plan.recipeId}-${speciesId}`}
                      variant='secondary'
                    >
                      {getSpeciesLabel(speciesId)}
                    </Badge>
                  ))}
                  {plan.missingSpecies.map(speciesId => (
                    <Badge
                      key={`${plan.recipeId}-${speciesId}`}
                      variant='outline'
                      className='border-amber-300 text-amber-800'
                    >
                      {t('routePanel.missingSpecies', {
                        species: getSpeciesLabel(speciesId),
                      })}
                    </Badge>
                  ))}
                </div>

                {isSelected ? (
                  <div className='mt-3 rounded-lg border border-dashed border-amber-200 bg-amber-50/60 px-3 py-2'>
                    <p className='text-[10px] sm:text-[11px] font-medium uppercase tracking-wide text-amber-900'>
                      {t('routePanel.routeStops')}
                    </p>
                    <div className='mt-2 space-y-1.5'>
                      {plan.orderedStops.map((stop, index) => {
                        const stopSpecies = stop.coveredSpecies.filter(
                          speciesId => plan.requiredSpecies.includes(speciesId)
                        );

                        return (
                          <div
                            key={`${plan.recipeId}-${stop.id}`}
                            className='flex items-start gap-2 text-xs text-slate-700'
                          >
                            <span className='inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#b38a3c] px-1.5 font-semibold text-[#fff9eb]'>
                              {index + 1}
                            </span>
                            <span className='pt-0.5'>
                              {stopSpecies.map(getSpeciesLabel).join(', ')}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                <div className='mt-3 flex gap-2'>
                  <Button
                    type='button'
                    size='sm'
                    className='flex-1 h-8 sm:h-9 text-xs sm:text-sm'
                    onClick={() => onDrawRoute(plan)}
                  >
                    <RouteIcon className='h-4 w-4' />
                    {isSelected
                      ? t('routePanel.refreshRoute')
                      : t('routePanel.drawRoute')}
                  </Button>
                  <Button
                    type='button'
                    size='sm'
                    variant='outline'
                    className='h-8 sm:h-9 text-xs sm:text-sm'
                    asChild
                  >
                    <a href={recipesHref}>
                      <MapPinned className='h-4 w-4' />
                      {t('routePanel.recipesButton')}
                    </a>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
