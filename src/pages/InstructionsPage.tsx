import type { ComponentType, ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import SEO from '@/components/SEO';
import { BAND_SURFACE_CLASS } from '@/lib/band-surface';
import {
  AlertTriangle,
  BarChart3,
  ChefHat,
  Clock,
  Database,
  FlaskConical,
  Globe,
  Leaf,
  MapPinned,
  Mountain,
  Navigation,
  Palette,
  ScanSearch,
  ShieldCheck,
  Sprout,
  Thermometer,
  Users,
  WifiOff,
} from '@/lib/icons';
import { getScoreGradientCss, SCORE_COLOR_RAMP } from '@/lib/scoreColor';
import { cn } from '@/lib/utils';

// Every dataset the forecast reads, in the order the page credits them.
const KEY_DATASETS = [
  'corine',
  'soilgrids',
  'nlcd',
  'eudem',
  'hydrosheds',
  'treeGenus',
  'forestTypes',
  'gbif',
  'era5',
] as const;

const VARIABLES = [
  { key: 'temperature', icon: Thermometer },
  { key: 'soil', icon: FlaskConical },
  { key: 'vegetation', icon: Sprout },
  { key: 'topography', icon: Mountain },
  { key: 'trends', icon: Clock },
] as const;

const FEATURES = [
  { key: 'environmentalData', icon: Database },
  { key: 'probabilityModels', icon: BarChart3 },
  { key: 'climateAdaptation', icon: Leaf },
  { key: 'scalability', icon: Users },
] as const;

// The ramp's own ends, so the ticks sit where the map paints those scores.
const RAMP_MIN = SCORE_COLOR_RAMP[0][0];
const RAMP_MAX = SCORE_COLOR_RAMP[SCORE_COLOR_RAMP.length - 1][0];
const rampAt = (score: number) =>
  `${((Math.max(score, RAMP_MIN) - RAMP_MIN) / (RAMP_MAX - RAMP_MIN)) * 100}%`;

/** The conditions words the meters use, on the stretch of the ramp they
 *  cover (getConfidence's 6.8 and 8.2). */
const CONDITION_BANDS = [
  { level: 'low', from: RAMP_MIN, to: 6.8 },
  { level: 'medium', from: 6.8, to: 8.2 },
  { level: 'high', from: 8.2, to: RAMP_MAX },
] as const;

/** A heading the copy ends with a colon; the glossary row reads without it. */
const withoutColon = (text: string) => text.replace(/\s*:\s*$/, '');

export default function InstructionsPage() {
  const { t, i18n } = useTranslation(['instructions', 'common', 'offline']);
  const number = new Intl.NumberFormat(i18n.language);

  return (
    <>
      <SEO
        title={t('title')}
        description={t('subtitle')}
        canonicalUrl={`${import.meta.env.BASE_URL}instructions`}
      />
      <div className='container mx-auto max-w-6xl px-4 py-8'>
        <header className='mb-8'>
          <h1 className='text-3xl leading-tight font-semibold text-balance text-foreground sm:text-4xl'>
            {t('title')}
          </h1>
          <p className='mt-3 text-lg text-muted-foreground'>{t('subtitle')}</p>
        </header>

        {/* The map's key: what the colours mean, drawn with the map's own ramp. */}
        <section
          aria-labelledby='legend-colours'
          className={cn(BAND_SURFACE_CLASS, 'rounded-card p-6 sm:p-8 lg:p-10')}
        >
          <h2
            id='legend-colours'
            className='max-w-4xl text-2xl leading-tight font-semibold text-balance text-happy-50 sm:text-3xl lg:text-4xl'
          >
            {t('mapDescription.intro')}
          </h2>

          <div className='mt-8' aria-hidden='true'>
            <div
              className='h-4 rounded-full'
              style={{ background: getScoreGradientCss() }}
            />
            <div className='relative mt-2 h-5 text-xs text-happy-100 tabular-nums'>
              {[0, 2, 4, 6, 8, 10].map(score => (
                <span
                  key={score}
                  className='absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full'
                  style={{ left: rampAt(score) }}
                >
                  {score}
                </span>
              ))}
            </div>
          </div>
          {/* The words the meters use, each with the scores it covers: a list,
              not labels under the bar, which collided on a phone where the
              6.8–8.2 stretch is 45px wide. */}
          <ul className='mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm'>
            {CONDITION_BANDS.map(({ level, from, to }) => (
              <li key={level} className='flex items-baseline gap-2'>
                <span className='font-medium text-happy-50'>
                  {t(`common:worthForagingNow.conditions.${level}`)}
                </span>
                <span className='text-happy-100 tabular-nums'>
                  {`${number.format(level === 'low' ? 0 : from)}–${number.format(to)}`}
                </span>
              </li>
            ))}
          </ul>
          {/* The bar is drawn for the eye; the scale is said in words. */}
          <p className='sr-only'>{t('mapDescription.scale')}</p>

          <div className='mt-6 grid gap-4 text-happy-100 md:grid-cols-3'>
            <p className='leading-relaxed'>{t('mapDescription.colorCoding')}</p>
            <p className='leading-relaxed'>{t('mapDescription.scores')}</p>
            <p className='leading-relaxed'>{t('mapDescription.polygons')}</p>
          </div>
        </section>

        <Section id='legend-controls' title={t('controlsTitle')}>
          <ul className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
            <KeyItem icon={Sprout}>{t('mapDescription.selection')}</KeyItem>
            <KeyItem icon={Navigation}>{t('functions.location')}</KeyItem>
            <KeyItem icon={Palette}>{t('functions.theme')}</KeyItem>
            <KeyItem icon={ScanSearch}>{t('functions.identify')}</KeyItem>
            <KeyItem icon={ChefHat}>{t('functions.recipes')}</KeyItem>
            <KeyItem icon={MapPinned}>
              {withoutColon(t('mapInteraction.title'))}
            </KeyItem>
            <KeyItem icon={Globe}>{t('mapInteraction.maps')}</KeyItem>
            <KeyItem icon={WifiOff}>
              {t('offline:intro')}{' '}
              <Link
                to='/offline'
                className='focus-ring rounded-sm font-medium text-primary-text underline underline-offset-4 hover:no-underline'
              >
                {t('offline:title')}
              </Link>
            </KeyItem>
          </ul>
        </Section>

        <Section id='legend-identify' title={t('identify.title')}>
          <div className='grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]'>
            <div className='flex flex-col gap-4 leading-relaxed text-foreground'>
              <p>{t('identify.intro')}</p>
              <p>{t('identify.onDevice')}</p>
              <p>{t('identify.howTo')}</p>
            </div>
            <p className='flex h-fit items-start gap-2 rounded-lg bg-status-warning-background px-4 py-3 text-sm leading-relaxed font-medium text-status-warning-text ring-2 ring-status-warning-border/60'>
              <AlertTriangle className='mt-0.5 size-4 shrink-0' />
              {t('identify.limits')}
            </p>
          </div>
        </Section>

        <Section id='legend-forecast' title={t('prediction.title')}>
          <p className='max-w-3xl leading-relaxed text-foreground'>
            {t('prediction.description')}
          </p>
          <ul className='mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5'>
            {VARIABLES.map(({ key, icon }) => (
              <KeyItem key={key} icon={icon}>
                {t(`prediction.variables.${key}`)}
              </KeyItem>
            ))}
          </ul>
          <p className='mt-5 max-w-3xl leading-relaxed text-foreground'>
            {t('prediction.goal')}
          </p>
        </Section>

        <Section id='legend-sources' title={t('prediction.methodology.title')}>
          <div className='flex max-w-3xl flex-col gap-3 leading-relaxed text-foreground'>
            <p>{t('prediction.methodology.description')}</p>
            <p>{t('prediction.methodology.datasets')}</p>
          </div>
          <h3 className='mt-8 mb-4 text-xl font-semibold text-foreground'>
            {t('prediction.keyDatasets.title')}
          </h3>
          <ul className='grid gap-4 md:grid-cols-2'>
            {KEY_DATASETS.map(key => (
              <li
                key={key}
                className='flex flex-col gap-2 rounded-card bg-card p-5 elevation-raised'
              >
                <h4 className='leading-snug font-semibold text-foreground'>
                  {t(`prediction.keyDatasets.${key}.title`)}
                </h4>
                <p className='text-sm leading-relaxed text-foreground'>
                  {t(`prediction.keyDatasets.${key}.description`)}
                </p>
                <p className='mt-auto text-xs text-muted-foreground'>
                  {t(`prediction.keyDatasets.${key}.source`)}
                </p>
                <p className='text-xs text-muted-foreground'>
                  {t(`prediction.keyDatasets.${key}.citation`)}
                </p>
              </li>
            ))}
          </ul>
          <p className='mt-4 text-sm text-muted-foreground'>
            {t('prediction.keyDatasets.additional')}
          </p>
        </Section>

        <div className='mt-12 grid gap-10 lg:grid-cols-2'>
          <section aria-labelledby='legend-about'>
            <h2
              id='legend-about'
              className='mb-4 text-2xl font-semibold text-foreground sm:text-3xl'
            >
              {t('about.title')}
            </h2>
            <div className='flex flex-col gap-4 leading-relaxed text-foreground'>
              <p>{t('about.description')}</p>
              <p>{t('about.dataCombination')}</p>
              <p>{t('about.climateChange')}</p>
              <p>{t('about.currentStatus')}</p>
            </div>
            <h3 className='mt-6 mb-3 text-lg font-semibold text-foreground'>
              {t('about.keyFeatures.title')}
            </h3>
            <ul className='grid gap-3'>
              {FEATURES.map(({ key, icon }) => (
                <KeyItem key={key} icon={icon}>
                  {t(`about.keyFeatures.${key}`)}
                </KeyItem>
              ))}
            </ul>
          </section>

          <section aria-labelledby='legend-mission'>
            <h2
              id='legend-mission'
              className='mb-4 text-2xl font-semibold text-foreground sm:text-3xl'
            >
              {t('mission.title')}
            </h2>
            <div className='flex flex-col gap-4 leading-relaxed text-foreground'>
              <p>{t('mission.commitment')}</p>
              <p>{t('mission.goal')}</p>
              <p>{t('mission.sustainability')}</p>
              <p>{t('mission.community')}</p>
              <p>{t('mission.openAccess')}</p>
            </div>
            {/* The promise the product is built on gets more than a line. */}
            <p className='mt-6 flex items-start gap-3 rounded-card bg-secondary p-5 leading-relaxed text-secondary-foreground'>
              <ShieldCheck className='mt-0.5 size-5 shrink-0' />
              {t('mission.privacy')}
            </p>
          </section>
        </div>
      </div>
    </>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className='mt-12'>
      <h2
        id={id}
        className='mb-5 text-2xl font-semibold text-foreground sm:text-3xl'
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

/** One entry of the map's key: its icon and what it does. */
function KeyItem({
  icon: Icon,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  children: ReactNode;
}) {
  return (
    <li className='flex items-start gap-3 rounded-card bg-card p-4 elevation-raised'>
      <span className='grid size-9 shrink-0 place-items-center rounded-full bg-secondary'>
        <Icon className='size-4 text-primary-text' />
      </span>
      <span className='min-w-0 pt-1.5 text-sm leading-relaxed text-foreground'>
        {children}
      </span>
    </li>
  );
}
