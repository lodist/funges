import { useEffect, useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import SEO from '@/components/SEO';
import { useSpeciesData } from '@/data/species';
import { useRecipesData } from '@/data/recipes';
import {
  fetchWorthForagingNowRecommendations,
  type ForagingFocus,
  type RecommendationContext,
  type WorthForagingNowRecommendation,
} from '@/lib/worth-foraging-now';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Loader2,
  ChefHat,
  Leaf,
  MapPinned,
  ArrowUpRight,
  Calendar,
} from '@/lib/icons';
import { useMapStore } from '@/store/mapStore';

export default function WorthForagingNowPage() {
  const { t, i18n } = useTranslation(['common', 'species']);
  const species = useSpeciesData();
  const recipes = useRecipesData();
  const { center, userLocation } = useMapStore();
  const [focus, setFocus] = useState<ForagingFocus>('mixed');
  const [recommendations, setRecommendations] = useState<
    WorthForagingNowRecommendation[]
  >([]);
  const [context, setContext] = useState<RecommendationContext | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadRecommendations = async () => {
      setIsLoading(true);
      setLoadError(null);

      try {
        const result = await fetchWorthForagingNowRecommendations({
          species,
          recipes,
          focus,
          mapCenter: center,
          userLocation,
        });

        if (cancelled) return;
        setRecommendations(result.recommendations);
        setContext(result.context);
      } catch (caughtError) {
        if (cancelled) return;
        setLoadError(
          caughtError instanceof Error
            ? caughtError.message
            : t('errors.general')
        );
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadRecommendations();

    return () => {
      cancelled = true;
    };
  }, [center, focus, i18n.language, recipes, species, t, userLocation]);

  const scopeLabel = useMemo(() => {
    if (!context) return null;
    if (context.scope === 'radius') {
      return t('worthForagingNow.scopeRadius', {
        radius: context.radiusKm ?? 100,
      });
    }

    return t('worthForagingNow.scopeRegion', {
      region: context.regionLabel,
    });
  }, [context, t]);

  return (
    <>
      <SEO
        title={t('worthForagingNow.title')}
        description={t('worthForagingNow.description')}
        canonicalUrl={`${import.meta.env.BASE_URL}worth-foraging-now`}
      />
      <div className='container mx-auto max-w-7xl px-4 py-8'>
        <div className='mb-8 text-center'>
          <h1 className='mb-2 text-4xl font-bold text-foreground'>
            {t('worthForagingNow.title')}
          </h1>
          <p className='text-sm text-muted-foreground'>
            {scopeLabel ??
              (userLocation
                ? t('worthForagingNow.locationEnabled')
                : t('worthForagingNow.locationMissing'))}
          </p>
          {!userLocation ? (
            <p className='mt-1 text-xs italic text-muted-foreground/60'>
              {t('worthForagingNow.shareLocationHint')}
            </p>
          ) : null}
        </div>

        <div className='mb-8 flex flex-wrap items-center gap-3'>
          <Select
            value={focus}
            onValueChange={value => setFocus(value as ForagingFocus)}
          >
            <SelectTrigger className='w-48'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='mixed'>
                {t('worthForagingNow.focus.mixed')}
              </SelectItem>
              <SelectItem value='mushrooms'>
                {t('worthForagingNow.focus.mushrooms')}
              </SelectItem>
              <SelectItem value='plants'>
                {t('worthForagingNow.focus.plants')}
              </SelectItem>
              <SelectItem value='berries'>
                {t('worthForagingNow.focus.berries')}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <section className='rounded-3xl border bg-card p-10'>
            <div className='flex items-center justify-center gap-3 text-muted-foreground'>
              <Loader2 className='h-5 w-5 animate-spin' />
              <span>{t('worthForagingNow.loading')}</span>
            </div>
          </section>
        ) : null}

        {!isLoading && loadError ? (
          <section className='rounded-3xl border border-destructive/20 bg-destructive/5 p-6 text-sm text-destructive'>
            {loadError}
          </section>
        ) : null}

        {!isLoading && !loadError && recommendations.length === 0 ? (
          <section className='rounded-3xl border bg-card p-6 text-sm text-muted-foreground'>
            {t('worthForagingNow.noData')}
          </section>
        ) : null}

        {/* Subgrid: each card spans 6 rows so matching sections align across columns */}
        {!isLoading && !loadError ? (
          <section className='grid gap-x-5 lg:grid-cols-3'>
            {recommendations.map((recommendation, index) => (
              <Card
                key={recommendation.speciesId}
                className='mb-5 gap-0 py-0 last:mb-0 lg:mb-0 lg:row-span-6 lg:grid lg:[grid-template-rows:subgrid]'
              >
                {/* Row 1 — name + score */}
                <div className='flex items-start justify-between gap-3 px-6 pt-6'>
                  <div className='min-w-0 flex-1'>
                    <h2 className='pr-3 text-lg font-semibold leading-snug text-foreground md:text-xl'>
                      {recommendation.speciesName}
                    </h2>
                    <p className='text-sm italic text-muted-foreground'>
                      {recommendation.scientificName}
                    </p>
                  </div>
                  <div className='shrink-0 text-right'>
                    <p className='text-xs font-medium text-muted-foreground'>
                      #{index + 1}
                    </p>
                    <div className='text-4xl font-bold leading-none text-primary'>
                      {recommendation.score}
                    </div>
                    <p className='mt-1 type-micro text-muted-foreground'>
                      {t('worthForagingNow.scoreLabel')}
                    </p>
                  </div>
                </div>

                {/* Row 2 — badges */}
                <div className='flex flex-wrap gap-2 px-6 pt-4'>
                  <Badge variant='outline' className='capitalize'>
                    {t(`worthForagingNow.category.${recommendation.category}`)}
                  </Badge>
                  <Badge>
                    {t(
                      `worthForagingNow.confidence.${recommendation.confidence}`
                    )}
                  </Badge>
                  <Badge variant='secondary'>
                    {recommendation.seasonLabel}
                  </Badge>
                </div>

                {/* Row 3 — why now */}
                <div className='space-y-2 px-6 pt-5'>
                  <div className='flex items-center gap-2 text-sm font-medium text-foreground'>
                    <Leaf className='h-4 w-4 text-primary' />
                    {t('worthForagingNow.whyNow')}
                  </div>
                  <ul className='space-y-1.5 border-l-2 border-border pl-3 text-sm text-muted-foreground'>
                    {recommendation.whyNow.map(reason => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>

                {/* Row 4 — best window (+ optional distance) */}
                <div className='grid gap-3 px-6 pt-5 text-sm text-muted-foreground'>
                  <div className='flex items-start gap-2 rounded-2xl border border-border bg-muted/40 px-3 py-3'>
                    <Calendar className='mt-0.5 h-4 w-4 shrink-0 text-primary' />
                    <div>
                      <p className='font-medium text-foreground'>
                        {t('worthForagingNow.bestWindow')}
                      </p>
                      <p>{recommendation.bestWindow}</p>
                    </div>
                  </div>
                  {recommendation.distanceKm !== null ? (
                    <div className='flex items-start gap-2 rounded-2xl border border-border bg-muted/40 px-3 py-3'>
                      <MapPinned className='mt-0.5 h-4 w-4 shrink-0 text-primary' />
                      <div>
                        <p className='font-medium text-foreground'>
                          {t('worthForagingNow.bestPoint')}
                        </p>
                        <p>
                          {t('worthForagingNow.distanceValue', {
                            distance: recommendation.distanceKm,
                          })}
                        </p>
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* Row 5 — kitchen */}
                <div className='space-y-3 px-6 pt-5'>
                  <div className='flex items-center gap-2 text-sm font-medium text-foreground'>
                    <ChefHat className='h-4 w-4 text-primary' />
                    {t('worthForagingNow.kitchenPayoff')}
                  </div>
                  {recommendation.recipes.length > 0 ? (
                    <div className='flex flex-wrap gap-2'>
                      {recommendation.recipes.map(recipe => (
                        <Badge key={recipe.id} asChild variant='secondary'>
                          <Link to='/recipes' search={{ q: recipe.title }}>
                            {recipe.title}
                          </Link>
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className='text-sm text-muted-foreground'>
                      {t('worthForagingNow.noRecipeMatch')}
                    </p>
                  )}
                </div>

                {/* Row 6 — actions */}
                <div className='flex flex-col gap-3 px-6 pb-6 pt-5 sm:flex-row'>
                  <Button asChild className='flex-1'>
                    <Link
                      to='/'
                      search={{
                        species: recommendation.speciesId,
                        lat: recommendation.coordinate[1],
                        lng: recommendation.coordinate[0],
                        zoom: 8,
                      }}
                      className='inline-flex items-center justify-center gap-2'
                    >
                      {t('worthForagingNow.openMap')}
                      <ArrowUpRight className='h-4 w-4' />
                    </Link>
                  </Button>
                  <Button asChild variant='outline' className='flex-1'>
                    <Link
                      to='/species'
                      search={{ q: recommendation.speciesName }}
                    >
                      {t('worthForagingNow.reviewSpecies')}
                    </Link>
                  </Button>
                </div>
              </Card>
            ))}
          </section>
        ) : null}
      </div>
    </>
  );
}
