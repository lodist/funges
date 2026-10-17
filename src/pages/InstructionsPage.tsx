import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { getScoreGradientCss } from '@/lib/scoreColor';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BAND_SURFACE_CLASS } from '@/lib/band-surface';
import SEO from '@/components/SEO';
import {
  Map,
  MapPinned,
  ScanSearch,
  Navigation,
  Palette,
  ChefHat,
  Globe,
  Thermometer,
  FlaskConical,
  Sprout,
  Mountain,
  Clock,
  Database,
  Leaf,
  Target,
  Users,
  BarChart3,
  Lightbulb,
  WifiOff,
} from '@/lib/icons';

// Every dataset the forecast reads, in the order the page credits them.
// Tinted by kind, in the palette's two families only (green and warm
// neutral; no blue or pink exists here): land and forest maps moss, the
// ground (soil, terrain, water) tan, sightings mint, weather linen.
const LAND = 'bg-secondary';
const GROUND = 'bg-accent';
const SIGHTINGS = 'bg-happy-50 dark:bg-happy-900/60';
const WEATHER = 'bg-muted';
const KEY_DATASETS = [
  ['corine', LAND],
  ['soilgrids', GROUND],
  ['nlcd', LAND],
  ['eudem', GROUND],
  ['hydrosheds', GROUND],
  ['treeGenus', LAND],
  ['forestTypes', LAND],
  ['gbif', SIGHTINGS],
  ['era5', WEATHER],
] as const;

/** A heading the copy ends with a colon reads without it. */
const withoutColon = (text: string) => text.replace(/\s*:\s*$/, '');

export default function InstructionsPage() {
  const { t } = useTranslation(['instructions', 'offline']);

  const functions = [
    { icon: ChefHat, text: t('functions.recipes') },
    { icon: Navigation, text: t('functions.location') },
    { icon: Palette, text: t('functions.theme') },
    { icon: ScanSearch, text: t('functions.identify') },
    { icon: MapPinned, text: withoutColon(t('mapInteraction.title')) },
    { icon: Globe, text: t('mapInteraction.maps') },
  ];

  const variables = [
    {
      icon: Thermometer,
      text: t('prediction.variables.temperature'),
    },
    { icon: FlaskConical, text: t('prediction.variables.soil') },
    { icon: Sprout, text: t('prediction.variables.vegetation') },
    { icon: Mountain, text: t('prediction.variables.topography') },
    { icon: Clock, text: t('prediction.variables.trends') },
  ];

  const keyFeatures = [
    { icon: Database, text: t('about.keyFeatures.environmentalData') },
    { icon: BarChart3, text: t('about.keyFeatures.probabilityModels') },
    { icon: Leaf, text: t('about.keyFeatures.climateAdaptation') },
    { icon: Users, text: t('about.keyFeatures.scalability') },
  ];

  return (
    <>
      <SEO
        title={t('title')}
        description={t('subtitle')}
        canonicalUrl={`${import.meta.env.BASE_URL}instructions`}
      />
      <div className='instructions-page max-w-6xl mx-auto px-4 py-8'>
        <div className='space-y-8'>
          {/* Header */}
          <div>
            <h1 className='text-3xl leading-tight font-semibold text-balance text-foreground sm:text-4xl'>
              {t('title')}
            </h1>
            <p className='mt-3 text-lg text-muted-foreground'>
              {t('subtitle')}
            </p>
          </div>

          {/* What the map shows, on the green band like the map's own dock:
              the page opens with the thing it explains. */}
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
              {t('mapDescription.intro')}
            </h2>
            <div className='mt-6 flex flex-col gap-4 leading-relaxed text-happy-100'>
              <p>{t('mapDescription.selection')}</p>
              <p>{t('mapDescription.colorCoding')}</p>
              {/* Caption outside the bar, bar as a pure swatch of the real ramp
                  from the map style: a label on the gradient measured 1.03:1
                  against its pale end. */}
              <div className='flex flex-col gap-1.5'>
                <div
                  className='h-3 rounded-full'
                  style={{ background: getScoreGradientCss() }}
                />
                <p className='text-center text-xs text-happy-100'>
                  {t('mapDescription.scale')}
                </p>
              </div>
              <p>{t('mapDescription.scores')}</p>
              <p>{t('mapDescription.polygons')}</p>
            </div>
          </section>

          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-3 text-2xl'>
                <WifiOff className='h-8 w-8 text-primary-text hidden lg:block' />
                {t('offline.title')}
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-5 text-foreground'>
              {(['prepare', 'available', 'unavailable'] as const).map(item => (
                <div key={item}>
                  <h3 className='mb-1 text-base font-semibold text-foreground'>
                    {t(`offline.${item}Title`)}
                  </h3>
                  <p className='leading-relaxed'>{t(`offline.${item}`)}</p>
                </div>
              ))}
              <Button asChild variant='outline'>
                <Link to='/offline'>
                  <WifiOff />
                  {t('offline:title')}
                </Link>
              </Button>
            </CardContent>
          </Card>

          {/* Functions Section */}
          <Card className='mb-8'>
            <CardHeader>
              <CardTitle className='text-2xl'>
                {withoutColon(t('functions.title'))}
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

          {/* Photo identification. Its own card rather than a line in the
              functions list: it is the only feature that downloads anything, and
              the only one where a misread costs more than a wasted walk. */}
          <Card className='mb-8'>
            <CardHeader>
              <CardTitle className='flex items-center gap-3 text-2xl'>
                <ScanSearch className='h-6 w-6 text-primary-text' />
                {t('identify.title')}
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-4 text-foreground'>
              <p>{t('identify.intro')}</p>
              <p>{t('identify.onDevice')}</p>
              <p>{t('identify.howTo')}</p>
              <p className='rounded-lg bg-status-warning-background border border-status-warning-border p-4 text-sm text-status-warning-text'>
                {t('identify.limits')}
              </p>
            </CardContent>
          </Card>

          {/* About Fung.es on the green band the other pages lead with. */}
          <section
            aria-labelledby='about-funges'
            className={cn(
              BAND_SURFACE_CLASS,
              'rounded-card p-6 sm:p-8 lg:p-10'
            )}
          >
            <h2
              id='about-funges'
              className='text-2xl leading-tight font-semibold text-happy-50 sm:text-3xl'
            >
              {t('about.title')}
            </h2>
            <div className='mt-5 flex max-w-3xl flex-col gap-4 leading-relaxed text-happy-100'>
              <p>{t('about.description')}</p>
              <p>{t('about.dataCombination')}</p>
              <p>{t('about.climateChange')}</p>
              <p>{t('about.currentStatus')}</p>
            </div>
            <h3 className='mt-8 mb-4 text-xl font-semibold text-happy-50'>
              {t('about.keyFeatures.title')}
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

          {/* Mission Section */}
          <Card className='mb-8'>
            <CardHeader>
              <CardTitle className='flex items-center gap-3 text-2xl'>
                <Target className='h-8 w-8 text-primary-text hidden lg:block' />
                {t('mission.title')}
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-4'>
              <p className='text-foreground leading-relaxed'>
                {t('mission.commitment')}
              </p>
              <p className='text-foreground leading-relaxed'>
                {t('mission.goal')}
              </p>
              <p className='text-foreground leading-relaxed'>
                {t('mission.sustainability')}
              </p>
              <p className='text-foreground leading-relaxed'>
                {t('mission.community')}
              </p>
              <p className='text-foreground leading-relaxed'>
                {t('mission.openAccess')}
              </p>
              <p>{t('mission.privacy')}</p>
            </CardContent>
          </Card>

          {/* Prediction Section */}
          <Card className='mb-8'>
            <CardHeader>
              <CardTitle className='flex items-center gap-3 text-2xl'>
                <Lightbulb className='h-8 w-8 text-primary-text hidden lg:block' />
                {t('prediction.title')}
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-6'>
              <p className='text-foreground leading-relaxed'>
                {t('prediction.description')}
              </p>

              <div>
                <p className='font-semibold text-foreground mb-3'>
                  {t('prediction.monitorTitle')}
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
                {t('prediction.goal')}
              </p>

              <div>
                <h4 className='text-xl font-semibold text-foreground mb-4'>
                  {t('prediction.methodology.title')}
                </h4>
                <p className='text-foreground leading-relaxed mb-3'>
                  {t('prediction.methodology.description')}
                </p>
                <p className='text-foreground leading-relaxed'>
                  {t('prediction.methodology.datasets')}
                </p>
              </div>

              <div>
                <h4 className='text-xl font-semibold text-foreground mb-4'>
                  {t('prediction.keyDatasets.title')}
                </h4>

                <div className='grid gap-4 md:grid-cols-2'>
                  {KEY_DATASETS.map(([key, tint]) => (
                    <div key={key} className={cn('rounded-lg p-4', tint)}>
                      <h5 className='font-semibold text-foreground mb-2'>
                        {t(`prediction.keyDatasets.${key}.title`)}
                      </h5>
                      <p className='text-foreground text-sm mb-2'>
                        {t(`prediction.keyDatasets.${key}.description`)}
                      </p>
                      <p className='text-muted-foreground text-xs'>
                        {t(`prediction.keyDatasets.${key}.source`)}
                      </p>
                      <p className='text-muted-foreground text-xs'>
                        {t(`prediction.keyDatasets.${key}.citation`)}
                      </p>
                    </div>
                  ))}

                  <p className='text-foreground text-sm md:col-span-2'>
                    {t('prediction.keyDatasets.additional')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
