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
  blight: 'blight',
  slugs: 'slugs',
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

// My garden as a picture of the planner on a computer, numbered part by part,
// in the order the explanations are listed. One screenshot per language
// (public/huerta/guide/planner-<lang>.webp), all cut to the same 1001 × 830
// frame; the words differ in length, so each has its own spots.
const SHOT = { width: 1001, height: 830 };
const GARDEN_PARTS = [
  'size',
  'around',
  'soil',
  'when',
  'auto',
  'undo',
  'north',
  'view',
  'shade',
  'bed',
  'select',
  'timeline',
  'sun',
  'status',
  'facts',
  'ifNow',
  'sown',
  'neighbours',
  'swap',
] as const;
type Spots = [number, number][];
const SPOTS: Record<string, Spots> = {
  en: [
    [751, 21],
    [739, 69],
    [247, 136],
    [21, 189],
    [113, 189],
    [229, 189],
    [122, 284],
    [612, 284],
    [622, 320],
    [532, 552],
    [252, 726],
    [61, 783],
    [841, 280],
    [861, 423],
    [987, 454],
    [982, 561],
    [855, 657],
    [816, 693],
    [806, 769],
  ],
  de: [
    [706, 21],
    [713, 69],
    [280, 136],
    [21, 189],
    [114, 189],
    [244, 189],
    [122, 284],
    [612, 284],
    [622, 320],
    [532, 552],
    [295, 726],
    [62, 783],
    [849, 280],
    [860, 423],
    [987, 454],
    [982, 577],
    [858, 689],
    [807, 725],
    [848, 801],
  ],
  es: [
    [805, 21],
    [746, 69],
    [286, 136],
    [21, 189],
    [103, 189],
    [240, 189],
    [122, 284],
    [606, 284],
    [622, 320],
    [532, 552],
    [300, 726],
    [69, 783],
    [866, 280],
    [902, 423],
    [987, 454],
    [982, 561],
    [870, 673],
    [795, 709],
    [825, 785],
  ],
  fr: [
    [795, 21],
    [756, 69],
    [260, 136],
    [21, 189],
    [142, 189],
    [282, 189],
    [122, 284],
    [612, 284],
    [622, 320],
    [532, 552],
    [311, 726],
    [97, 783],
    [869, 280],
    [867, 423],
    [987, 454],
    [982, 577],
    [885, 689],
    [792, 725],
    [840, 801],
  ],
  it: [
    [801, 21],
    [700, 69],
    [308, 136],
    [21, 189],
    [107, 189],
    [247, 189],
    [122, 284],
    [602, 284],
    [622, 320],
    [532, 552],
    [296, 726],
    [56, 783],
    [852, 280],
    [881, 423],
    [987, 454],
    [982, 561],
    [870, 673],
    [782, 709],
    [844, 785],
  ],
  pt: [
    [892, 21],
    [731, 69],
    [271, 136],
    [21, 189],
    [106, 189],
    [242, 189],
    [122, 284],
    [601, 284],
    [622, 320],
    [532, 552],
    [285, 726],
    [69, 783],
    [890, 280],
    [886, 423],
    [987, 454],
    [982, 577],
    [868, 689],
    [798, 725],
    [819, 801],
  ],
};
const NUMBER =
  'flex size-6 shrink-0 items-center justify-center rounded-full bg-band text-xs font-semibold text-band-foreground tabular-nums';

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
  // The planner in the reader's language (de-CH reads as de), else English.
  const shot =
    i18n.language.slice(0, 2) in SPOTS ? i18n.language.slice(0, 2) : 'en';

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
              <div>
                <h3 className='mb-1 text-lg font-semibold text-foreground'>
                  {t('huerta.garden.place.title')}
                </h3>
                <p className='leading-relaxed'>
                  {t('huerta.garden.place.text')}
                </p>
              </div>
              <figure>
                {/* On a phone the picture keeps a readable width and slides
                    sideways: shrunk to the screen, its numbers would overlap. */}
                <div
                  role='region'
                  aria-label={t('huerta.garden.picture.caption')}
                  tabIndex={0}
                  className='focus-ring overflow-x-auto rounded-lg border border-border'
                >
                  <div className='relative min-w-[40rem]'>
                    <img
                      src={`${import.meta.env.BASE_URL}huerta/guide/planner-${shot}.webp`}
                      alt={t('huerta.garden.picture.alt')}
                      width={SHOT.width}
                      height={SHOT.height}
                      loading='lazy'
                      className='block h-auto w-full'
                    />
                    {SPOTS[shot].map(([x, y], i) => (
                      <span
                        key={GARDEN_PARTS[i]}
                        aria-hidden
                        className={cn(
                          NUMBER,
                          'absolute -translate-x-1/2 -translate-y-1/2 ring-2 ring-card'
                        )}
                        style={{
                          left: `${(x / SHOT.width) * 100}%`,
                          top: `${(y / SHOT.height) * 100}%`,
                        }}
                      >
                        {i + 1}
                      </span>
                    ))}
                  </div>
                </div>
                <figcaption className='mt-2 text-sm text-muted-foreground'>
                  {t('huerta.garden.picture.caption')}
                  <span className='sm:hidden'>
                    {' '}
                    {t('huerta.garden.picture.swipe')}
                  </span>
                </figcaption>
              </figure>
              <ol className='flex flex-col gap-5'>
                {GARDEN_PARTS.map((part, i) => (
                  // The number beside the title, the text full width under
                  // both: a phone keeps its whole line for it.
                  <li key={part}>
                    <h4 className='mb-1 flex items-center gap-3 text-base font-semibold text-foreground'>
                      <span aria-hidden className={NUMBER}>
                        {i + 1}
                      </span>
                      {t(`huerta.garden.steps.${part}.title`)}
                    </h4>
                    <p className='leading-relaxed'>
                      {t(`huerta.garden.steps.${part}.text`)}
                    </p>
                  </li>
                ))}
              </ol>
              <div>
                <h3 className='mb-1 text-lg font-semibold text-foreground'>
                  {t('huerta.garden.list.title')}
                </h3>
                <p className='leading-relaxed'>
                  {t('huerta.garden.list.text')}
                </p>
              </div>
              <section aria-labelledby='garden-week' className='space-y-4'>
                <h3
                  id='garden-week'
                  className='text-lg font-semibold text-foreground'
                >
                  {t('huerta.garden.week.title')}
                </h3>
                {(['todo', 'finish'] as const).map(item => (
                  <div key={item}>
                    <h4 className='mb-1 text-base font-semibold text-foreground'>
                      {t(`huerta.garden.week.${item}.title`)}
                    </h4>
                    <p className='leading-relaxed'>
                      {t(`huerta.garden.week.${item}.text`)}
                    </p>
                  </div>
                ))}
              </section>
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
