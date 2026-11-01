import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BAND_SURFACE_CLASS } from '@/lib/band-surface';
import {
  bands,
  PALETTES,
  type MapLayer,
  type MapSource,
} from '@/lib/garden-map';
import { huertaPage } from '@/lib/seo-pages';
import SEO from '@/components/SEO';
import {
  Map,
  MapPinned,
  Navigation,
  Palette,
  Database,
  CalendarRange,
  LayoutGrid,
  Sprout,
  Snowflake,
  Thermometer,
  Droplets,
  FlaskConical,
  Clock,
  Leaf,
  Lightbulb,
  Target,
  User,
} from '@/lib/icons';

// Huerta's own Instructions, laid out as Terra's (InstructionsPage): the map
// on the band first, then the garden, the functions, the account, About on
// the band, the mission and where the advice comes from.

const LAYERS: [MapLayer, typeof Sprout][] = [
  ['crop', Sprout],
  ['frost', Snowflake],
  ['soil', Thermometer],
  ['water', Droplets],
];
// What each layer is drawn from tonight (lib/garden-map's newer sources).
const SOURCE: Record<MapLayer, MapSource> = {
  crop: 'crop',
  frost: 'cold',
  soil: 'soil',
  water: 'balance',
};

// Tinted by kind as Terra's datasets: weather linen, the ground tan, the
// gardening know-how moss, the living things mint.
const LAND = 'bg-secondary';
const GROUND = 'bg-accent';
const LIVING = 'bg-happy-50 dark:bg-happy-900/60';
const WEATHER = 'bg-muted';
const KEY_DATASETS = [
  ['icon', WEATHER],
  ['ecmwf', WEATHER],
  ['nbm', WEATHER],
  ['era5', WEATHER],
  ['soilgrids', GROUND],
  ['guides', LAND],
  ['pests', LIVING],
  ['towns', LAND],
] as const;

// My garden, step by step, in the order the planner is met.
const GARDEN_STEPS = [
  ['setup', ['place', 'size', 'north', 'around', 'soil']],
  ['plan', ['when', 'auto', 'change', 'checks', 'timeline', 'list']],
  ['week', ['todo', 'finish']],
] as const;
const stepsBefore = (group: number) =>
  GARDEN_STEPS.slice(0, group).reduce((n, [, steps]) => n + steps.length, 0);

/** A palette colour as CSS, without the map's transparency. */
const css = ([r, g, b]: readonly number[]) => `rgb(${r},${g},${b})`;

/** A layer's colours as the map's legend draws them (the light basemap's). */
function LayerKey({ layer }: { layer: MapLayer }) {
  const { t } = useTranslation('huerta');
  const palette = PALETTES.light;
  if (layer === 'crop') {
    const hatched = `repeating-linear-gradient(135deg, var(--color-muted-foreground) 0 1.5px, transparent 1.5px 4px), ${css(palette.wash)}`;
    return (
      <ul className='flex flex-wrap gap-x-4 gap-y-1.5 text-sm'>
        {(
          [
            [css(palette.crop.now), t('map.legend.now')],
            [css(palette.crop.wait), t('map.legend.wait')],
            [hatched, t('map.legend.over')],
          ] as const
        ).map(([fill, label]) => (
          <li key={label} className='flex items-center gap-2 text-happy-50'>
            <span
              className='size-3.5 shrink-0 rounded-sm border border-happy-50/60'
              style={{ background: fill }}
            />
            {label}
          </li>
        ))}
      </ul>
    );
  }
  const source = SOURCE[layer];
  const steps = bands(source).fills.filter(
    (fill): fill is Exclude<typeof fill, 'over' | null> =>
      fill !== null && fill !== 'over'
  );
  return (
    <div className='flex w-full max-w-xs flex-col gap-1'>
      <span className='flex h-3 overflow-hidden rounded-sm border border-happy-50/60'>
        {steps.map(fill => (
          <span
            key={css(fill)}
            className='flex-1'
            style={{ background: css(fill) }}
          />
        ))}
      </span>
      <span className='flex justify-between text-xs text-happy-100'>
        <span>{t(`map.legend.${source}Low`)}</span>
        <span>{t(`map.legend.${source}High`)}</span>
      </span>
    </div>
  );
}

export default function HuertaInstructionsPage() {
  const { t, i18n } = useTranslation(['instructions', 'huerta']);

  const functions = [
    { icon: Database, text: t('huerta.functions.crops') },
    { icon: CalendarRange, text: t('huerta.functions.calendar') },
    { icon: Navigation, text: t('huerta.functions.place') },
    { icon: LayoutGrid, text: t('huerta.functions.gardens') },
    { icon: MapPinned, text: t('huerta.functions.sheet') },
    // The map styles are Terra's own.
    { icon: Palette, text: t('functions.theme') },
  ];

  const variables = [
    { icon: Thermometer, text: t('huerta.advice.variables.soil') },
    { icon: Snowflake, text: t('huerta.advice.variables.frost') },
    { icon: Droplets, text: t('huerta.advice.variables.water') },
    { icon: CalendarRange, text: t('huerta.advice.variables.dates') },
    { icon: FlaskConical, text: t('huerta.advice.variables.ground') },
    { icon: Clock, text: t('huerta.advice.variables.warmth') },
  ];

  const keyFeatures = [
    { icon: Map, text: t('huerta.about.keyFeatures.forecast') },
    { icon: Snowflake, text: t('huerta.about.keyFeatures.frost') },
    { icon: FlaskConical, text: t('huerta.about.keyFeatures.soil') },
    { icon: Leaf, text: t('huerta.about.keyFeatures.growth') },
  ];

  return (
    <>
      <SEO
        title={t('huerta.title')}
        description={t('huerta.subtitle')}
        canonicalUrl={`${import.meta.env.BASE_URL}huerta/instructions`}
      />
      <div className='instructions-page max-w-6xl mx-auto px-4 py-8'>
        <div className='space-y-8'>
          <div>
            <h1 className='text-3xl leading-tight font-semibold text-balance text-foreground sm:text-4xl'>
              {t('huerta.title')}
            </h1>
            <p className='mt-3 text-lg text-muted-foreground'>
              {t('huerta.subtitle')}
            </p>
          </div>

          {/* What the map shows, on the band like the map's own legend. */}
          <section
            aria-labelledby='map-description'
            className={cn(
              BAND_SURFACE_CLASS,
              'rounded-card p-6 sm:p-8 lg:p-10'
            )}
          >
            <h2
              id='map-description'
              className='flex items-start gap-3 text-2xl leading-tight font-semibold text-happy-50 sm:text-3xl'
            >
              <Map className='mt-1 hidden size-8 shrink-0 text-happy-300 lg:block' />
              {t('huerta.map.intro')}
            </h2>
            <div className='mt-6 flex flex-col gap-4 leading-relaxed text-happy-100'>
              <p>{t('huerta.map.pick')}</p>
              <ul className='flex flex-col gap-3'>
                {LAYERS.map(([layer, Icon]) => (
                  <li
                    key={layer}
                    className='flex flex-col gap-2 rounded-xl bg-happy-50/10 p-4 dark:bg-happy-50/10'
                  >
                    <p className='flex items-center gap-2 font-semibold text-happy-50'>
                      <Icon className='size-5 shrink-0 text-happy-300' />
                      {t(`huerta:map.layers.${layer}`)}
                    </p>
                    <LayerKey layer={layer} />
                    <p className='text-sm'>{t(`huerta.map.layers.${layer}`)}</p>
                  </li>
                ))}
              </ul>
              <p>{t('huerta.map.tap')}</p>
              <p>{t('huerta.map.coverage')}</p>
            </div>
          </section>

          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-3 text-2xl'>
                <LayoutGrid className='h-8 w-8 text-primary-text hidden lg:block' />
                {t('huerta.garden.title')}
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-6 text-foreground'>
              <div className='space-y-3 leading-relaxed'>
                <p>{t('huerta.garden.intro')}</p>
                <p className='text-muted-foreground'>
                  {t('huerta.garden.phone')}
                </p>
              </div>
              {GARDEN_STEPS.map(([group, steps], g) => (
                <section key={group} aria-labelledby={`garden-${group}`}>
                  <h3
                    id={`garden-${group}`}
                    className='mb-4 text-lg font-semibold text-foreground'
                  >
                    {t(`huerta.garden.${group}.title`)}
                  </h3>
                  {/* Numbered on from the group before: one walk-through. */}
                  <ol
                    start={stepsBefore(g) + 1}
                    className='flex flex-col gap-5'
                  >
                    {steps.map((step, i) => (
                      // The number beside the title, the text full width
                      // under both: a phone keeps its whole line for it.
                      <li key={step}>
                        <h4 className='mb-1 flex items-center gap-3 text-base font-semibold text-foreground'>
                          <span
                            aria-hidden
                            className='flex size-7 shrink-0 items-center justify-center rounded-full bg-band text-sm font-semibold text-band-foreground tabular-nums'
                          >
                            {stepsBefore(g) + i + 1}
                          </span>
                          {t(`huerta.garden.${group}.${step}.title`)}
                        </h4>
                        <p className='leading-relaxed'>
                          {t(`huerta.garden.${group}.${step}.text`)}
                        </p>
                      </li>
                    ))}
                  </ol>
                </section>
              ))}
              <Button asChild variant='outline'>
                <Link to={huertaPage('planner', i18n.language)}>
                  <LayoutGrid />
                  {t('huerta:week.todo.openPlanner')}
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className='mb-8'>
            <CardHeader>
              <CardTitle className='text-2xl'>
                {t('huerta.functions.title')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className='grid md:grid-cols-2 gap-4'>
                {functions.map(func => (
                  <div
                    key={func.text}
                    className='flex items-center gap-4 p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors'
                  >
                    <func.icon className='h-6 w-6 text-primary-text flex-shrink-0' />
                    <span className='text-foreground'>{func.text}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* The account where Terra has photo ID: the one thing Huerta keeps
              about you. */}
          <Card className='mb-8'>
            <CardHeader>
              <CardTitle className='flex items-center gap-3 text-2xl'>
                <User className='h-6 w-6 text-primary-text' />
                {t('huerta.account.title')}
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-4 text-foreground'>
              <p>{t('huerta.account.intro')}</p>
              <p>{t('huerta.account.kept')}</p>
              <p>{t('huerta.account.delete')}</p>
            </CardContent>
          </Card>

          <section
            aria-labelledby='about-huerta'
            className={cn(
              BAND_SURFACE_CLASS,
              'rounded-card p-6 sm:p-8 lg:p-10'
            )}
          >
            <h2
              id='about-huerta'
              className='text-2xl leading-tight font-semibold text-happy-50 sm:text-3xl'
            >
              {t('huerta.about.title')}
            </h2>
            <div className='mt-5 flex flex-col gap-4 leading-relaxed text-happy-100'>
              <p>{t('huerta.about.description')}</p>
              <p>{t('huerta.about.packet')}</p>
              <p>{t('huerta.about.status')}</p>
            </div>
            <h3 className='mt-8 mb-4 text-xl font-semibold text-happy-50'>
              {t('huerta.about.keyFeatures.title')}
            </h3>
            <ul className='grid gap-3 md:grid-cols-2'>
              {keyFeatures.map(feature => (
                <li
                  key={feature.text}
                  className='flex items-start gap-3 rounded-xl bg-happy-50/10 p-3 dark:bg-happy-50/10'
                >
                  <feature.icon className='mt-0.5 h-5 w-5 shrink-0 text-happy-300' />
                  <span className='text-sm text-happy-50'>{feature.text}</span>
                </li>
              ))}
            </ul>
          </section>

          <Card className='mb-8'>
            <CardHeader>
              <CardTitle className='flex items-center gap-3 text-2xl'>
                <Target className='h-8 w-8 text-primary-text hidden lg:block' />
                {t('huerta.mission.title')}
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-4'>
              <p className='text-foreground leading-relaxed'>
                {t('huerta.mission.learn')}
              </p>
              <p className='text-foreground leading-relaxed'>
                {t('huerta.mission.climate')}
              </p>
              <p className='text-foreground leading-relaxed'>
                {t('huerta.mission.waste')}
              </p>
            </CardContent>
          </Card>

          <Card className='mb-8'>
            <CardHeader>
              <CardTitle className='flex items-center gap-3 text-2xl'>
                <Lightbulb className='h-8 w-8 text-primary-text hidden lg:block' />
                {t('huerta.advice.title')}
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-6'>
              <p className='text-foreground leading-relaxed'>
                {t('huerta.advice.description')}
              </p>

              <div>
                <p className='font-semibold text-foreground mb-3'>
                  {t('huerta.advice.monitorTitle')}
                </p>
                <div className='space-y-2'>
                  {variables.map(variable => (
                    <div
                      key={variable.text}
                      className='flex items-center gap-3 p-3 rounded-lg bg-muted/50'
                    >
                      <variable.icon className='h-5 w-5 text-primary-text flex-shrink-0' />
                      <span className='text-foreground'>{variable.text}</span>
                    </div>
                  ))}
                </div>
              </div>

              <p className='text-foreground leading-relaxed'>
                {t('huerta.advice.goal')}
              </p>

              <div>
                <h4 className='text-xl font-semibold text-foreground mb-4'>
                  {t('huerta.advice.methodology.title')}
                </h4>
                <p className='text-foreground leading-relaxed'>
                  {t('huerta.advice.methodology.description')}
                </p>
              </div>

              <div>
                <h4 className='text-xl font-semibold text-foreground mb-4'>
                  {t('huerta.advice.keyDatasets.title')}
                </h4>

                <div className='grid gap-4 md:grid-cols-2'>
                  {KEY_DATASETS.map(([key, tint]) => (
                    <div key={key} className={cn('rounded-lg p-4', tint)}>
                      <h5 className='font-semibold text-foreground mb-2'>
                        {t(`huerta.advice.keyDatasets.${key}.title`)}
                      </h5>
                      <p className='text-foreground text-sm mb-2'>
                        {t(`huerta.advice.keyDatasets.${key}.description`)}
                      </p>
                      <p className='text-muted-foreground text-xs'>
                        {t(`huerta.advice.keyDatasets.${key}.source`)}
                      </p>
                      <p className='text-muted-foreground text-xs'>
                        {t(`huerta.advice.keyDatasets.${key}.citation`)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
