import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import SEO from '@/components/SEO';
import { CategoryChips } from '@/components/CategoryChips';
import { ScopeHeader } from '@/components/ScopeHeader';
import {
  ConditionsMeter,
  LookalikeTag,
  LookOnlyTag,
} from '@/components/SpeciesSignals';
import { SpeciesSheet } from '@/components/SpeciesSheet';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { useRecipesData } from '@/data/recipes';
import {
  CATEGORY_FILTERS,
  useSpeciesData,
  type SpeciesWithTranslations,
} from '@/data/species';
import { useCurrentScores } from '@/hooks/use-current-scores';
import {
  BLOOM_REGION_CODES,
  spectaclesInSeason,
  type BloomRegion,
  type Spectacle,
} from '@/lib/bloom';
import { CATEGORY_ICONS } from '@/lib/categoryIcons';
import { AlertTriangle, ChevronDown, Search } from '@/lib/icons';
import {
  monthRange,
  monthsLabel,
  nextSeason,
  previousSeason,
  seasonMonths,
  seasonOf,
  seasonPlace,
  seasonProgress,
  speciesSeasons,
  type Season,
  type SeasonPlace,
} from '@/lib/seasons';
import { BAND_SURFACE_CLASS as BAND } from '@/lib/band-surface';
import { cn, getSpeciesImage } from '@/lib/utils';
import {
  getWorstLookalike,
  type ScoreRegionId,
} from '@/lib/worth-foraging-now';
import { Route } from '@/routes/species';

type Species = SpeciesWithTranslations;

/** Sections run from what matters today outwards. */
const SECTION_ORDER: SeasonPlace[] = ['now', 'next', 'before', 'later'];

const byName = (a: Species, b: Species) => a.name.localeCompare(b.name);

/**
 * Today's scores decide "now": a species scoring near the reader (or in their
 * region) is in season whatever the calendar says. Everything else falls back
 * to its catalog season against today's. A species the region's forecast
 * leaves out grows elsewhere. Only "next" overlaps another group.
 */
function groupSpecies(
  list: Species[],
  scores: Record<string, number> | null,
  season: Season,
  regionId: ScoreRegionId | undefined
) {
  const groups: Record<SeasonPlace, Species[]> = {
    now: [],
    next: [],
    before: [],
    later: [],
  };
  const elsewhere: Species[] = [];
  for (const species of list) {
    if (
      regionId &&
      species.forecastRegions &&
      !species.forecastRegions.includes(regionId)
    ) {
      elsewhere.push(species);
      continue;
    }
    const place =
      scores?.[species.id] !== undefined
        ? 'now'
        : seasonPlace(speciesSeasons(species.season), season);
    groups[place].push(species);
  }
  groups.now.sort(
    (a, b) => (scores?.[b.id] ?? -1) - (scores?.[a.id] ?? -1) || byName(a, b)
  );
  // "Coming next" is what the next season holds, so it also lists what
  // carries on from today: with only fall-winter species in winter, starting
  // species alone left the section, and its count on the line, at zero.
  groups.next.sort(byName);
  groups.next.push(
    ...groups.now
      .filter(species =>
        speciesSeasons(species.season).includes(nextSeason(season))
      )
      .sort(byName)
  );
  groups.before.sort(byName);
  groups.later.sort(byName);
  elsewhere.sort(byName);
  return { groups, elsewhere };
}

export default function SpeciesPage() {
  const { t } = useTranslation(['species', 'common']);
  const { t: tMap } = useTranslation('map');
  const speciesData = useSpeciesData();
  const recipes = useRecipesData();
  const current = useCurrentScores();
  const { q } = Route.useSearch();
  const [searchQuery, setSearchQuery] = useState(q ?? '');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (q !== undefined) setSearchQuery(q);
  }, [q]);

  const today = useMemo(() => new Date(), []);
  const season = seasonOf(today);
  const scores = current?.scores ?? null;

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return speciesData.filter(
      species =>
        (selectedCategory === 'all' || species.category === selectedCategory) &&
        (query === '' ||
          species.name.toLowerCase().includes(query) ||
          species.scientificName.toLowerCase().includes(query) ||
          species.description.toLowerCase().includes(query))
    );
  }, [speciesData, searchQuery, selectedCategory]);

  // The spectacles on now in the reader's region (in every region before we
  // know it) close "In season now". They are no species type, so a type chip
  // hides them; the search finds them by name.
  const spectacles = useMemo(() => {
    if (selectedCategory !== 'all') return [];
    const query = searchQuery.trim().toLowerCase();
    return spectaclesInSeason(
      today,
      current
        ? [current.regionId.toLowerCase() as BloomRegion]
        : BLOOM_REGION_CODES
    ).filter(
      spectacle =>
        query === '' ||
        tMap(`${spectacle.keys}.name`).toLowerCase().includes(query) ||
        spectacle.scientificName.toLowerCase().includes(query)
    );
  }, [today, current, searchQuery, selectedCategory, tMap]);

  // The band counts the whole catalog; the sections show what the search
  // and the type chips leave.
  const overview = useMemo(
    () => groupSpecies(speciesData, scores, season, current?.regionId),
    [speciesData, scores, season, current?.regionId]
  );
  const shown = useMemo(
    () => groupSpecies(filtered, scores, season, current?.regionId),
    [filtered, scores, season, current?.regionId]
  );

  const categories = [
    { value: 'all', label: t('allTypes'), icon: CATEGORY_ICONS.all },
    ...CATEGORY_FILTERS.map(({ value, labelKey }) => ({
      value,
      label: t(labelKey),
      icon: CATEGORY_ICONS[value],
    })),
  ];

  const scopeLabel = current
    ? current.scope === 'radius'
      ? t('common:worthForagingNow.scopeRadius', { radius: 100 })
      : current.regionLabel
    : undefined;
  const openSpecies = speciesData.find(species => species.id === openId);

  const jumpTo = (place: SeasonPlace) => {
    const reduce = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;
    document.getElementById(`season-${place}`)?.scrollIntoView({
      behavior: reduce ? 'auto' : 'smooth',
      block: 'start',
    });
  };

  const nothingFound = filtered.length === 0 && spectacles.length === 0;

  return (
    <>
      <SEO
        title={t('title')}
        description={t('description')}
        canonicalUrl={`${import.meta.env.BASE_URL}species`}
      />
      <div className='container mx-auto max-w-7xl px-4 py-8'>
        <header className='mb-10 flex flex-col gap-6'>
          <ScopeHeader title={t('title')} scopeLabel={scopeLabel} />

          <SeasonBand
            season={season}
            progress={seasonProgress(today)}
            counts={{
              now: overview.groups.now.length,
              next: overview.groups.next.length,
              before: overview.groups.before.length,
              later: overview.groups.later.length,
            }}
            scopeLabel={scopeLabel}
            onJump={jumpTo}
          />

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

        {SECTION_ORDER.map(place => {
          const items = shown.groups[place];
          const sights = place === 'now' ? spectacles : [];
          if (items.length + sights.length === 0) return null;
          const placeSeason = seasonForPlace(season, place);
          return (
            <section
              key={place}
              id={`season-${place}`}
              aria-labelledby={`season-${place}-title`}
              className='mb-12 scroll-mt-6'
            >
              <div className='mb-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1'>
                <h2
                  id={`season-${place}-title`}
                  className='text-2xl font-semibold text-foreground sm:text-3xl'
                >
                  {t(`groups.${place}`)}
                </h2>
                <p className='text-sm text-muted-foreground'>
                  {t(`seasons.${placeSeason}`)}
                  {' · '}
                  {t('speciesCount', { count: items.length })}
                  {sights.length > 0
                    ? ` · ${t('spectacleCount', { count: sights.length })}`
                    : null}
                </p>
              </div>
              <ul
                className={cn(
                  'grid grid-cols-2 gap-4',
                  place === 'now'
                    ? 'sm:grid-cols-3 lg:grid-cols-4'
                    : 'sm:grid-cols-4 lg:grid-cols-6'
                )}
              >
                {items.map(species => (
                  <li key={species.id}>
                    <SpeciesTile
                      species={species}
                      score={place === 'now' ? scores?.[species.id] : undefined}
                      large={place === 'now'}
                      onOpen={() => setOpenId(species.id)}
                    />
                  </li>
                ))}
                {sights.map(spectacle => (
                  <li key={spectacle.code}>
                    <SpectacleTile spectacle={spectacle} />
                  </li>
                ))}
              </ul>
            </section>
          );
        })}

        {shown.elsewhere.length > 0 && current ? (
          // Relevance-based disclosure: the reader's region comes first, the
          // rest of the catalog one tap away.
          <Collapsible className='mb-12'>
            <CollapsibleTrigger asChild>
              <Button variant='ghost' className='-ml-4 px-4'>
                {t('groups.elsewhere')}
                {' · '}
                {t('speciesCount', { count: shown.elsewhere.length })}
                <ChevronDown />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className='pt-4'>
              <ul className='grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6'>
                {shown.elsewhere.map(species => (
                  <li key={species.id}>
                    <SpeciesTile
                      species={species}
                      onOpen={() => setOpenId(species.id)}
                    />
                  </li>
                ))}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        ) : null}

        {nothingFound ? (
          <div className='flex flex-col items-center gap-4 py-12 text-center'>
            <Search className='size-12 text-muted-foreground' />
            <h2 className='text-xl font-semibold text-foreground'>
              {t('noResults')}
            </h2>
            <p className='text-muted-foreground'>{t('noResultsDescription')}</p>
            <Button
              variant='outline'
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('all');
              }}
            >
              {t('search.clear')}
            </Button>
          </div>
        ) : null}

        <p className='flex items-start gap-2 rounded-lg bg-status-warning-background px-3 py-2 ring-2 ring-status-warning-border/60'>
          <AlertTriangle className='mt-0.5 size-4 shrink-0 text-status-warning-text' />
          <span className='text-sm font-medium text-status-warning-text'>
            {t('safetyWarning')}
          </span>
        </p>
      </div>

      <SpeciesSheet
        species={openSpecies ?? null}
        score={openSpecies ? scores?.[openSpecies.id] : undefined}
        scopeLabel={scopeLabel}
        recipes={recipes}
        onClose={() => setOpenId(null)}
      />
    </>
  );
}

/** The season each section is about, counted from today's. */
function seasonForPlace(season: Season, place: SeasonPlace): Season {
  if (place === 'next') return nextSeason(season);
  if (place === 'before') return previousSeason(season);
  if (place === 'later') return nextSeason(nextSeason(season));
  return season;
}

/** Where the year stands: the season just ended, today's with a marker at
 *  today, the next one and the one after, each a jump to its species. */
function SeasonBand({
  season,
  progress,
  counts,
  scopeLabel,
  onJump,
}: {
  season: Season;
  progress: number;
  counts: Record<SeasonPlace, number>;
  scopeLabel: string | undefined;
  onJump: (place: SeasonPlace) => void;
}) {
  const { t, i18n } = useTranslation('species');
  const line: SeasonPlace[] = ['before', 'now', 'next', 'later'];

  return (
    <section
      aria-labelledby='season-band-title'
      className={cn(BAND, 'rounded-card p-6 sm:p-8 lg:p-10')}
    >
      <h2
        id='season-band-title'
        className='text-4xl leading-none font-semibold sm:text-5xl lg:text-6xl'
      >
        {t(`seasons.${season}`)}
      </h2>
      <p className='mt-3 text-happy-100 sm:text-lg'>
        {scopeLabel
          ? t('band.summary', { count: counts.now, place: scopeLabel })
          : t('band.summaryCalendar', { count: counts.now })}
      </p>
      <ol className='mt-8 grid grid-cols-4 gap-2 sm:gap-4'>
        {line.map(place => {
          const placeSeason = seasonForPlace(season, place);
          return (
            <li key={place} className='min-w-0'>
              <button
                type='button'
                disabled={counts[place] === 0}
                onClick={() => onJump(place)}
                className='focus-ring flex w-full flex-col items-start gap-1 rounded-xl py-2 text-left transition-colors enabled:hover:bg-happy-50/10 disabled:opacity-60 sm:px-2 dark:enabled:hover:bg-happy-50/10'
              >
                {/* The bars come first so they always share one line, the
                    year read left to right, however the labels wrap. */}
                <span
                  className={cn(
                    'relative mb-3 block h-2 w-full rounded-full',
                    place === 'now'
                      ? 'bg-happy-500'
                      : 'bg-happy-50/15 dark:bg-happy-50/15'
                  )}
                >
                  {place === 'now' ? (
                    // Today, at its point in the season.
                    <span
                      className='absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-happy-50 ring-4 ring-happy-900 dark:bg-happy-50'
                      style={{ left: `${Math.round(progress * 100)}%` }}
                    />
                  ) : null}
                </span>
                <span className='type-micro text-happy-100'>
                  {t(`place.${place}`)}
                </span>
                <span
                  className={cn(
                    'font-semibold sm:text-lg',
                    place === 'now' ? 'text-happy-50' : 'text-happy-100'
                  )}
                >
                  {t(`seasons.${placeSeason}`)}
                </span>
                <span className='text-xs text-happy-100'>
                  {monthRange(seasonMonths(placeSeason), i18n.language)}
                </span>
                <span className='mt-1 text-xs text-happy-100'>
                  {t('speciesCount', { count: counts[place] })}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** A species plate: its photo, today's conditions or its months, and its
 *  worst look-alike. Opens the full sheet. */
function SpeciesTile({
  species,
  score,
  large = false,
  onOpen,
}: {
  species: Species;
  score?: number;
  large?: boolean;
  onOpen: () => void;
}) {
  const { i18n } = useTranslation('species');
  const lookalike = getWorstLookalike(species.id);
  const severity = lookalike?.severity;
  const seasons = speciesSeasons(species.season);

  return (
    <button type='button' onClick={onOpen} className={TILE_CLASS}>
      <TileFace
        image={getSpeciesImage(species.id)}
        name={species.name}
        scientificName={species.scientificName}
        large={large}
      >
        {score !== undefined ? (
          <ConditionsMeter score={score} compact />
        ) : (
          <span className='text-xs text-muted-foreground'>
            {monthsLabel(seasons, i18n.language)}
          </span>
        )}
        {lookalike && (severity === 'lethal' || severity === 'toxic') ? (
          <LookalikeTag
            scientificName={lookalike.scientificName}
            severity={severity}
            className='mt-auto'
          />
        ) : null}
      </TileFace>
    </button>
  );
}

/** A spectacle on now, on a species plate. There is nothing to forage, so no
 *  sheet: it opens the spectacle's map layer. */
function SpectacleTile({ spectacle }: { spectacle: Spectacle }) {
  const { t } = useTranslation('map');

  return (
    <Link to='/map' search={{ species: spectacle.code }} className={TILE_CLASS}>
      <TileFace
        image={getSpeciesImage(spectacle.code)}
        name={t(`${spectacle.keys}.name`)}
        scientificName={spectacle.scientificName}
        large
      >
        <LookOnlyTag />
      </TileFace>
    </Link>
  );
}

const TILE_CLASS =
  'focus-ring flex h-full w-full flex-col overflow-hidden rounded-card bg-card text-left elevation-raised elevation-interactive';

/** A plate's photo and names, over the signals its tile passes in. */
function TileFace({
  image,
  name,
  scientificName,
  large,
  children,
}: {
  image: string | null;
  name: string;
  scientificName: string;
  large: boolean;
  children: ReactNode;
}) {
  return (
    <>
      <span className='relative block aspect-square'>
        {image ? (
          <img
            src={image}
            alt=''
            loading='lazy'
            decoding='async'
            className='absolute inset-0 size-full bg-muted object-cover'
          />
        ) : null}
      </span>
      <span className={cn('flex flex-1 flex-col gap-2', large ? 'p-4' : 'p-3')}>
        <span>
          <span
            className={cn(
              'block leading-tight font-semibold hyphens-auto break-words text-foreground',
              large && 'text-lg'
            )}
          >
            {name}
          </span>
          <span className='mt-0.5 block text-xs text-muted-foreground italic'>
            {scientificName}
          </span>
        </span>
        {children}
      </span>
    </>
  );
}
