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
  type WorthForagingNowRecommendation,
} from '@/lib/worth-foraging-now';
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
import { Loader2, ChefHat, Leaf, MapPinned, ArrowUpRight } from 'lucide-react';
import { useMapStore } from '@/store/mapStore';

export default function WorthForagingNowPage() {
  const { t, i18n } = useTranslation(['common', 'species']);
  const species = useSpeciesData();
  const recipes = useRecipesData();
  const { center, userLocation } = useMapStore();
  const experienceLevel: ExperienceLevel = 'beginner';
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
  }, [center, experienceLevel, focus, i18n.language, recipes, species, userLocation]);

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
          {scopeLabel ? (
            <p className='mb-4 text-sm font-medium text-text-secondary'>
              {scopeLabel}
            </p>
          ) : null}
          <h1 className='mb-4 text-4xl font-bold text-text-primary'>
            {t('worthForagingNow.title')}
          </h1>
          <p className='mx-auto max-w-3xl text-lg text-text-secondary'>
            {t('worthForagingNow.description')}
          </p>
          <p className='mx-auto mt-6 max-w-3xl text-sm leading-8 text-text-secondary'>
            {userLocation
              ? t('worthForagingNow.locationEnabled')
              : t('worthForagingNow.locationMissing')}
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
          </div>

          {!isLoading && !loadError ? (
            <div className='text-sm text-text-secondary'>
              {recommendations.length}{' '}
              {t('worthForagingNow.resultsLabel', {
                count: recommendations.length,
              })}
            </div>
          ) : null}
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

        {!isLoading && !loadError ? (
          <section className='grid gap-5 lg:grid-cols-3'>
            {recommendations.map((recommendation, index) => (
              <Card
                key={recommendation.speciesId}
                className='rounded-[2rem] border-[#ddccbc] bg-card py-0 shadow-[0_18px_40px_-36px_rgba(60,42,24,0.22)]'
              >
                <CardHeader className='space-y-4 pt-6'>
                  <div className='flex items-start justify-between gap-3'>
                    <div className='min-w-0 flex-1'>
                      <p className='text-xs font-medium text-[#7b6a5f]'>
                        {t('worthForagingNow.rankLabel', { rank: index + 1 })}
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
                        {t('worthForagingNow.scoreLabel')}
                      </p>
                    </div>
                  </div>

                  <div className='flex flex-wrap gap-2'>
                    <Badge
                      variant='outline'
                      className='border-[#ddccbc] bg-white/80 capitalize text-[#5f5249]'
                    >
                      {t(`worthForagingNow.category.${recommendation.category}`)}
                    </Badge>
                    <Badge className='bg-[#7a1f3d]/10 text-[#7a1f3d] hover:bg-[#7a1f3d]/10'>
                      {t(
                        `worthForagingNow.confidence.${recommendation.confidence}`
                      )}
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
                      {t('worthForagingNow.whyNow')}
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
                          {t('worthForagingNow.bestWindow')}
                        </p>
                        <p>{recommendation.bestWindow}</p>
                      </div>
                    </div>
                    {recommendation.distanceKm !== null ? (
                      <div className='flex items-start gap-2 rounded-2xl border border-[#e7d6c6] bg-white/70 px-3 py-3'>
                        <MapPinned className='mt-0.5 h-4 w-4 text-[#7a1f3d]' />
                        <div>
                          <p className='font-medium text-[#24191b]'>
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

                  <div className='space-y-3'>
                    <div className='flex items-center gap-2 text-sm font-medium text-[#24191b]'>
                      <ChefHat className='h-4 w-4 text-[#b77924]' />
                      {t('worthForagingNow.kitchenPayoff')}
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
                        {t('worthForagingNow.noRecipeMatch')}
                      </p>
                    )}
                  </div>

                  <div className='flex flex-col gap-3 sm:flex-row'>
                    <Button
                      asChild
                      className='flex-1 rounded-2xl border border-[#4f8740] bg-[#4f8740] text-white hover:bg-[#427236]'
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
                        {t('worthForagingNow.openMap')}
                        <ArrowUpRight className='h-4 w-4' />
                      </Link>
                    </Button>
                    <Button
                      asChild
                      variant='outline'
                      className='flex-1 rounded-2xl border-[rgb(130,12,12)] bg-white text-[#24191b] hover:border-[rgb(130,12,12)] hover:bg-[rgb(130,12,12)] hover:text-white'
                    >
                      <Link to='/species'>
                        {t('worthForagingNow.reviewSpecies')}
                      </Link>
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
