/* eslint-disable i18next/no-literal-string */
import { ChefHat, LocateFixed, MapPinned, RouteIcon, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { RouteDishPlan } from '@/lib/route-to-dish';

interface RouteToDishPanelProps {
  plans: RouteDishPlan[];
  error: string | null;
  isLoading: boolean;
  hasUserLocation: boolean;
  minScore: number;
  radiusKm: number;
  selectedRecipeId: string | null;
  onDrawRoute: (plan: RouteDishPlan) => void;
  onClearRoute: () => void;
}

export default function RouteToDishPanel({
  plans,
  error,
  isLoading,
  hasUserLocation,
  minScore,
  radiusKm,
  selectedRecipeId,
  onDrawRoute,
  onClearRoute,
}: RouteToDishPanelProps) {
  const { t } = useTranslation('recipes');
  const topPlans = plans.slice(0, 5);
  const recipesHref = `${import.meta.env.BASE_URL}recipes`;
  const getSpeciesLabel = (speciesId: string) =>
    t(`species.${speciesId}`, { defaultValue: speciesId });

  return (
    <Card className='w-[24rem] max-w-[calc(100vw-2rem)] bg-white/95 backdrop-blur-sm border border-emerald-200 shadow-sm'>
      <div className='p-3 space-y-3'>
        <div className='flex items-start justify-between gap-3'>
          <div>
            <div className='flex items-center gap-2 text-sm font-semibold text-slate-900'>
              <ChefHat className='h-4 w-4 text-emerald-700' />
              <span>Nearby Recipes</span>
            </div>
            <p className='mt-1 text-xs text-slate-600'>
              Ranked by full ingredient coverage first, then shortest estimated
              route.
            </p>
          </div>
          {selectedRecipeId ? (
            <Button
              type='button'
              variant='outline'
              size='sm'
              className='h-8 px-2'
              onClick={onClearRoute}
            >
              <X className='h-3.5 w-3.5' />
            </Button>
          ) : null}
        </div>

        <div className='flex flex-wrap gap-2 text-xs'>
          <Badge variant='secondary'>min score {minScore.toFixed(1)}</Badge>
          <Badge variant='secondary'>{radiusKm} km radius</Badge>
          <Badge variant='secondary' className='flex items-center gap-1'>
            <LocateFixed className='h-3 w-3' />
            {hasUserLocation ? 'using your location' : 'using map center'}
          </Badge>
        </div>

        {error ? <p className='text-xs text-red-700'>{error}</p> : null}

        {isLoading ? (
          <p className='text-xs text-slate-500'>
            Checking nearby ingredient coverage...
          </p>
        ) : null}

        {!isLoading && !error && topPlans.length === 0 ? (
          <div className='rounded-lg border border-dashed border-slate-300 px-3 py-4 text-xs text-slate-600'>
            No route-ready recipes found in the loaded map data yet. Try moving
            the map or using your location.
          </div>
        ) : null}

        <div className='space-y-2'>
          {topPlans.map(plan => {
            const isSelected = selectedRecipeId === plan.recipeId;

            return (
              <div
                key={plan.recipeId}
                className={`rounded-lg border px-3 py-2 ${
                  isSelected
                    ? 'border-emerald-400 bg-emerald-50'
                    : 'border-slate-200 bg-slate-50'
                }`}
              >
                <div className='flex items-start justify-between gap-2'>
                  <div className='min-w-0'>
                    <p className='text-sm font-medium text-slate-900 line-clamp-2'>
                      {plan.recipeTitle}
                    </p>
                    <p className='mt-1 text-xs text-slate-600'>
                      {plan.orderedStops.length} stops,{' '}
                      {plan.estimatedDistanceKm.toFixed(1)} km estimated
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
                      missing {getSpeciesLabel(speciesId)}
                    </Badge>
                  ))}
                </div>

                <div className='mt-3 flex gap-2'>
                  <Button
                    type='button'
                    size='sm'
                    className='flex-1'
                    onClick={() => onDrawRoute(plan)}
                  >
                    <RouteIcon className='h-4 w-4' />
                    {isSelected ? 'Refresh route' : 'Draw route'}
                  </Button>
                  <Button type='button' size='sm' variant='outline' asChild>
                    <a href={recipesHref}>
                      <MapPinned className='h-4 w-4' />
                      Recipes
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
