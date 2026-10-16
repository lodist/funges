import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import SEO from '@/components/SEO';
import { RecipeModalWrapper } from '@/components';
import { CategoryChips } from '@/components/CategoryChips';
import { ScopeHeader } from '@/components/ScopeHeader';
import { ConditionsMeter } from '@/components/SpeciesSignals';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  recipeSpeciesFamily,
  useRecipesData,
  type Recipe,
} from '@/data/recipes';
import {
  CATEGORY_FILTERS,
  getSpeciesById,
  speciesNameKey,
} from '@/data/species';
import { useCurrentScores } from '@/hooks/use-current-scores';
import { BAND_OUTLINE_CLASS, BAND_SURFACE_CLASS } from '@/lib/band-surface';
import { CATEGORY_ICONS } from '@/lib/categoryIcons';
import { ChefHat, Clock, MapPinned, Search, Users } from '@/lib/icons';
import {
  monthsLabel,
  seasonOf,
  seasonPlace,
  speciesSeasons,
  type Season,
  type SeasonPlace,
} from '@/lib/seasons';
import { cn, getSpeciesImage } from '@/lib/utils';
import { Route as RecipesRoute } from '@/routes/recipes';

/** The wild ingredient that makes a recipe cookable today. `score` is absent
 *  when the day's scores are unavailable and the calendar alone decided. */
interface ReadyBy {
  speciesId: string;
  score?: number;
}

/** A recipe is ready when any of its wild ingredients, or a sibling that
 *  cooks like it, scores today; offline, when its season is today's. */
function readyBy(
  recipe: Recipe,
  scores: Record<string, number> | null,
  season: Season
): ReadyBy | null {
  let best: ReadyBy | null = null;
  for (const id of recipe.species) {
    for (const member of recipeSpeciesFamily(id)) {
      if (scores) {
        const score = scores[member];
        if (score !== undefined && (best?.score ?? -1) < score) {
          best = { speciesId: member, score };
        }
      } else if (
        !best &&
        speciesSeasons(getSpeciesById(member)?.season).includes(season)
      ) {
        best = { speciesId: member };
      }
    }
  }
  return best;
}

/** How soon a recipe's ingredient comes back: next season first. */
const COMING_BACK: SeasonPlace[] = ['next', 'later', 'before', 'now'];

function comingBack(recipe: Recipe, season: Season) {
  return Math.min(
    ...recipe.species.map(id =>
      COMING_BACK.indexOf(
        seasonPlace(speciesSeasons(getSpeciesById(id)?.season), season)
      )
    )
  );
}

export default function RecipesPage() {
  const { t } = useTranslation(['recipes', 'species', 'common']);
  const { q } = RecipesRoute.useSearch();
  const recipes = useRecipesData();
  const current = useCurrentScores();
  const [searchQuery, setSearchQuery] = useState(q ?? '');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);

  useEffect(() => {
    setSearchQuery(q ?? '');
  }, [q]);

  const season = seasonOf(new Date());
  const scores = current?.scores ?? null;

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return recipes.filter(
      recipe =>
        (selectedCategory === 'all' ||
          recipe.species.some(
            id => getSpeciesById(id)?.category === selectedCategory
          )) &&
        (query === '' ||
          recipe.title.toLowerCase().includes(query) ||
          recipe.tags.some(tag => tag.toLowerCase().includes(query)) ||
          recipe.ingredients.some(ingredient =>
            ingredient.toLowerCase().includes(query)
          ))
    );
  }, [recipes, searchQuery, selectedCategory]);

  const { ready, later } = useMemo(() => {
    const ready: { recipe: Recipe; by: ReadyBy }[] = [];
    const later: Recipe[] = [];
    for (const recipe of filtered) {
      const by = readyBy(recipe, scores, season);
      if (by) ready.push({ recipe, by });
      else later.push(recipe);
    }
    ready.sort(
      (a, b) =>
        (b.by.score ?? 0) - (a.by.score ?? 0) ||
        a.recipe.title.localeCompare(b.recipe.title)
    );
    later.sort(
      (a, b) =>
        comingBack(a, season) - comingBack(b, season) ||
        a.title.localeCompare(b.title)
    );
    return { ready, later };
  }, [filtered, scores, season]);

  const categories = [
    { value: 'all', label: t('species:allTypes'), icon: CATEGORY_ICONS.all },
    ...CATEGORY_FILTERS.map(({ value, labelKey }) => ({
      value,
      label: t(`species:${labelKey}`),
      icon: CATEGORY_ICONS[value],
    })),
  ];

  const scopeLabel = current
    ? current.scope === 'radius'
      ? t('common:worthForagingNow.scopeRadius', { radius: 100 })
      : current.regionLabel
    : undefined;
  const [lead, ...rest] = ready;

  return (
    <>
      <SEO
        title={t('title')}
        description={t('description')}
        canonicalUrl={`${import.meta.env.BASE_URL}recipes`}
      />
      <div className='container mx-auto max-w-7xl px-4 py-8'>
        <header className='mb-10 flex flex-col gap-6'>
          <ScopeHeader title={t('title')} scopeLabel={scopeLabel} />
          <div className='flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between'>
            <div className='relative lg:w-72'>
              <Search className='pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground' />
              <Input
                placeholder={t('search.placeholder')}
                value={searchQuery}
                onChange={event => setSearchQuery(event.target.value)}
                className='pl-11'
              />
            </div>
            <CategoryChips
              chips={categories}
              value={selectedCategory}
              onChange={setSelectedCategory}
              className='justify-start'
            />
          </div>
        </header>

        {lead ? (
          <section aria-labelledby='recipes-ready' className='mb-12'>
            <h2
              id='recipes-ready'
              className='mb-5 text-2xl font-semibold text-foreground sm:text-3xl'
            >
              {t('readyNow')}
            </h2>
            <RecipeHero
              recipe={lead.recipe}
              by={lead.by}
              onOpen={() => setSelectedRecipe(lead.recipe)}
            />
            {rest.length > 0 ? (
              <ul className='mt-5 grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 xl:grid-cols-4'>
                {rest.map(({ recipe, by }) => (
                  <li key={recipe.id}>
                    <RecipeCard
                      recipe={recipe}
                      by={by}
                      season={season}
                      onOpen={() => setSelectedRecipe(recipe)}
                    />
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}

        {later.length > 0 ? (
          <section aria-labelledby='recipes-later' className='mb-12'>
            <div className='mb-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1'>
              <h2
                id='recipes-later'
                className='text-2xl font-semibold text-foreground sm:text-3xl'
              >
                {t('later')}
              </h2>
              <p className='text-sm text-muted-foreground'>
                {t('recipeCount', { count: later.length })}
              </p>
            </div>
            <ul className='grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4 xl:grid-cols-5'>
              {later.map(recipe => (
                <li key={recipe.id}>
                  <RecipeCard
                    recipe={recipe}
                    season={season}
                    compact
                    onOpen={() => setSelectedRecipe(recipe)}
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {filtered.length === 0 ? (
          <div className='flex flex-col items-center gap-4 py-12 text-center'>
            <ChefHat className='size-12 text-muted-foreground' />
            <h2 className='text-lg font-medium text-foreground'>
              {t('search.no_results')}
            </h2>
            <p className='text-muted-foreground'>{t('search.try_adjusting')}</p>
            <Button
              variant='outline'
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('all');
              }}
            >
              {t('species:search.clear')}
            </Button>
          </div>
        ) : null}

        <RecipeModalWrapper
          recipe={selectedRecipe}
          isOpen={!!selectedRecipe}
          onClose={() => setSelectedRecipe(null)}
        />
      </div>
    </>
  );
}

/** The best recipe to cook today, on the band like the day's top pick. */
function RecipeHero({
  recipe,
  by,
  onOpen,
}: {
  recipe: Recipe;
  by: ReadyBy;
  onOpen: () => void;
}) {
  const { t } = useTranslation(['recipes', 'species']);
  const shown = recipe.ingredients.slice(0, 5);

  return (
    <article
      className={cn(
        BAND_SURFACE_CLASS,
        'grid overflow-hidden rounded-card elevation-raised md:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]'
      )}
    >
      <div className='relative aspect-square min-w-0 md:aspect-auto md:min-h-[28rem]'>
        {recipe.image ? (
          <img
            src={recipe.image}
            alt=''
            className='absolute inset-0 size-full bg-muted object-cover'
          />
        ) : null}
      </div>
      <div className='flex min-w-0 flex-col gap-6 p-6 sm:p-8 lg:p-10'>
        <div>
          <h3 className='text-3xl leading-[1.05] font-semibold text-balance hyphens-auto break-words text-happy-50 sm:text-4xl lg:text-5xl'>
            {recipe.title}
          </h3>
          <p className='mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-happy-100'>
            <span className='inline-flex items-center gap-1.5'>
              <Clock className='size-4' />
              {recipe.prepTime}
            </span>
            <span>{t(`tags.${recipe.difficulty}`)}</span>
            <span className='inline-flex items-center gap-1.5'>
              <Users className='size-4' />
              {recipe.servings}
            </span>
          </p>
        </div>

        <ReadySpecies by={by} tone='band' />

        <div>
          <p className='type-micro text-happy-100'>{t('ingredients')}</p>
          <ul className='mt-2 space-y-1 text-sm text-happy-50'>
            {shown.map(ingredient => (
              <li key={ingredient}>{ingredient}</li>
            ))}
            {recipe.ingredients.length > shown.length ? (
              <li className='text-happy-100'>
                {t('moreCount', {
                  count: recipe.ingredients.length - shown.length,
                })}
              </li>
            ) : null}
          </ul>
        </div>

        <div className='mt-auto flex flex-wrap gap-3'>
          <Button onClick={onOpen}>{t('view_recipe')}</Button>
          <Button asChild variant='outline' className={BAND_OUTLINE_CLASS}>
            <Link to='/map' search={{ species: by.speciesId }}>
              <MapPinned />
              {t('findOnMap')}
            </Link>
          </Button>
        </div>
      </div>
    </article>
  );
}

/** A dish: its photo first, then what it takes and when its wild
 *  ingredient is (or will be) out there. Opens the recipe. */
function RecipeCard({
  recipe,
  by,
  season,
  compact = false,
  onOpen,
}: {
  recipe: Recipe;
  by?: ReadyBy;
  season: Season;
  compact?: boolean;
  onOpen: () => void;
}) {
  const { t, i18n } = useTranslation(['recipes', 'species']);
  // Not ready: name the ingredient that comes back soonest, with its months.
  const nextUp = by
    ? undefined
    : [...recipe.species].sort(
        (a, b) =>
          COMING_BACK.indexOf(
            seasonPlace(speciesSeasons(getSpeciesById(a)?.season), season)
          ) -
          COMING_BACK.indexOf(
            seasonPlace(speciesSeasons(getSpeciesById(b)?.season), season)
          )
      )[0];

  return (
    <button
      type='button'
      onClick={onOpen}
      className='focus-ring flex h-full w-full flex-col overflow-hidden rounded-card bg-card text-left elevation-raised elevation-interactive'
    >
      <span className='relative block aspect-[4/3]'>
        {recipe.image ? (
          <img
            src={recipe.image}
            alt=''
            loading='lazy'
            decoding='async'
            className='absolute inset-0 size-full bg-muted object-cover'
          />
        ) : null}
      </span>
      <span
        className={cn(
          'flex flex-1 flex-col gap-2 p-3',
          !compact && 'sm:gap-3 sm:p-4'
        )}
      >
        <span
          className={cn(
            'leading-snug font-semibold text-foreground',
            compact ? 'text-base' : 'text-base sm:text-lg'
          )}
        >
          {recipe.title}
        </span>
        <span className='flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground'>
          <span className='inline-flex items-center gap-1'>
            <Clock className='size-4' />
            {recipe.prepTime}
          </span>
          <span>{t(`tags.${recipe.difficulty}`)}</span>
        </span>
        <span className='mt-auto'>
          {by ? (
            <ReadySpecies by={by} />
          ) : nextUp ? (
            <SpeciesLine speciesId={nextUp}>
              <span className='block text-xs text-muted-foreground'>
                {monthsLabel(
                  speciesSeasons(getSpeciesById(nextUp)?.season),
                  i18n.language
                )}
              </span>
            </SpeciesLine>
          ) : null}
        </span>
      </span>
    </button>
  );
}

/** The ingredient that is in season, with today's conditions when known. */
function ReadySpecies({
  by,
  tone = 'paper',
}: {
  by: ReadyBy;
  tone?: 'band' | 'paper';
}) {
  return (
    <SpeciesLine speciesId={by.speciesId} tone={tone}>
      {by.score !== undefined ? (
        <ConditionsMeter score={by.score} tone={tone} compact />
      ) : null}
    </SpeciesLine>
  );
}

function SpeciesLine({
  speciesId,
  tone = 'paper',
  children,
}: {
  speciesId: string;
  tone?: 'band' | 'paper';
  children?: ReactNode;
}) {
  const { t } = useTranslation('species');
  const image = getSpeciesImage(speciesId);
  return (
    <span className='flex items-center gap-2.5'>
      {image ? (
        <img
          src={image}
          alt=''
          loading='lazy'
          decoding='async'
          className='size-9 shrink-0 rounded-full bg-muted object-cover'
        />
      ) : null}
      <span className='min-w-0 flex-1'>
        <span
          className={cn(
            'block truncate text-sm font-medium',
            tone === 'band' ? 'text-happy-50' : 'text-foreground'
          )}
        >
          {t(`list_of_species.${speciesNameKey(speciesId)}`)}
        </span>
        {children}
      </span>
    </span>
  );
}
