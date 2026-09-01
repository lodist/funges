import {
  ChefHat,
  ExternalLink,
  MapPinned,
  RouteIcon,
  RouteOff,
  X,
} from '@/lib/icons';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton';
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
      surface='glass'
      padding='none'
      media
      className={`w-[min(21.5rem,calc(100vw-1.5rem))] sm:w-[24rem] max-h-[36vh] sm:max-h-[48vh] ${className}`}
    >
      <div className='p-2.5 sm:p-3 space-y-2.5 sm:space-y-3'>
        <div className='flex items-start justify-between gap-3'>
          <div>
            <div className='flex items-center gap-2 text-xs sm:text-sm font-semibold text-foreground'>
              <ChefHat className='size-3 sm:size-4 text-primary-text' />
              <span>{t('routePanel.title')}</span>
            </div>
            <p className='mt-1 text-xs text-muted-foreground'>
              {t('routePanel.subtitle')}
            </p>
          </div>
          <div className='flex gap-1.5 sm:gap-2'>
            {selectedRecipeId ? (
              <>
                <Button
                  type='button'
                  variant='outline'
                  onClick={onOpenInGoogleMaps}
                  aria-label={t('routePanel.openInMaps')}
                >
                  <ExternalLink />
                </Button>
                <Button
                  type='button'
                  variant='outline'
                  onClick={onClearRoute}
                  aria-label={t('routePanel.clearRoute')}
                >
                  <RouteOff />
                </Button>
              </>
            ) : null}
            <Button
              type='button'
              variant='outline'
              onClick={onClose}
              aria-label={t('common:common.close')}
            >
              <X />
            </Button>
          </div>
        </div>

        {error ? (
          <p className='text-xs text-destructive-text'>{error}</p>
        ) : null}

        {isLoading ? (
          <SkeletonGroup label={t('routePanel.loading')} className='space-y-2'>
            {[0, 1].map(placeholder => (
              <div
                key={placeholder}
                className='rounded-lg border border-border px-2.5 py-2 sm:px-3'
              >
                <div className='flex items-start justify-between gap-2'>
                  <div className='min-w-0 flex-1 space-y-1.5'>
                    <Skeleton className='h-4 w-4/5' />
                    <Skeleton className='h-3 w-1/2' />
                  </div>
                  <Skeleton className='h-5 w-9 shrink-0 rounded-full' />
                </div>
                <div className='mt-2 flex flex-wrap gap-1'>
                  <Skeleton className='h-5 w-16 rounded-full' />
                  <Skeleton className='h-5 w-12 rounded-full' />
                </div>
              </div>
            ))}
          </SkeletonGroup>
        ) : null}

        {!isLoading && !error && topPlans.length === 0 ? (
          <div className='rounded-lg border border-dashed border-border px-3 py-4 text-xs text-muted-foreground'>
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
                    ? 'border-secondary bg-secondary'
                    : 'border-border bg-muted'
                }`}
              >
                <div className='flex items-start justify-between gap-2'>
                  <div className='min-w-0'>
                    <p className='text-xs sm:text-sm font-medium text-foreground line-clamp-2'>
                      {plan.recipeTitle}
                    </p>
                    <p className='mt-1 text-xs text-muted-foreground'>
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
                      variant='warning'
                    >
                      {t('routePanel.missingSpecies', {
                        species: getSpeciesLabel(speciesId),
                      })}
                    </Badge>
                  ))}
                </div>

                {isSelected ? (
                  <div className='mt-3 rounded-lg border border-dashed border-status-warning-border bg-status-warning-background/60 px-3 py-2'>
                    <p className='type-micro text-status-warning-text'>
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
                            className='flex items-start gap-2 text-xs text-foreground'
                          >
                            <span className='inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-happy-500 px-1.5 font-semibold text-happy-900'>
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
                    className='flex-1'
                    disabled={plan.orderedStops.length === 0}
                    onClick={() => onDrawRoute(plan)}
                  >
                    <RouteIcon className='h-4 w-4' />
                    {isSelected
                      ? t('routePanel.refreshRoute')
                      : t('routePanel.drawRoute')}
                  </Button>
                  <Button type='button' variant='outline' asChild>
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
