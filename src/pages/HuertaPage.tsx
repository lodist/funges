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
  cropsWith,
  huertaImage as image,
  KINDS,
  STATUS_GROUPS,
  weekday,
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
import {
  CloudRain,
  Droplets,
  MapPinned,
  Navigation,
  Snowflake,
  Sprout,
} from '@/lib/icons';
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
              load.state === 'ready' && huertaApiConfigured ? (
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

function Advice({ advice }: { advice: PlaceAdvice }) {
  const { t } = useTranslation('huerta');
  const year = useHuertaYear();
  const [kind, setKind] = useState<string>('all');
  const [open, setOpen] = useState<Crop | null>(null);
  const pick = (statuses: CropStatus[]) =>
    cropsWith(advice, statuses).filter(
      crop => kind === 'all' || crop.kind === kind
    );
  const now = pick(STATUS_GROUPS.now);
  const waiting = pick(STATUS_GROUPS.wait);
  const over = pick(STATUS_GROUPS.over);
  return (
    <>
      <HuertaWeek advice={advice} />

      <ToDo advice={advice} year={year} />

      <CategoryChips
        chips={KINDS.map(value => ({
          value,
          label: t(`kinds.${value}`),
          icon: image(`kinds/${value}`),
        }))}
        value={kind}
        onChange={setKind}
        className='mt-6 justify-start'
      />

      <section className='mt-10'>
        <SectionTitle title={t('now.title')} count={now.length} />
        {now.length > 0 ? (
          <CropGrid crops={now} onOpen={setOpen} />
        ) : (
          <p className='text-muted-foreground'>{t('now.none')}</p>
        )}
      </section>

      {waiting.length > 0 ? (
        <section className='mt-10'>
          <SectionTitle title={t('waiting.title')} count={waiting.length} />
          <CropGrid
            crops={waiting}
            onOpen={setOpen}
            note={crop => t(`status.${advice.crops[crop.id]}`)}
          />
        </section>
      ) : null}

      {over.length > 0 ? (
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

/** "To do this week": what the visitor's planted crops need, from the
 *  forecast, their plan and how far each crop has grown. Without a plan, a
 *  pointer to the planner. */
function ToDo({
  advice,
  year,
}: {
  advice: PlaceAdvice;
  year: ReturnType<typeof useHuertaYear>;
}) {
  const { t, i18n } = useTranslation('huerta');
  const [plan] = useState(() => loadPlan());
  const [needs, setNeeds] = useState<Record<string, CropNeeds>>({});
  useEffect(() => {
    if (!huertaApiConfigured || !plan) return;
    let live = true;
    fetchNeeds()
      .then(n => live && setNeeds(n))
      .catch(() => {}); // frost reminders wait for the crops' frost classes
    return () => {
      live = false;
    };
  }, [plan]);

  if (!plan)
    return (
      <p className='mt-6 text-sm text-muted-foreground'>
        {t('week.todo.noPlan')}{' '}
        <Link
          to='/huerta/planner'
          className='font-medium text-primary-text underline underline-offset-4'
        >
          {t('week.todo.openPlanner')}
        </Link>
      </p>
    );

  const tasks = gardenWeek(
    plan,
    advice,
    needs,
    new Date().toLocaleDateString('sv'),
    year
  );
  const names = (ids: string[]) => ids.map(id => t(`crops.${id}`)).join(', ');
  return (
    <section className='mt-10'>
      <h2 className='mb-4 text-xl font-semibold'>{t('week.todo.title')}</h2>
      {tasks.length === 0 ? (
        <p className='text-muted-foreground'>{t('week.todo.nothing')}</p>
      ) : (
        <ul className='flex flex-col gap-3'>
          {tasks.map(task => {
            const [Icon, title, text, from] =
              task.kind === 'frost'
                ? [
                    Snowflake,
                    t(`week.todo.frost.${task.level}`),
                    t('week.todo.frost.text', { crops: names(task.crops) }),
                    'forecast',
                  ]
                : task.kind === 'laterFrost'
                  ? [
                      Snowflake,
                      t('week.todo.laterFrost.title', {
                        night: weekday(task.night, i18n.language),
                      }),
                      t('week.todo.laterFrost.text', {
                        crops: names(task.crops),
                      }),
                      'forecast',
                    ]
                  : task.kind === 'water'
                    ? [
                        Droplets,
                        t('week.todo.water.title', { mm: task.mm }),
                        t('week.todo.water.text'),
                        'forecast',
                      ]
                    : task.kind === 'rain'
                      ? [
                          CloudRain,
                          t('week.todo.rain.title', { mm: task.mm }),
                          t('week.todo.rain.text'),
                          'forecast',
                        ]
                      : task.kind === 'plantNow'
                        ? [
                            Sprout,
                            t('week.todo.plantNow.title'),
                            names(task.crops),
                            'plan',
                          ]
                        : task.kind === 'stage'
                          ? [
                              null,
                              t(`week.todo.stage.${task.step}.title`, {
                                crop: t(`crops.${task.crop}`),
                                count: task.weeks,
                              }),
                              t(`week.todo.stage.${task.step}.text`, {
                                count: task.weeks,
                                cm: task.cm,
                              }),
                              'plan',
                            ]
                          : [
                              null,
                              t('week.todo.sowAgain.title', {
                                crop: t(`crops.${task.crop}`),
                              }),
                              t('week.todo.sowAgain.text', {
                                weeks: task.weeks,
                              }),
                              'plan',
                            ];
            return (
              <li
                key={
                  task.kind +
                  ('crop' in task ? task.crop : '') +
                  ('step' in task ? task.step : '')
                }
                className='grid grid-cols-[2.75rem_minmax(0,1fr)] items-center gap-4 rounded-card bg-card p-3 elevation-raised sm:grid-cols-[2.75rem_minmax(0,1fr)_auto]'
              >
                {Icon ? (
                  <span className='grid size-11 place-items-center rounded-lg bg-muted text-primary-text'>
                    <Icon className='size-5' />
                  </span>
                ) : (
                  <img
                    src={image(`crops/${'crop' in task ? task.crop : ''}`)}
                    alt=''
                    className='size-11 rounded-lg object-cover'
                  />
                )}
                <span className='min-w-0'>
                  <span className='block font-semibold text-foreground'>
                    {title}
                  </span>
                  <span className='block text-sm text-muted-foreground'>
                    {text}
                  </span>
                </span>
                <Badge
                  variant='secondary'
                  className='col-start-2 justify-self-start sm:col-start-auto'
                >
                  {t(`week.todo.from.${from}`)}
                </Badge>
              </li>
            );
          })}
        </ul>
      )}
    </section>
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
}: {
  crops: Crop[];
  onOpen: (crop: Crop) => void;
  /** A line under the crop's name: why it waits, or why it is out. */
  note?: (crop: Crop) => string | undefined;
  /** Its season is over here: the photo is greyed. */
  out?: boolean;
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
                {out ? null : (
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
