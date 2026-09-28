import {
  BookOpen,
  ChefHat,
  ExternalLink,
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

/**
 * What the drawn route actually measures, once the walking router has answered.
 *
 * The per-plan figure stays a straight-line estimate — pricing every listed
 * plan against the router would mean one request per plan on every map move —
 * so only the plan the user drew gets a real distance and time.
 */
export interface RouteSummary {
  status: 'pending' | 'routed' | 'straight';
  distanceKm: number;
  durationMinutes: number | null;
  /**
   * The same stops by car, when the driving router answered. Independent of
   * `status`: the drive figure arrives on its own request and its own clock,
   * and a walking route that fell back to straight lines can still have one.
   */
  drive?: { distanceKm: number; durationMinutes: number } | null;
}

interface RouteToDishPanelProps {
  plans: RouteDishPlan[];
  error: string | null;
  isLoading: boolean;
  selectedRecipeId: string | null;
  activeRouteSummary?: RouteSummary | null;
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
  activeRouteSummary = null,
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

  const formatDuration = (minutes: number) =>
    minutes < 60
      ? t('routePanel.durationMinutes', { minutes })
      : t('routePanel.durationHours', {
          hours: Math.floor(minutes / 60),
          minutes: minutes % 60,
        });

  return (
    <Card
      surface='glass'
      padding='none'
      media
      className={`w-full max-w-[24rem] max-h-[40vh] sm:max-h-[48vh] ${className}`}
    >
      <div className='p-2.5 sm:p-3 space-y-2.5'>
        <div className='flex items-start justify-between gap-2'>
          <div className='min-w-0'>
            <div className='flex items-center gap-2 text-sm font-semibold text-foreground'>
              <ChefHat className='size-4 text-primary-text' />
              <span>{t('routePanel.title')}</span>
            </div>
            <p className='mt-0.5 text-xs text-muted-foreground'>
              {t('routePanel.subtitle')}
            </p>
          </div>
          <Button
            type='button'
            variant='ghost'
            size='icon'
            className='-mr-1 -mt-1 shrink-0'
            onClick={onClose}
            aria-label={t('common:common.close')}
          >
            <X />
          </Button>
        </div>

        {error ? (
          <p className='text-xs text-destructive-text'>{error}</p>
        ) : null}

        {isLoading ? (
          <SkeletonGroup label={t('routePanel.loading')} className='space-y-2'>
            {[0, 1].map(placeholder => (
              <div
                key={placeholder}
                className='rounded-lg border border-border px-2.5 py-2 space-y-1.5'
              >
                <Skeleton className='h-4 w-4/5' />
                <Skeleton className='h-3 w-1/2' />
                <div className='flex gap-1'>
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

        <div className='space-y-2 overflow-y-auto overflow-x-hidden max-h-[calc(40vh-5rem)] sm:max-h-[calc(48vh-5.5rem)]'>
          {topPlans.map(plan => {
            const isSelected = selectedRecipeId === plan.recipeId;
            const recipeHref = `${recipesHref}?q=${encodeURIComponent(plan.recipeTitle)}`;

            return (
              <div
                key={plan.recipeId}
                className={`rounded-lg border px-2.5 py-2 ${
                  isSelected
                    ? 'border-secondary bg-secondary'
                    : 'border-border bg-muted'
                }`}
              >
                <p className='text-sm font-medium text-foreground line-clamp-2'>
                  {plan.recipeTitle}
                </p>
                <p
                  className={`mt-0.5 text-xs ${plan.fullyCovered ? 'text-primary-text' : 'text-status-warning-text'}`}
                >
                  {plan.fullyCovered
                    ? t('routePanel.coverageFull', {
                        count: plan.requiredSpecies.length,
                      })
                    : t('routePanel.coveragePartial', {
                        covered: plan.coveredSpecies.length,
                        count: plan.requiredSpecies.length,
                      })}
                  {plan.orderedStops.length > 0
                    ? ` · ${t('routePanel.stopsEstimated', {
                        count: plan.orderedStops.length,
                        distance: plan.estimatedDistanceKm.toFixed(1),
                      })}`
                    : null}
                </p>

                <div className='mt-1.5 flex flex-wrap gap-1'>
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
                  <div className='mt-2 space-y-1.5'>
                    {activeRouteSummary ? (
                      <div className='text-xs'>
                        <p className='text-primary-text'>
                          {activeRouteSummary.status === 'pending'
                            ? t('routePanel.routingPending')
                            : activeRouteSummary.status === 'straight'
                              ? t('routePanel.routingUnavailable')
                              : t('routePanel.walkingSummary', {
                                  distance:
                                    activeRouteSummary.distanceKm.toFixed(1),
                                  duration: formatDuration(
                                    activeRouteSummary.durationMinutes ?? 0
                                  ),
                                })}
                        </p>
                        {activeRouteSummary.drive ? (
                          <p className='text-muted-foreground'>
                            {t('routePanel.drivingSummary', {
                              distance:
                                activeRouteSummary.drive.distanceKm.toFixed(1),
                              duration: formatDuration(
                                activeRouteSummary.drive.durationMinutes
                              ),
                            })}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                    <ol className='space-y-1'>
                      {plan.orderedStops.map((stop, index) => (
                        <li
                          key={`${plan.recipeId}-${stop.id}`}
                          className='flex items-start gap-2 text-xs text-foreground'
                        >
                          <span className='inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-happy-500 px-1.5 font-semibold text-happy-900'>
                            {index + 1}
                          </span>
                          <span className='pt-0.5'>
                            {stop.coveredSpecies
                              .filter(speciesId =>
                                plan.requiredSpecies.includes(speciesId)
                              )
                              .map(getSpeciesLabel)
                              .join(', ')}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : null}

                {/* One primary action per state: draw the route, or — once
                    drawn — take it to Maps. The per-row link goes to this
                    recipe, not the whole recipes page. */}
                <div className='mt-2 flex flex-wrap gap-1.5'>
                  {isSelected ? (
                    <>
                      <Button type='button' onClick={onOpenInGoogleMaps}>
                        <ExternalLink />
                        {t('routePanel.openInMapsShort')}
                      </Button>
                      <Button
                        type='button'
                        variant='outline'
                        onClick={onClearRoute}
                      >
                        <RouteOff />
                        {t('routePanel.clearRoute')}
                      </Button>
                    </>
                  ) : (
                    <Button
                      type='button'
                      disabled={plan.orderedStops.length === 0}
                      onClick={() => onDrawRoute(plan)}
                    >
                      <RouteIcon />
                      {t('routePanel.drawRoute')}
                    </Button>
                  )}
                  <Button type='button' variant='ghost' asChild>
                    <a href={recipeHref}>
                      <BookOpen />
                      {t('view_recipe')}
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
