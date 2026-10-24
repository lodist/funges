import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { CategoryChips } from '@/components/CategoryChips';
import { CropSheet } from '@/components/CropSheet';
import { HuertaWeek } from '@/components/HuertaWeek';
import { ScopeHeader } from '@/components/ScopeHeader';
import SEO from '@/components/SEO';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton';
import {
  CROPS,
  cropsWith,
  huertaImage as image,
  KINDS,
  STATUS_GROUPS,
  SAMPLE_ADVICE,
  type Crop,
  type CropNeeds,
  type CropStatus,
  type PlaceAdvice,
} from '@/lib/huerta';
import { gardenWeek } from '@/lib/garden-week';
import {
  fetchAdvice,
  fetchNeeds,
  huertaApiConfigured,
  savedPlace,
  savePlace,
  searchTowns,
  type Place,
  type Town,
} from '@/lib/huerta-api';
import { MapPinned, Navigation } from '@/lib/icons';
import { chooseGarden, gardenLabel, useGardens } from '@/lib/gardens';
import { loadPlan } from '@/lib/planner';
import { nextMonth, useHuertaYear } from '@/hooks/use-huerta-year';
import { cn } from '@/lib/utils';

type Load =
  | { state: 'picking' }
  | { state: 'loading' }
  | { state: 'ready'; advice: PlaceAdvice }
  | { state: 'none' }
  | { state: 'failed' };

/** Huerta's home: this week in the garden at the visitor's place. */
export default function HuertaPage() {
  const { t, i18n } = useTranslation('huerta');
  // The place the advice is for and its day, under the title as Terra's
  // pages put their scope.
  const placeLine = (advice: PlaceAdvice) => {
    const day = new Intl.DateTimeFormat(i18n.language, {
      day: 'numeric',
      month: 'long',
    }).format(new Date(`${advice.day}T12:00:00`));
    return huertaApiConfigured
      ? t('around', { place: advice.place, day })
      : t('sample', { place: advice.place, day });
  };
  const [place, setPlace] = useState<Place | null>(() =>
    huertaApiConfigured ? savedPlace() : null
  );
  const [load, setLoad] = useState<Load>(() =>
    !huertaApiConfigured
      ? { state: 'ready', advice: SAMPLE_ADVICE }
      : place
        ? { state: 'loading' }
        : { state: 'picking' }
  );

  useEffect(() => {
    if (!huertaApiConfigured || !place) return;
    let current = true;
    setLoad({ state: 'loading' });
    fetchAdvice(place)
      .then(advice => {
        if (current)
          setLoad(advice ? { state: 'ready', advice } : { state: 'none' });
      })
      .catch(() => current && setLoad({ state: 'failed' }));
    return () => {
      current = false;
    };
  }, [place]);

  const pick = (chosen: Place) => {
    savePlace(chosen);
    setPlace({ ...chosen });
  };

  return (
    <>
      <SEO
        title={t('title')}
        description={t('description')}
        canonicalUrl={`${import.meta.env.BASE_URL}huerta`}
      />
      <div className='container mx-auto max-w-7xl px-4 py-8'>
        <header className='mb-8 flex flex-col gap-6'>
          <ScopeHeader
            title={t('title')}
            scopeLabel={
              load.state === 'ready' ? placeLine(load.advice) : undefined
            }
            action={
              huertaApiConfigured && load.state === 'ready' ? (
                <Button
                  variant='outline'
                  onClick={() => setLoad({ state: 'picking' })}
                >
                  <MapPinned />
                  {t('change')}
                </Button>
              ) : null
            }
          />
        </header>

        {load.state === 'picking' ? <PlacePicker onPick={pick} /> : null}
        {load.state === 'loading' ? (
          <SkeletonGroup>
            <Skeleton className='h-48 w-full rounded-card' />
          </SkeletonGroup>
        ) : null}
        {load.state === 'none' || load.state === 'failed' ? (
          <section className='flex flex-col items-start gap-4 rounded-card bg-card p-8 elevation-raised'>
            <p className='text-foreground'>
              {t(load.state === 'none' ? 'noPlace' : 'loadFailed')}
            </p>
            <Button
              variant='outline'
              onClick={() => setLoad({ state: 'picking' })}
            >
              {t('change')}
            </Button>
          </section>
        ) : null}
        {load.state === 'ready' ? <Advice advice={load.advice} /> : null}
      </div>
    </>
  );
}

/** Where the garden is: the device's position, or a town searched by name. */
function PlacePicker({ onPick }: { onPick: (place: Place) => void }) {
  const { t } = useTranslation('huerta');
  const [locating, setLocating] = useState(false);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [towns, setTowns] = useState<Town[]>([]);
  // The query the shown results answer: "no town" only once its search is done.
  const [answered, setAnswered] = useState('');
  const [searchFailed, setSearchFailed] = useState(false);

  useEffect(() => {
    let current = true;
    searchTowns(query).then(
      found => {
        if (!current) return;
        setTowns(found);
        setAnswered(query);
        setSearchFailed(false);
      },
      () => {
        if (!current) return;
        setTowns([]);
        setAnswered(query);
        setSearchFailed(true);
      }
    );
    return () => {
      current = false;
    };
  }, [query]);

  const locate = () => {
    setLocating(true);
    setFailed(false);
    navigator.geolocation.getCurrentPosition(
      position => {
        setLocating(false);
        onPick({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        });
      },
      () => {
        setLocating(false);
        setFailed(true);
      },
      { maximumAge: 3_600_000, timeout: 15_000 }
    );
  };

  return (
    <section className='flex max-w-xl flex-col gap-5 rounded-card bg-card p-6 elevation-raised sm:p-8'>
      <div>
        <h2 className='text-xl font-semibold'>{t('picker.title')}</h2>
        <p className='mt-1 text-sm text-muted-foreground'>{t('picker.help')}</p>
      </div>
      <div className='flex flex-col items-start gap-1'>
        <Button onClick={locate} disabled={locating}>
          <Navigation />
          {locating ? t('picker.locating') : t('picker.locate')}
        </Button>
        {failed ? (
          <p className='text-sm text-destructive-text'>
            {t('picker.locateFailed')}
          </p>
        ) : null}
      </div>
      <div className='flex flex-col gap-2'>
        <label htmlFor='huerta-town' className='text-sm font-medium'>
          {t('picker.search')}
        </label>
        <Input
          id='huerta-town'
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder={t('picker.placeholder')}
          autoComplete='off'
        />
        {towns.length > 0 ? (
          <ul className='flex flex-col gap-1'>
            {towns.map(town => (
              <li key={`${town.name}_${town.lat}_${town.lon}`}>
                <Button
                  variant='ghost'
                  className='w-full justify-between'
                  onClick={() => onPick(town)}
                >
                  <span>{town.name}</span>
                  <span className='text-xs text-muted-foreground'>
                    {[town.province, town.country].filter(Boolean).join(', ')}
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        ) : answered === query && searchFailed ? (
          <p className='text-sm text-destructive-text'>
            {t('picker.searchFailed')}
          </p>
        ) : answered === query && query.trim().length >= 3 ? (
          <p className='text-sm text-muted-foreground'>
            {t('picker.noResults')}
          </p>
        ) : null}
      </div>
    </section>
  );
}

/** In Season's filters: everything, or one list (harvest only with the
 *  place's calendar). */
type View = 'all' | 'sow' | 'plant' | 'harvest';

function Advice({ advice }: { advice: PlaceAdvice }) {
  const { t, i18n } = useTranslation('huerta');
  const year = useHuertaYear();
  const [view, setView] = useState<View>('all');
  const [kind, setKind] = useState<string>('all');
  const { gardens, current } = useGardens();
  const [open, setOpen] = useState<Crop | null>(null);
  const pick = (statuses: CropStatus[]) =>
    cropsWith(advice, statuses).filter(
      crop => kind === 'all' || crop.kind === kind
    );
  const now = pick(STATUS_GROUPS.now);
  const waiting = pick(STATUS_GROUPS.wait);
  const over = pick(STATUS_GROUPS.over);
  // Picked around here this month, from the place's calendar, and until when.
  const month = new Date().getMonth();
  const picked = (id: string) => year?.crops[id]?.harvest ?? 0;
  const harvesting = CROPS.filter(
    crop =>
      (kind === 'all' || crop.kind === kind) && (picked(crop.id) >> month) & 1
  );
  const until = (id: string) => {
    let last = month;
    for (let k = 1; k < 12 && (picked(id) >> (month + k) % 12) & 1; k++)
      last = (month + k) % 12;
    return picked(id) === 0xfff
      ? t('views.allYear')
      : t('views.until', {
          month: new Intl.DateTimeFormat(i18n.language, {
            month: 'long',
          }).format(new Date(2026, last, 1)),
        });
  };
  const views: View[] = year
    ? ['all', 'sow', 'plant', 'harvest']
    : ['all', 'sow', 'plant'];
  const list =
    view === 'sow' || view === 'plant'
      ? now.filter(crop => crop.how === view)
      : view === 'harvest'
        ? harvesting
        : null;
  return (
    <>
      <HuertaWeek advice={advice} />

      <GardenLine advice={advice} year={year} />

      <CategoryChips
        chips={views.map(value => ({
          value,
          label: t(
            value === 'sow' || value === 'plant'
              ? `sheet.${value}Now`
              : `views.${value}`
          ),
        }))}
        value={view}
        onChange={value => setView(value as View)}
        className='mt-6 justify-start'
      />
      <CategoryChips
        chips={KINDS.map(value => ({
          value,
          label: t(`kinds.${value}`),
          icon: image(`kinds/${value}`),
        }))}
        value={kind}
        onChange={setKind}
        className='mt-3 justify-start'
      />
      {/* Which garden, when there are more: each its own place's week. */}
      {gardens.length > 1 ? (
        <CategoryChips
          chips={gardens.map(garden => ({
            value: garden.id,
            label: gardenLabel(t, gardens, garden),
          }))}
          value={current?.id ?? ''}
          onChange={chooseGarden}
          className='mt-3 justify-start'
        />
      ) : null}

      {list ? (
        <section className='mt-10'>
          <SectionTitle
            title={t(view === 'harvest' ? 'views.harvest' : `sheet.${view}Now`)}
            count={list.length}
          />
          {list.length > 0 ? (
            <CropGrid
              crops={list}
              onOpen={setOpen}
              note={view === 'harvest' ? crop => until(crop.id) : undefined}
              how={view !== 'harvest'}
            />
          ) : (
            <p className='text-muted-foreground'>{t('views.none')}</p>
          )}
        </section>
      ) : (
        <section className='mt-10'>
          <SectionTitle title={t('now.title')} count={now.length} />
          {now.length > 0 ? (
            <CropGrid crops={now} onOpen={setOpen} />
          ) : (
            <p className='text-muted-foreground'>{t('now.none')}</p>
          )}
        </section>
      )}

      {!list && waiting.length > 0 ? (
        <section className='mt-10'>
          <SectionTitle title={t('waiting.title')} count={waiting.length} />
          <CropGrid
            crops={waiting}
            onOpen={setOpen}
            note={crop => t(`status.${advice.crops[crop.id]}`)}
          />
        </section>
      ) : null}

      {!list && over.length > 0 ? (
        <TooLate crops={over} advice={advice} onOpen={setOpen} year={year} />
      ) : null}

      <CropSheet
        crop={open}
        advice={advice}
        year={open && year ? year.crops[open.id] : undefined}
        image={crop => image(`crops/${crop.id}`)}
        onClose={() => setOpen(null)}
      />
    </>
  );
}

/** Your garden's week lives on My garden: this says whether it has jobs
 *  this week, or how to start, with the way there. */
function GardenLine({
  advice,
  year,
}: {
  advice: PlaceAdvice;
  year: ReturnType<typeof useHuertaYear>;
}) {
  const { t } = useTranslation('huerta');
  const [plan] = useState(() => loadPlan());
  const [needs, setNeeds] = useState<Record<string, CropNeeds>>({});
  useEffect(() => {
    if (!huertaApiConfigured || !plan) return;
    let live = true;
    fetchNeeds()
      .then(n => live && setNeeds(n))
      .catch(() => {}); // frost jobs wait for the crops' frost classes
    return () => {
      live = false;
    };
  }, [plan]);
  const jobs = plan
    ? gardenWeek(
        plan,
        advice,
        needs,
        new Date().toLocaleDateString('sv'),
        year
        // As My garden counts them: "ready in N weeks" is under Coming up.
      ).filter(task => !(task.kind === 'stage' && task.step === 'harvestSoon'))
    : [];
  return (
    <p className='mt-6 text-sm text-muted-foreground'>
      {t(
        !plan
          ? 'week.todo.noPlan'
          : jobs.length
            ? 'week.garden.some'
            : 'week.garden.none'
      )}{' '}
      <Link
        to='/huerta/planner'
        className='font-medium text-primary-text underline underline-offset-4'
      >
        {t('week.todo.openPlanner')}
      </Link>
    </p>
  );
}

function SectionTitle({ title, count }: { title: string; count: number }) {
  const { t } = useTranslation('huerta');
  return (
    <div className='mb-4 flex items-baseline justify-between gap-4'>
      <h2 className='text-xl font-semibold'>{title}</h2>
      <span className='text-sm text-muted-foreground'>
        {t('count', { count })}
      </span>
    </div>
  );
}

/** The Species page's plate, as a button that opens the crop's sheet. */
const TILE_CLASS =
  'focus-ring flex h-full w-full flex-col overflow-hidden rounded-card bg-card text-left elevation-raised elevation-interactive';

function CropGrid({
  crops,
  onOpen,
  note,
  out = false,
  how = true,
}: {
  crops: Crop[];
  onOpen: (crop: Crop) => void;
  /** A line under the crop's name: why it waits, or why it is out. */
  note?: (crop: Crop) => string | undefined;
  /** Its season is over here: the photo is greyed. */
  out?: boolean;
  /** Whether it says how it goes in (sow or plant); not for the harvest. */
  how?: boolean;
}) {
  const { t } = useTranslation('huerta');
  return (
    <ul className='grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6'>
      {crops.map(crop => {
        const line = note?.(crop);
        return (
          <li key={crop.id}>
            <button
              type='button'
              onClick={() => onOpen(crop)}
              className={TILE_CLASS}
            >
              <img
                src={image(`crops/${crop.id}`)}
                alt=''
                loading='lazy'
                decoding='async'
                className={cn(
                  'aspect-square w-full bg-muted object-cover',
                  out && 'opacity-80 grayscale'
                )}
              />
              <span className='flex flex-1 flex-col items-start gap-2 p-3'>
                <span>
                  <span className='block leading-tight font-semibold hyphens-auto break-words text-foreground'>
                    {t(`crops.${crop.id}`)}
                  </span>
                  <span className='mt-0.5 block text-xs text-muted-foreground italic'>
                    {crop.scientific}
                  </span>
                </span>
                {line ? (
                  <span className='block text-sm text-muted-foreground'>
                    {line}
                  </span>
                ) : null}
                {out || !how ? null : (
                  <Badge variant='secondary' className='mt-auto'>
                    {t(`how.${crop.how}`)}
                  </Badge>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** How many greyed plates show before "Show all": one row on a wide screen. */
const OVER_SHOWN = 6;

/** Crops whose season is over here, as greyed plates. */
function TooLate({
  crops,
  advice,
  onOpen,
  year,
}: {
  crops: Crop[];
  advice: PlaceAdvice;
  onOpen: (crop: Crop) => void;
  year: ReturnType<typeof useHuertaYear>;
}) {
  const { t, i18n } = useTranslation('huerta');
  // When its time comes back here, from the place's year.
  const backIn = (crop: Crop) => {
    const mask = year?.crops[crop.id]?.sow;
    const m = mask ? nextMonth(mask, new Date().getMonth()) : null;
    return m === null
      ? undefined
      : t('year.backIn', {
          month: new Intl.DateTimeFormat(i18n.language, {
            month: 'long',
          }).format(new Date(2026, m, 1)),
        });
  };
  const [all, setAll] = useState(false);
  return (
    <section className='mt-10'>
      <SectionTitle title={t('over.title')} count={crops.length} />
      <CropGrid
        crops={all ? crops : crops.slice(0, OVER_SHOWN)}
        onOpen={onOpen}
        out
        note={crop =>
          advice.crops[crop.id] === 'not_here'
            ? t('status.not_here')
            : backIn(crop)
        }
      />
      {!all && crops.length > OVER_SHOWN ? (
        <Button variant='outline' className='mt-4' onClick={() => setAll(true)}>
          {t('over.show', { count: crops.length })}
        </Button>
      ) : null}
    </section>
  );
}
