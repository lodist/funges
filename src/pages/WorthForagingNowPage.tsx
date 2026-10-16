import {
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';
import { Link } from '@tanstack/react-router';
import { Trans, useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import SEO from '@/components/SEO';
import { CategoryChips } from '@/components/CategoryChips';
import { useSpeciesData } from '@/data/species';
import { useRecipesData } from '@/data/recipes';
import {
  compassPoint,
  fetchWorthForagingNowRecommendations,
  type ForagingFocus,
  type RecommendationContext,
  type WorthForagingNowRecommendation,
} from '@/lib/worth-foraging-now';
import { CATEGORY_ICONS } from '@/lib/categoryIcons';
import { Button } from '@/components/ui/button';
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CalendarRange,
  ChefHat,
  MapPinned,
  Navigation,
  Sprout,
} from '@/lib/icons';
import { cn, getSpeciesImage } from '@/lib/utils';
import { useMapStore } from '@/store/mapStore';

type Pick = WorthForagingNowRecommendation;
// `band` is the landing's deep-green field (happy-900 under happy-50 text);
// `paper` is an ordinary card.
type Tone = 'band' | 'paper';

const FOCUSES: readonly { value: ForagingFocus; icon: string }[] = [
  { value: 'mixed', icon: CATEGORY_ICONS.all },
  { value: 'mushrooms', icon: CATEGORY_ICONS.mushroom },
  { value: 'plants', icon: CATEGORY_ICONS.plant },
  { value: 'berries', icon: CATEGORY_ICONS.berry },
];

// --ring (--happy-700) reads 1.9:1 on happy-900, so the band re-points it to
// the step the landing's forecast band uses. The band is happy-900 in both
// themes, so its happy-50 washes are too: their `dark:` twins repeat the light
// value on purpose, which is what theme-blind-fill.test.ts asks a call site to say.
const BAND = 'bg-happy-900 text-happy-50 [--ring:var(--happy-100)]';
// `outline` paints its stroke and label in --primary-text, which vanishes on
// the band; happy-100 holds the same stroke there.
const BAND_OUTLINE =
  'border-happy-100 text-happy-50 hover:bg-happy-50/10 hover:text-happy-50 dark:bg-transparent dark:hover:bg-happy-50/10 dark:hover:text-happy-50';

/** "today" / "yesterday": calendar days between the scoring day and the
 *  reader's own date, so a midnight-UTC stamp never reads as yesterday. */
function scoringDayLabel(iso: string | null, language: string) {
  if (!iso) return null;
  const day = (ymd: string) => Date.parse(`${ymd}T00:00:00Z`) / 86_400_000;
  const today = new Date().toLocaleDateString('en-CA');
  return new Intl.RelativeTimeFormat(language, { numeric: 'auto' }).format(
    Math.round(day(iso.slice(0, 10)) - day(today)),
    'day'
  );
}

function whereLabel(pick: Pick, t: TFunction) {
  if (pick.distanceKm === null) return null;
  const distance = Math.max(1, Math.round(pick.distanceKm));
  // Under 2 km the bearing is grid noise, not a direction worth walking.
  if (pick.bearingDeg === null || pick.distanceKm < 2) {
    return t('worthForagingNow.distanceValue', { distance });
  }
  return t('worthForagingNow.distanceToward', {
    distance,
    direction: t(
      `worthForagingNow.directions.${compassPoint(pick.bearingDeg)}`
    ),
  });
}

const mapSearch = (pick: Pick) => ({
  species: pick.speciesId,
  lat: pick.coordinate[1],
  lng: pick.coordinate[0],
  zoom: 8,
});

export default function WorthForagingNowPage() {
  const { t, i18n } = useTranslation(['common', 'species']);
  const species = useSpeciesData();
  const recipes = useRecipesData();
  const center = useMapStore(state => state.center);
  const userLocation = useMapStore(state => state.userLocation);
  const getUserLocation = useMapStore(state => state.getUserLocation);
  const [focus, setFocus] = useState<ForagingFocus>('mixed');
  const [recommendations, setRecommendations] = useState<Pick[]>([]);
  const [context, setContext] = useState<RecommendationContext | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationFailed, setLocationFailed] = useState(false);

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

  const chips = useMemo(
    () =>
      FOCUSES.map(({ value, icon }) => ({
        value,
        icon,
        label: t(`worthForagingNow.focus.${value}`),
      })),
    [t]
  );

  // The store only learns a position from the map's locate control, so a
  // visitor who lands here first never got the nearby picks.
  const locate = () => {
    setLocating(true);
    setLocationFailed(false);
    getUserLocation()
      .catch(() => setLocationFailed(true))
      .finally(() => setLocating(false));
  };

  const scopeLabel = context
    ? context.scope === 'radius'
      ? t('worthForagingNow.scopeRadius', { radius: context.radiusKm ?? 100 })
      : context.regionLabel
    : null;
  const scoringDay = scoringDayLabel(
    context?.referenceDate ?? null,
    i18n.language
  );

  return (
    <>
      <SEO
        title={t('worthForagingNow.title')}
        description={t('worthForagingNow.description')}
        canonicalUrl={`${import.meta.env.BASE_URL}worth-foraging-now`}
      />
      <div className='container mx-auto max-w-7xl px-4 py-8'>
        <header className='mb-8 flex flex-col gap-6'>
          <div className='flex flex-wrap items-end justify-between gap-x-8 gap-y-4'>
            <div className='min-w-0 max-w-3xl'>
              <h1 className='text-3xl font-semibold leading-tight text-balance text-foreground sm:text-4xl'>
                {t('worthForagingNow.title')}
              </h1>
              {scopeLabel ? (
                <p className='mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground'>
                  <MapPinned className='size-4 text-primary-text' />
                  <span className='font-medium text-foreground'>
                    {scopeLabel}
                  </span>
                  {scoringDay ? (
                    <>
                      <span aria-hidden='true'>{'·'}</span>
                      <span>
                        {t('map:updatedAt')} {scoringDay}
                      </span>
                    </>
                  ) : null}
                </p>
              ) : null}
            </div>
            {!userLocation ? (
              <div className='flex flex-col items-start gap-1'>
                <Button variant='outline' onClick={locate} disabled={locating}>
                  <Navigation />
                  {locating
                    ? t('worthForagingNow.locating')
                    : t('worthForagingNow.useLocation')}
                </Button>
                {locationFailed ? (
                  <p className='text-sm text-destructive-text'>
                    {t('worthForagingNow.locationFailed')}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
          <div role='group' aria-label={t('worthForagingNow.focus.label')}>
            <CategoryChips
              chips={chips}
              value={focus}
              onChange={value => setFocus(value as ForagingFocus)}
              className='justify-start'
            />
          </div>
        </header>

        {isLoading ? <PicksSkeleton /> : null}

        {!isLoading && loadError ? (
          <section className='rounded-card border border-destructive/20 bg-destructive/5 p-6 text-sm text-destructive-text'>
            {loadError}
          </section>
        ) : null}

        {!isLoading && !loadError && recommendations.length === 0 ? (
          <section className='flex flex-col items-start gap-4 rounded-card bg-card p-8 elevation-raised'>
            <p className='text-foreground'>{t('worthForagingNow.noData')}</p>
            {focus !== 'mixed' ? (
              <Button variant='outline' onClick={() => setFocus('mixed')}>
                {t('species:allTypes')}
              </Button>
            ) : null}
          </section>
        ) : null}

        {!isLoading && !loadError && recommendations.length > 0 ? (
          <FrontPage picks={recommendations} />
        ) : null}

        <p className='mt-10 flex items-start gap-2 rounded-lg bg-status-warning-background px-3 py-2 ring-2 ring-status-warning-border/60'>
          <AlertTriangle className='mt-0.5 size-4 shrink-0 text-status-warning-text' />
          <span className='text-sm font-medium text-status-warning-text'>
            {t('species:safetyWarning')}
          </span>
        </p>
      </div>
    </>
  );
}

/** Today's best pick as the front page; the next two and the rest follow. */
function FrontPage({ picks }: { picks: Pick[] }) {
  const { t } = useTranslation('common');
  const [lead, ...rest] = picks;
  const bench = rest.slice(0, 2);
  const more = rest.slice(2);

  return (
    <div className='flex flex-col gap-5'>
      <LeadPick pick={lead} />

      {bench.length > 0 ? (
        <div className='grid gap-5 md:grid-cols-2'>
          {bench.map(pick => (
            <BenchCard key={pick.speciesId} pick={pick} />
          ))}
        </div>
      ) : null}

      {more.length > 0 ? (
        <section aria-labelledby='worth-foraging-more' className='mt-6'>
          <h2
            id='worth-foraging-more'
            className='mb-4 text-xl font-semibold text-foreground'
          >
            {t('worthForagingNow.alsoGood')}
          </h2>
          <ul
            className={cn(
              'grid grid-cols-2 gap-4 sm:grid-cols-3',
              // A short strip (one type chosen) fills its line with row tiles.
              more.length > 3 ? 'lg:grid-cols-6' : 'lg:grid-cols-3'
            )}
          >
            {more.map(pick => (
              <li key={pick.speciesId}>
                <PickTile pick={pick} row={more.length <= 3} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/** Today's best pick on the band: photo, conditions, where, look-alike,
 *  dish and actions. */
function LeadPick({ pick }: { pick: Pick }) {
  const { t } = useTranslation('common');
  const where = whereLabel(pick, t);

  return (
    <article
      className={cn(
        BAND,
        'grid overflow-hidden rounded-card elevation-raised md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]'
      )}
    >
      {/* Square below md: the photos are square, and a crop took the
          dandelion's flower head off. */}
      <div className='relative aspect-square min-w-0 md:aspect-auto md:min-h-[26rem]'>
        <PickPhoto pick={pick} eager alt='' className='absolute inset-0' />
      </div>
      <div className='flex min-w-0 flex-col gap-6 p-6 sm:p-8 lg:p-10'>
        <div>
          <h2 className='text-4xl font-semibold leading-[1.05] text-balance hyphens-auto break-words text-happy-50 sm:text-5xl lg:text-6xl'>
            {pick.speciesName}
          </h2>
          <p className='mt-2 italic text-happy-100'>{pick.scientificName}</p>
        </div>

        <ConditionsMeter pick={pick} tone='band' />

        <dl className='grid gap-4 sm:grid-cols-2'>
          {where ? (
            <Fact icon={MapPinned} label={t('worthForagingNow.bestPoint')}>
              <span className='inline-flex items-center gap-1.5'>
                {pick.bearingDeg !== null &&
                pick.distanceKm !== null &&
                pick.distanceKm >= 2 ? (
                  // North is up: the arrow points the way to walk.
                  <ArrowRight
                    className='size-4 shrink-0'
                    style={{ rotate: `${pick.bearingDeg - 90}deg` }}
                  />
                ) : null}
                {where}
              </span>
            </Fact>
          ) : null}
          {pick.habitatLabel ? (
            <Fact icon={Sprout} label={t('worthForagingNow.lookIn')}>
              {pick.habitatLabel}
            </Fact>
          ) : null}
          <Fact
            icon={CalendarRange}
            label={t('worthForagingNow.bestWindow')}
            className='sm:col-span-2'
          >
            {pick.bestWindow}
          </Fact>
        </dl>

        {pick.lookalike ? <LookalikeNotice lookalike={pick.lookalike} /> : null}

        <Kitchen recipes={pick.recipes} />

        <PickActions pick={pick} tone='band' className='mt-auto' />
      </div>
    </article>
  );
}

/** The two runners-up: a square photo beside the essentials. */
function BenchCard({ pick }: { pick: Pick }) {
  const { t } = useTranslation('common');
  const where = whereLabel(pick, t);

  return (
    <article className='flex flex-col overflow-hidden rounded-card bg-card elevation-raised sm:flex-row'>
      <div className='relative aspect-[16/9] shrink-0 sm:aspect-auto sm:w-44'>
        <PickPhoto pick={pick} alt='' className='absolute inset-0' />
      </div>
      <div className='flex min-w-0 flex-1 flex-col gap-4 p-5'>
        <div>
          <h2 className='text-2xl font-semibold leading-tight text-balance hyphens-auto break-words text-foreground'>
            {pick.speciesName}
          </h2>
          <p className='text-sm italic text-muted-foreground'>
            {pick.scientificName}
          </p>
        </div>
        <ConditionsMeter pick={pick} tone='paper' />
        {where ? (
          <p className='flex items-center gap-2 text-sm text-foreground'>
            <MapPinned className='size-4 shrink-0 text-primary-text' />
            {where}
          </p>
        ) : null}
        {pick.lookalike ? <LookalikeNotice lookalike={pick.lookalike} /> : null}
        <PickActions pick={pick} tone='paper' className='mt-auto' />
      </div>
    </article>
  );
}

/** A compact pick that is itself the map link. `row` lays it out sideways,
 *  so a short strip fills its line without out-sizing the runners-up. */
function PickTile({ pick, row = false }: { pick: Pick; row?: boolean }) {
  const { t } = useTranslation('common');
  const where = whereLabel(pick, t);
  const severity = pick.lookalike?.severity;

  return (
    <Link
      to='/map'
      search={mapSearch(pick)}
      className={cn(
        'focus-ring flex h-full flex-col overflow-hidden rounded-card bg-card elevation-raised elevation-interactive',
        row && 'lg:flex-row'
      )}
    >
      <span
        className={cn(
          'relative block aspect-square',
          row && 'lg:aspect-auto lg:w-32 lg:shrink-0'
        )}
      >
        <PickPhoto pick={pick} alt='' className='absolute inset-0' />
      </span>
      <span className='flex flex-1 flex-col gap-2 p-3'>
        <span className='flex items-start justify-between gap-2 font-semibold leading-tight text-foreground'>
          <span className='min-w-0 hyphens-auto break-words'>
            {pick.speciesName}
          </span>
          <ArrowUpRight className='mt-0.5 size-4 shrink-0 text-primary-text' />
        </span>
        <ConditionsMeter pick={pick} tone='paper' compact />
        {where ? (
          <span className='text-xs text-muted-foreground'>{where}</span>
        ) : null}
        {pick.lookalike && (severity === 'lethal' || severity === 'toxic') ? (
          <span className='mt-auto flex items-start gap-1.5 rounded-lg bg-status-warning-background px-2 py-1.5 text-xs text-status-warning-text ring-1 ring-status-warning-border/60'>
            <AlertTriangle className='mt-px size-3 shrink-0' />
            <span>
              <span className='font-semibold'>
                {t(`worthForagingNow.lookalikeBadge.${severity}`)}
              </span>{' '}
              <i>{pick.lookalike.scientificName}</i>
            </span>
          </span>
        ) : null}
      </span>
    </Link>
  );
}

function PickPhoto({
  pick,
  alt,
  eager = false,
  className,
}: {
  pick: Pick;
  alt: string;
  eager?: boolean;
  className?: string;
}) {
  const src = getSpeciesImage(pick.speciesId);
  if (!src) return null;
  return (
    <img
      src={src}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding='async'
      className={cn('size-full bg-muted object-cover', className)}
    />
  );
}

/** Ten steps of one green: the score as depth, never as a new hue. */
function ConditionsMeter({
  pick,
  tone,
  compact = false,
}: {
  pick: Pick;
  tone: Tone;
  compact?: boolean;
}) {
  const { t } = useTranslation('common');
  const band = tone === 'band';
  const filled = Math.round(pick.score);
  const label = t(`worthForagingNow.conditions.${pick.confidence}`);

  return (
    <div
      className={cn(
        'flex items-center',
        compact ? 'gap-2' : 'flex-wrap gap-x-3 gap-y-1.5'
      )}
    >
      <span
        aria-hidden='true'
        className={cn(
          'flex shrink-0',
          compact ? 'w-24 gap-0.5' : 'w-36 gap-1 sm:w-44'
        )}
      >
        {Array.from({ length: 10 }, (_, step) => (
          <span
            key={step}
            className={cn(
              'flex-1 rounded-full',
              compact ? 'h-1.5' : 'h-2',
              step < filled
                ? band
                  ? 'bg-happy-500'
                  : 'bg-primary-text'
                : band
                  ? 'bg-happy-50/15 dark:bg-happy-50/15'
                  : 'bg-muted'
            )}
          />
        ))}
      </span>
      <span
        className={cn(
          'min-w-0 font-medium',
          compact ? 'text-xs' : 'text-sm',
          band ? 'text-happy-50' : 'text-foreground'
        )}
      >
        <span className={compact ? 'sr-only' : undefined}>
          {label}
          {' · '}
        </span>
        <span className='tabular-nums'>{pick.score}</span>
      </span>
    </div>
  );
}

/** A labelled fact on the band. */
function Fact({
  icon: Icon,
  label,
  className,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('flex gap-3', className)}>
      <Icon className='mt-0.5 size-4 shrink-0 text-happy-300' />
      <div className='min-w-0'>
        <dt className='type-micro text-happy-100'>{label}</dt>
        <dd className='mt-1 text-sm text-happy-50'>{children}</dd>
      </div>
    </div>
  );
}

/** The worst toxic look-alike, in IdentifyPanel's permanent-notice treatment. */
function LookalikeNotice({
  lookalike,
}: {
  lookalike: NonNullable<Pick['lookalike']>;
}) {
  const { t } = useTranslation(['common', 'identify']);
  const severity = {
    lethal: t('identify:results.lethalLabel'),
    toxic: t('identify:results.toxicLabel'),
    inedible: t('identify:results.inedibleLabel'),
  }[lookalike.severity];

  return (
    <p className='flex items-start gap-2 rounded-lg bg-status-warning-background px-3 py-2 text-sm text-status-warning-text ring-2 ring-status-warning-border/60'>
      <AlertTriangle className='mt-0.5 size-4 shrink-0' />
      <span>
        <Trans
          t={t}
          i18nKey='worthForagingNow.lookalike'
          values={{ species: lookalike.scientificName }}
          components={{ i: <i /> }}
        />
        {' · '}
        <span className='font-semibold'>{severity}</span>
      </span>
    </p>
  );
}

/** The dishes a pick goes into, as photo pills on the band. */
function Kitchen({ recipes }: { recipes: Pick['recipes'] }) {
  const { t } = useTranslation('common');
  if (recipes.length === 0) return null;

  return (
    <div>
      <p className='type-micro flex items-center gap-2 text-happy-100'>
        <ChefHat className='size-4 shrink-0 text-happy-300' />
        {t('worthForagingNow.kitchenPayoff')}
      </p>
      <ul className='mt-2 flex flex-wrap gap-2'>
        {recipes.map(recipe => (
          <li key={recipe.id} className='min-w-0 max-w-full'>
            <Link
              to='/recipes'
              search={{ q: recipe.title }}
              className='focus-ring flex min-h-12 items-center gap-3 rounded-full bg-happy-50/10 py-1 pl-1 pr-4 text-sm font-medium text-happy-50 transition-colors hover:bg-happy-50/20 dark:bg-happy-50/10 dark:hover:bg-happy-50/20'
            >
              {recipe.image ? (
                <img
                  src={recipe.image}
                  alt=''
                  loading='lazy'
                  decoding='async'
                  className='size-10 shrink-0 rounded-full object-cover'
                />
              ) : null}
              <span className='line-clamp-2 leading-tight'>{recipe.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PickActions({
  pick,
  tone,
  className,
}: {
  pick: Pick;
  tone: Tone;
  className?: string;
}) {
  const { t } = useTranslation('common');
  return (
    <div className={cn('flex flex-wrap gap-3', className)}>
      <Button asChild>
        <Link to='/map' search={mapSearch(pick)}>
          {t('worthForagingNow.openMap')}
          <ArrowUpRight />
        </Link>
      </Button>
      <Button
        asChild
        variant='outline'
        className={tone === 'band' ? BAND_OUTLINE : undefined}
      >
        <Link to='/species' search={{ q: pick.speciesName }}>
          {t('worthForagingNow.reviewSpecies')}
        </Link>
      </Button>
    </div>
  );
}

/** Holds the loaded footprint, so arrival does not shove the page. */
function PicksSkeleton() {
  const { t } = useTranslation('common');
  return (
    <SkeletonGroup
      label={t('worthForagingNow.loading')}
      className='flex flex-col gap-5'
    >
      <div className='grid overflow-hidden rounded-card bg-card elevation-raised md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]'>
        <Skeleton className='aspect-square w-full rounded-none md:aspect-auto md:h-[30rem]' />
        <div className='flex flex-col gap-5 p-6 sm:p-8 lg:p-10'>
          <Skeleton className='h-12 w-2/3' />
          <Skeleton className='h-4 w-1/3' />
          <Skeleton className='h-2 w-44' />
          <Skeleton className='h-16 w-full' />
          <Skeleton className='mt-auto h-11 w-48 rounded-full' />
        </div>
      </div>
      <div className='grid gap-5 md:grid-cols-2'>
        {[0, 1].map(placeholder => (
          <Skeleton key={placeholder} className='h-56 rounded-card' />
        ))}
      </div>
    </SkeletonGroup>
  );
}
