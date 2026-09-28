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
  /** The plan whose route is drawn. Taken as-is rather than looked up in
   *  `plans`: a map move re-ranks the list and can drop it. */
  activePlan: RouteDishPlan | null;
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
  activePlan,
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

  const missingBadges = (plan: RouteDishPlan) =>
    plan.missingSpecies.map(speciesId => (
      <Badge key={`${plan.recipeId}-${speciesId}`} variant='warning'>
        {t('routePanel.missingSpecies', {
          species: getSpeciesLabel(speciesId),
        })}
      </Badge>
    ));

  return (
    <Card
      surface='glass'
      padding='none'
      media
      className={`relative w-full max-w-[24rem] max-h-[40vh] sm:max-h-[48vh] ${className}`}
    >
      <Button
        type='button'
        variant='ghost'
        size='icon'
        className='absolute right-1.5 top-1.5 sm:right-2 sm:top-2'
        onClick={onClose}
        aria-label={t('common:common.close')}
      >
        <X />
      </Button>

      {activePlan ? (
        // Route drawn: just this recipe, so the card leaves the map to the
        // route. The fit pads for this card's box, so every line here costs
        // route room on a short phone. Clear route returns to the list.
        <div className='p-2.5 sm:p-3'>
          <p className='pr-10 pt-1 text-sm font-medium text-foreground line-clamp-2'>
            {activePlan.recipeTitle}
          </p>
          {activeRouteSummary ? (
            <div className='mt-0.5 pr-10 text-xs'>
              <p className='text-primary-text'>
                {activeRouteSummary.status === 'pending'
                  ? t('routePanel.routingPending')
                  : activeRouteSummary.status === 'straight'
                    ? t('routePanel.routingUnavailable')
                    : t('routePanel.walkingSummary', {
                        distance: activeRouteSummary.distanceKm.toFixed(1),
                        duration: formatDuration(
                          activeRouteSummary.durationMinutes ?? 0
                        ),
                      })}
              </p>
              {activeRouteSummary.drive ? (
                <p className='text-muted-foreground'>
                  {t('routePanel.drivingSummary', {
                    distance: activeRouteSummary.drive.distanceKm.toFixed(1),
                    duration: formatDuration(
                      activeRouteSummary.drive.durationMinutes
                    ),
                  })}
                </p>
              ) : null}
            </div>
          ) : null}

          {/* The map markers carry only the number; this is their key. */}
          <ol className='mt-2 flex flex-wrap gap-x-3 gap-y-1'>
            {activePlan.orderedStops.map((stop, index) => (
              <li
                key={`${activePlan.recipeId}-${stop.id}`}
                className='flex items-center gap-1.5 text-xs text-foreground'
              >
                <span className='inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-happy-500 px-1.5 font-semibold text-happy-900'>
                  {index + 1}
                </span>
                {stop.coveredSpecies
                  .filter(speciesId =>
                    activePlan.requiredSpecies.includes(speciesId)
                  )
                  .map(getSpeciesLabel)
                  .join(', ')}
              </li>
            ))}
          </ol>
          {activePlan.missingSpecies.length > 0 ? (
            <div className='mt-1.5 flex flex-wrap gap-1'>
              {missingBadges(activePlan)}
            </div>
          ) : null}

          {/* Tight padding keeps both on one row down to ~350px; a wrapped
              second row is 50px the route doesn't get. */}
          <div className='mt-2 flex flex-wrap gap-1.5'>
            <Button
              type='button'
              className='has-[>svg]:px-2'
              onClick={onOpenInGoogleMaps}
            >
              <ExternalLink />
              {t('routePanel.openInMapsShort')}
            </Button>
            <Button
              type='button'
              variant='outline'
              className='has-[>svg]:px-2'
              onClick={onClearRoute}
            >
              <RouteOff />
              {t('routePanel.clearRoute')}
            </Button>
          </div>
        </div>
      ) : (
        <div className='p-2.5 sm:p-3 space-y-2.5'>
          <div className='pr-10'>
            <div className='flex items-center gap-2 text-sm font-semibold text-foreground'>
              <ChefHat className='size-4 text-primary-text' />
              <span>{t('routePanel.title')}</span>
            </div>
            <p className='mt-0.5 text-xs text-muted-foreground'>
              {t('routePanel.subtitle')}
            </p>
          </div>

          {error ? (
            <p className='text-xs text-destructive-text'>{error}</p>
          ) : null}

          {isLoading ? (
            <SkeletonGroup
              label={t('routePanel.loading')}
              className='space-y-2'
            >
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
            {topPlans.map(plan => (
              <div
                key={plan.recipeId}
                className='rounded-lg border border-border bg-muted px-2.5 py-2'
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
                  {missingBadges(plan)}
                </div>

                <div className='mt-2 flex flex-wrap gap-1.5'>
                  <Button
                    type='button'
                    disabled={plan.orderedStops.length === 0}
                    onClick={() => onDrawRoute(plan)}
                  >
                    <RouteIcon />
                    {t('routePanel.drawRoute')}
                  </Button>
                  <Button type='button' variant='ghost' asChild>
                    <a
                      href={`${recipesHref}?q=${encodeURIComponent(plan.recipeTitle)}`}
                    >
                      <BookOpen />
                      {t('view_recipe')}
                    </a>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
