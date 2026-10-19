import type { ComponentType, ReactNode } from 'react';
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
import { BAND_SURFACE_CLASS } from '@/lib/band-surface';
import {
  cropsWith,
  SAMPLE_ADVICE,
  type Crop,
  type CropStatus,
  type PlaceAdvice,
} from '@/lib/huerta';
import {
  ChevronDown,
  CloudRain,
  Droplets,
  MapPinned,
  Moon,
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
];

/** Huerta's home: this week in the garden at one place. */
export default function HuertaPage() {
  const { t, i18n } = useTranslation('huerta');
  const advice = SAMPLE_ADVICE;
  const day = new Intl.DateTimeFormat(i18n.language, {
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${advice.day}T12:00:00`));
  const now = cropsWith(advice, ['now']);
  const waiting = cropsWith(advice, WAITING);
  const over = cropsWith(advice, ['too_late', 'not_here']);

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
          <p className='mt-3 flex items-center gap-2 text-sm font-medium text-foreground'>
            <MapPinned className='size-4 shrink-0 text-primary-text' />
            {t('sample', { place: advice.place, day })}
          </p>
        </header>

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
      </div>
    </>
  );
}

/** The week on the band: the frost line, then soil, nights, rain, watering. */
function Week({ advice }: { advice: PlaceAdvice }) {
  const { t } = useTranslation('huerta');
  const FrostIcon = advice.frost === 'none' ? Sun : Snowflake;
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
          {t('units.celsius', { value: Math.round(advice.soil) })}
        </Fact>
        <Fact icon={Moon} label={t('week.nights')}>
          {t('units.celsius', { value: Math.round(advice.nights) })}
        </Fact>
        <Fact icon={CloudRain} label={t('week.rain')}>
          {t('units.mm', { value: Math.round(advice.rain) })}
        </Fact>
        <Fact icon={Droplets} label={t('week.water')}>
          {advice.water > 0
            ? t('units.mm', { value: Math.round(advice.water) })
            : t('week.noWater')}
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
    <ul className='grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4'>
      {crops.map(crop => {
        const line = note?.(crop);
        return (
          <li key={crop.id}>
            <Card
              padding='compact'
              className='h-full flex-row items-center justify-between'
            >
              <span className='min-w-0'>
                <span className='block font-semibold text-foreground'>
                  {t(`crops.${crop.id}`)}
                </span>
                {line ? (
                  <span className='block text-sm text-muted-foreground'>
                    {line}
                  </span>
                ) : null}
              </span>
              <Badge variant='secondary'>{t(`how.${crop.how}`)}</Badge>
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
