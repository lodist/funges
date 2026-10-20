import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import SEO from '@/components/SEO';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton';
import { BAND_SURFACE_CLASS } from '@/lib/band-surface';
import {
  cropsWith,
  SAMPLE_ADVICE,
  type Crop,
  type CropStatus,
  type PlaceAdvice,
} from '@/lib/huerta';
import {
  fetchAdvice,
  huertaApiConfigured,
  savedPlace,
  savePlace,
  searchTowns,
  type Place,
  type Town,
} from '@/lib/huerta-api';
import {
  ChevronDown,
  CloudRain,
  Droplets,
  MapPinned,
  Moon,
  Navigation,
  Snowflake,
  Sun,
  Thermometer,
} from '@/lib/icons';
import { cn } from '@/lib/utils';

const WAITING: CropStatus[] = [
  'wait_frost',
  'wait_soil',
  'wait_warm',
  'too_warm',
  'wait_autumn',
  'wait_spring',
];

/** Kept out of the service worker's precache: only Huerta visitors fetch them. */
const cropPhoto = (id: string) =>
  `${import.meta.env.BASE_URL}huerta/crops/${id}.webp`;

type Load =
  | { state: 'picking' }
  | { state: 'loading' }
  | { state: 'ready'; advice: PlaceAdvice }
  | { state: 'none' }
  | { state: 'failed' };

/** Huerta's home: this week in the garden at the visitor's place. */
export default function HuertaPage() {
  const { t } = useTranslation('huerta');
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
        <header className='mb-8'>
          <h1 className='text-3xl leading-tight font-semibold text-balance text-foreground sm:text-4xl'>
            {t('title')}
          </h1>
          {load.state === 'ready' ? (
            <PlaceLine
              advice={load.advice}
              onChange={
                huertaApiConfigured
                  ? () => setLoad({ state: 'picking' })
                  : undefined
              }
            />
          ) : null}
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

/** The place the advice is for, the day, and the way to another place. */
function PlaceLine({
  advice,
  onChange,
}: {
  advice: PlaceAdvice;
  onChange?: () => void;
}) {
  const { t, i18n } = useTranslation('huerta');
  const day = new Intl.DateTimeFormat(i18n.language, {
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${advice.day}T12:00:00`));
  return (
    <p className='mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium text-foreground'>
      <MapPinned className='size-4 shrink-0 text-primary-text' />
      {onChange
        ? t('around', { place: advice.place, day })
        : t('sample', { place: advice.place, day })}
      {onChange ? (
        <Button variant='link' className='h-auto p-0' onClick={onChange}>
          {t('change')}
        </Button>
      ) : null}
    </p>
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
  const now = cropsWith(advice, ['now']);
  const waiting = cropsWith(advice, WAITING);
  const over = cropsWith(advice, ['too_late', 'not_here']);
  return (
    <>
      <Week advice={advice} />

      <section className='mt-10'>
        <SectionTitle title={t('now.title')} count={now.length} />
        <CropGrid crops={now} />
      </section>

      {waiting.length > 0 ? (
        <section className='mt-10'>
          <SectionTitle title={t('waiting.title')} count={waiting.length} />
          <CropGrid
            crops={waiting}
            note={crop => t(`status.${advice.crops[crop.id]}`)}
          />
        </section>
      ) : null}

      {over.length > 0 ? <TooLate crops={over} advice={advice} /> : null}
    </>
  );
}

/** The week on the band: the frost line, then soil, nights, rain, watering. */
function Week({ advice }: { advice: PlaceAdvice }) {
  const { t } = useTranslation('huerta');
  const FrostIcon = advice.frost === 'none' ? Sun : Snowflake;
  const value = (number: number | null, unit: 'celsius' | 'mm') =>
    number === null ? '–' : t(`units.${unit}`, { value: Math.round(number) });
  return (
    <section
      aria-label={t('week.label')}
      className={cn('rounded-card p-6 sm:p-8', BAND_SURFACE_CLASS)}
    >
      <p className='flex items-center gap-2 text-lg font-semibold'>
        <FrostIcon className='size-5 shrink-0 text-happy-300' />
        {t(`frost.${advice.frost}`)}
      </p>
      <dl className='mt-6 grid grid-cols-2 gap-6 sm:grid-cols-4'>
        <Fact icon={Thermometer} label={t('week.soil')}>
          {value(advice.soil, 'celsius')}
        </Fact>
        <Fact icon={Moon} label={t('week.nights')}>
          {value(advice.nights, 'celsius')}
        </Fact>
        <Fact icon={CloudRain} label={t('week.rain')}>
          {value(advice.rain, 'mm')}
        </Fact>
        <Fact icon={Droplets} label={t('week.water')}>
          {advice.water === 0 ? t('week.noWater') : value(advice.water, 'mm')}
        </Fact>
      </dl>
    </section>
  );
}

function Fact({
  icon: Icon,
  label,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className='flex gap-3'>
      <Icon className='mt-0.5 size-4 shrink-0 text-happy-300' />
      <div className='min-w-0'>
        <dt className='type-micro text-happy-100'>{label}</dt>
        <dd className='mt-1 font-display text-2xl font-semibold text-band-foreground'>
          {children}
        </dd>
      </div>
    </div>
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

function CropGrid({
  crops,
  note,
}: {
  crops: Crop[];
  /** A line under the crop's name: why it waits, or why it is out. */
  note?: (crop: Crop) => string | undefined;
}) {
  const { t } = useTranslation('huerta');
  return (
    <ul className='grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6'>
      {crops.map(crop => {
        const line = note?.(crop);
        return (
          <li key={crop.id}>
            <Card padding='none' media className='h-full'>
              <img
                src={cropPhoto(crop.id)}
                alt=''
                loading='lazy'
                decoding='async'
                className='aspect-square w-full bg-muted object-cover'
              />
              <span className='flex flex-1 flex-col items-start gap-2 p-3'>
                <span className='block leading-tight font-semibold hyphens-auto break-words text-foreground'>
                  {t(`crops.${crop.id}`)}
                </span>
                {line ? (
                  <span className='block text-sm text-muted-foreground'>
                    {line}
                  </span>
                ) : null}
                <Badge variant='secondary' className='mt-auto'>
                  {t(`how.${crop.how}`)}
                </Badge>
              </span>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

/** What this year's season is over for, folded away under its names. */
function TooLate({ crops, advice }: { crops: Crop[]; advice: PlaceAdvice }) {
  const { t } = useTranslation('huerta');
  return (
    <Collapsible className='mt-10'>
      <SectionTitle title={t('over.title')} count={crops.length} />
      <CollapsibleTrigger asChild>
        <Button
          variant='outline'
          className='group w-full justify-between'
          aria-label={t('over.show', { count: crops.length })}
        >
          <span className='truncate'>
            {crops.map(crop => t(`crops.${crop.id}`)).join(', ')}
          </span>
          <ChevronDown className='size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180' />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className='mt-3'>
        <CropGrid
          crops={crops}
          note={crop =>
            advice.crops[crop.id] === 'not_here'
              ? t('status.not_here')
              : undefined
          }
        />
      </CollapsibleContent>
    </Collapsible>
  );
}
