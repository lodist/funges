import { useEffect, useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import SEO from '@/components/SEO';
import { useSpeciesData } from '@/data/species';
import { useRecipesData } from '@/data/recipes';
import {
  fetchWorthForagingNowRecommendations,
  type ExperienceLevel,
  type ForagingFocus,
  type RecommendationContext,
  type WeekendRecommendation,
} from '@/lib/weekend-recommendations';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  ShieldAlert,
  ArrowUpRight,
} from 'lucide-react';
import { useMapStore } from '@/store/mapStore';

function formatReferenceDate(referenceDate: string | null) {
  if (!referenceDate) return null;
  const parsed = new Date(referenceDate);
  if (Number.isNaN(parsed.getTime())) return referenceDate;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed);
}

export default function WorthForagingNowPage() {
  const { t } = useTranslation('common');
  const species = useSpeciesData();
  const recipes = useRecipesData();
  const { center, userLocation } = useMapStore();
  const experienceLevel: ExperienceLevel = 'beginner';
  const [focus, setFocus] = useState<ForagingFocus>('mixed');
  const [recommendations, setRecommendations] = useState<
    WeekendRecommendation[]
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
          experienceLevel,
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
            : 'Unable to load score-based suggestions.'
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
  }, [center, experienceLevel, focus, recipes, species, userLocation]);

  const scopeLabel = useMemo(() => {
    if (!context) return null;
    if (context.scope === 'radius') {
      return t('weekend.scopeRadius', {
        defaultValue: `Top current scores within ${context.radiusKm} km`,
        radius: context.radiusKm ?? 100,
      });
    }

    return t('weekend.scopeRegion', {
      defaultValue: `Top current scores in ${context.regionLabel}`,
      region: context.regionLabel,
    });
  }, [context, t]);

  const referenceDateLabel = useMemo(
    () => formatReferenceDate(context?.referenceDate ?? null),
    [context]
  );

  return (
    <>
      <SEO
        title={t('weekend.title')}
        description={t('weekend.description')}
        canonicalUrl={`${import.meta.env.BASE_URL}worth-foraging-now`}
      />
      <div className='container mx-auto max-w-7xl px-4 py-8'>
        <div className='mb-8 text-center'>
          <div className='mb-4 flex flex-wrap justify-center gap-2'>
            {scopeLabel ? (
              <Badge className='border-[#dcc8b6] bg-background text-text-secondary hover:bg-background'>
                {scopeLabel}
              </Badge>
            ) : null}
            {referenceDateLabel ? (
              <Badge
                variant='outline'
                className='border-[#dcc8b6] bg-background text-text-secondary'
              >
                {t('weekend.currentAsOf', {
                  defaultValue: `As of ${referenceDateLabel}`,
                  date: referenceDateLabel,
                })}
              </Badge>
            ) : null}
          </div>
          <h1 className='mb-4 text-4xl font-bold text-text-primary'>
            {t('weekend.title')}
          </h1>
          <p className='mx-auto max-w-3xl text-lg text-text-secondary'>
            {t('weekend.description')}
          </p>
          <p className='mx-auto mt-6 max-w-3xl text-sm leading-8 text-text-secondary'>
            {userLocation
              ? t('weekend.locationEnabled', {
                  defaultValue:
                    'These suggestions come from the strongest current scores within 100 km of your shared location.',
                })
              : t('weekend.locationMissing', {
                  defaultValue:
                    'Location is not shared, so these suggestions come from the strongest current scores in your current map region.',
                })}
          </p>
        </div>

        <div className='mb-8 space-y-4'>
          <div className='flex flex-col gap-4 sm:flex-row sm:items-center'>
            <div className='flex-1'>
              <Select
                value={focus}
                onValueChange={value => setFocus(value as ForagingFocus)}
              >
                <SelectTrigger className='w-full sm:w-56'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='mixed'>
                    {t('weekend.focus.mixed')}
                  </SelectItem>
                  <SelectItem value='mushrooms'>
                    {t('weekend.focus.mushrooms')}
                  </SelectItem>
                  <SelectItem value='plants'>
                    {t('weekend.focus.plants')}
                  </SelectItem>
                  <SelectItem value='berries'>
                    {t('weekend.focus.berries')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {!isLoading && !loadError ? (
            <div className='text-sm text-text-secondary'>
              {recommendations.length}{' '}
              {t('weekend.resultsLabel', {
                defaultValue:
                  recommendations.length === 1 ? 'suggestion' : 'suggestions',
                count: recommendations.length,
              })}
            </div>
          ) : null}
        </div>

        {isLoading ? (
          <section className='rounded-3xl border bg-card p-10'>
            <div className='flex items-center justify-center gap-3 text-muted-foreground'>
              <Loader2 className='h-5 w-5 animate-spin' />
              <span>
                {t('weekend.loading', {
                  defaultValue: 'Loading current score recommendations...',
                })}
              </span>
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
            {t('weekend.noData', {
              defaultValue:
                'No score-based recommendations were available for the current scope.',
            })}
          </section>
        ) : null}

        {!isLoading && !loadError ? (
          <section className='grid gap-5 lg:grid-cols-3'>
            {recommendations.map((recommendation, index) => (
              <Card
                key={recommendation.speciesId}
                className='overflow-hidden rounded-[2rem] border-[#ddccbc] bg-[linear-gradient(180deg,#fffdf9_0%,#fbf4ea_100%)] py-0 shadow-[0_28px_60px_-45px_rgba(122,31,61,0.38)]'
              >
                <div className='h-2 bg-gradient-to-r from-[#7a1f3d] via-[#b77924] to-[#6c7c3d]' />
                <CardHeader className='space-y-4 pt-6'>
                  <div className='flex items-start justify-between gap-3'>
                    <div className='min-w-0 flex-1'>
                      <p className='text-xs font-medium text-[#7b6a5f]'>
                        {t('weekend.rankLabel', { rank: index + 1 })}
                      </p>
                      <CardTitle className='pr-3 text-lg font-semibold leading-snug text-[#24191b] md:text-xl'>
                        {recommendation.speciesName}
                      </CardTitle>
                      <p className='text-sm italic text-[#7b6a5f]'>
                        {recommendation.scientificName}
                      </p>
                    </div>
                    <div className='shrink-0 pt-1 text-right'>
                      <div className='text-xl font-semibold leading-none text-[#7a1f3d] md:text-2xl'>
                        {recommendation.score}
                      </div>
                      <p className='mt-2 text-[10px] font-medium uppercase tracking-[0.18em] text-[#8b7868]'>
                        {t('weekend.scoreLabel')}
                      </p>
                    </div>
                  </div>

                  <div className='flex flex-wrap gap-2'>
                    <Badge
                      variant='outline'
                      className='border-[#ddccbc] bg-white/80 capitalize text-[#5f5249]'
                    >
                      {t(`weekend.category.${recommendation.category}`)}
                    </Badge>
                    <Badge className='bg-[#7a1f3d]/10 text-[#7a1f3d] hover:bg-[#7a1f3d]/10'>
                      {t(`weekend.confidence.${recommendation.confidence}`)}
                    </Badge>
                    <Badge
                      variant='outline'
                      className='border-[#e3cb93] bg-[#fff7df] text-[#9a6a02]'
                    >
                      {recommendation.seasonLabel}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className='space-y-5 pb-6'>
                  <div className='space-y-3'>
                    <div className='flex items-center gap-2 text-sm font-medium text-[#24191b]'>
                      <Leaf className='h-4 w-4 text-[#6c7c3d]' />
                      {t('weekend.whyNow')}
                    </div>
                    <ul className='space-y-2 text-sm text-[#5b4c42]'>
                      {recommendation.whyNow.map(reason => (
                        <li
                          key={reason}
                          className='rounded-2xl border border-[#e7d6c6] bg-white/75 px-3 py-2'
                        >
                          {reason}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className='grid gap-3 text-sm text-[#5b4c42]'>
                    <div className='flex items-start gap-2 rounded-2xl border border-[#e7d6c6] bg-white/70 px-3 py-3'>
                      <MapPinned className='mt-0.5 h-4 w-4 text-[#7a1f3d]' />
                      <div>
                        <p className='font-medium text-[#24191b]'>
                          {t('weekend.bestWindow')}
                        </p>
                        <p>{recommendation.bestWindow}</p>
                      </div>
                    </div>
                    {recommendation.distanceKm !== null ? (
                      <div className='flex items-start gap-2 rounded-2xl border border-[#e7d6c6] bg-white/70 px-3 py-3'>
                        <MapPinned className='mt-0.5 h-4 w-4 text-[#7a1f3d]' />
                        <div>
                          <p className='font-medium text-[#24191b]'>
                            {t('weekend.bestPoint', {
                              defaultValue: 'Best nearby point',
                            })}
                          </p>
                          <p>
                            {t('weekend.distanceValue', {
                              defaultValue: '{{distance}} km away',
                              distance: recommendation.distanceKm,
                            })}
                          </p>
                        </div>
                      </div>
                    ) : null}
                    <div className='flex items-start gap-2 rounded-2xl border border-[#ecd7aa] bg-[#fff9ea] px-3 py-3'>
                      <ShieldAlert className='mt-0.5 h-4 w-4 text-[#b77924]' />
                      <div>
                        <p className='font-medium text-[#24191b]'>
                          {t('weekend.caution')}
                        </p>
                        <p>{recommendation.caution}</p>
                      </div>
                    </div>
                  </div>

                  <div className='space-y-3'>
                    <div className='flex items-center gap-2 text-sm font-medium text-[#24191b]'>
                      <ChefHat className='h-4 w-4 text-[#b77924]' />
                      {t('weekend.kitchenPayoff')}
                    </div>
                    {recommendation.recipes.length > 0 ? (
                      <div className='flex flex-wrap gap-2'>
                        {recommendation.recipes.map(recipe => (
                          <Link
                            key={recipe.id}
                            to='/recipes'
                            search={{ q: recipe.title }}
                            className='inline-flex items-center rounded-full bg-[#6c7c3d]/12 px-2.5 py-0.5 text-sm font-medium text-[#556229] transition-colors hover:bg-[#6c7c3d]/20'
                          >
                            {recipe.title}
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <p className='text-sm text-[#7b6a5f]'>
                        {t('weekend.noRecipeMatch')}
                      </p>
                    )}
                  </div>

                  <div className='flex flex-col gap-3 sm:flex-row'>
                    <Button
                      asChild
                      className='flex-1 rounded-2xl bg-[#7a1f3d] text-white hover:bg-[#651731]'
                    >
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
                        {t('weekend.openMap')}
                        <ArrowUpRight className='h-4 w-4' />
                      </Link>
                    </Button>
                    <Button
                      asChild
                      variant='outline'
                      className='flex-1 rounded-2xl border-[#d3b88d] bg-[#fffaf0] text-[#8c5c00] hover:bg-[#fff2d0] hover:text-[#7a4d00]'
                    >
                      <Link to='/species'>{t('weekend.reviewSpecies')}</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </section>
        ) : null}
      </div>
    </>
  );
}
