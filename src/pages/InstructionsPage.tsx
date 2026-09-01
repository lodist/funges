import { useTranslation } from 'react-i18next';

import { getScoreGradientCss } from '@/lib/scoreColor';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import SEO from '@/components/SEO';
import {
  Map,
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
} from '@/lib/icons';

export default function InstructionsPage() {
  const { t } = useTranslation('instructions');

  const functions = [
    {
      icon: ChefHat,
      text: t('functions.recipes'),
      color: 'text-primary-text',
    },
    {
      icon: Navigation,
      text: t('functions.location'),
      color: 'text-primary-text',
    },
    {
      icon: Palette,
      text: t('functions.theme'),
      color: 'text-muted-foreground',
    },
    {
      icon: ScanSearch,
      text: t('functions.identify'),
      color: 'text-primary-text',
    },
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
          <div className='text-center'>
            <h1 className='text-3xl font-bold text-foreground dark:text-white mb-2'>
              {t('title')}
            </h1>
            <h2 className='text-xl font-medium text-muted-foreground'>
              {t('subtitle')}
            </h2>
          </div>

          {/* Map Description Section */}
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-3 text-2xl'>
                <Map className='h-8 w-8 text-primary-text hidden lg:block' />
                {t('mapDescription.intro')}
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-4'>
              <p className='text-foreground leading-relaxed'>
                {t('mapDescription.selection')}
              </p>
              <p className='text-foreground leading-relaxed'>
                {t('mapDescription.colorCoding')}
              </p>
              {/* The label used to sit on top of the gradient in white, which
                  measured 1.03:1 against its pale end — invisible for the first
                  third of the bar. Same treatment as MapInfoCard now: caption
                  outside, bar as a pure swatch, and the real ramp from the map
                  style rather than a 2-stop approximation of it. */}
              <div className='space-y-1.5'>
                <div
                  className='h-3 rounded-full'
                  style={{ background: getScoreGradientCss() }}
                />
                <p className='text-xs text-muted-foreground text-center'>
                  {t('mapDescription.scale')}
                </p>
              </div>
              <p className='text-foreground leading-relaxed'>
                {t('mapDescription.scores')}
              </p>
              <p className='text-foreground leading-relaxed'>
                {t('mapDescription.polygons')}
              </p>
            </CardContent>
          </Card>

          {/* Functions Section */}
          <Card className='mb-8'>
            <CardHeader>
              <CardTitle className='text-2xl'>{t('functions.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className='grid md:grid-cols-2 gap-4'>
                {functions.map(func => (
                  <div
                    key={func.text}
                    className='flex items-center gap-4 p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors'
                  >
                    <func.icon
                      className={`h-6 w-6 ${func.color} flex-shrink-0`}
                    />
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

          {/* Map Interaction Section */}
          <Card className='mb-8'>
            <CardHeader>
              <CardTitle className='text-2xl'>
                {t('mapInteraction.title')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className='flex items-center gap-4 p-4 rounded-lg bg-muted'>
                <Globe className='h-6 w-6 text-primary-text' />
                <span className='text-foreground'>
                  {t('mapInteraction.maps')}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* About Section */}
          <Card className='mb-8'>
            <CardHeader>
              <CardTitle className='text-2xl'>{t('about.title')}</CardTitle>
            </CardHeader>
            <CardContent className='space-y-6'>
              <p className='text-foreground leading-relaxed'>
                {t('about.description')}
              </p>
              <p className='text-foreground leading-relaxed'>
                {t('about.dataCombination')}
              </p>
              <p className='text-foreground leading-relaxed'>
                {t('about.climateChange')}
              </p>
              <p className='text-foreground leading-relaxed'>
                {t('about.currentStatus')}
              </p>

              <div>
                <h4 className='text-xl font-semibold text-foreground dark:text-white mb-4'>
                  {t('about.keyFeatures.title')}
                </h4>
                <div className='grid md:grid-cols-2 gap-4'>
                  {keyFeatures.map(feature => (
                    <div
                      key={feature.text}
                      className='flex items-start gap-3 p-3 rounded-lg bg-muted/50'
                    >
                      <feature.icon className='h-5 w-5 text-primary-text mt-0.5 flex-shrink-0' />
                      <span className='text-foreground text-sm'>
                        {feature.text}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

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
                <p className='font-semibold text-foreground dark:text-white mb-3'>
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
                <h4 className='text-xl font-semibold text-foreground dark:text-white mb-4'>
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
                <h4 className='text-xl font-semibold text-foreground dark:text-white mb-4'>
                  {t('prediction.keyDatasets.title')}
                </h4>

                <div className='space-y-6'>
                  <div className='p-4 rounded-lg bg-muted'>
                    <h5 className='font-semibold text-foreground dark:text-white mb-2'>
                      {t('prediction.keyDatasets.corine.title')}
                    </h5>
                    <p className='text-foreground text-sm mb-2'>
                      {t('prediction.keyDatasets.corine.description')}
                    </p>
                    <p className='text-muted-foreground text-xs'>
                      {t('prediction.keyDatasets.corine.source')}
                    </p>
                    <p className='text-muted-foreground text-xs'>
                      {t('prediction.keyDatasets.corine.citation')}
                    </p>
                  </div>

                  <div className='p-4 rounded-lg bg-secondary'>
                    <h5 className='font-semibold text-foreground dark:text-white mb-2'>
                      {t('prediction.keyDatasets.soilPh.title')}
                    </h5>
                    <p className='text-foreground text-sm mb-2'>
                      {t('prediction.keyDatasets.soilPh.description')}
                    </p>
                    <p className='text-muted-foreground text-xs'>
                      {t('prediction.keyDatasets.soilPh.source')}
                    </p>
                    <p className='text-muted-foreground text-xs'>
                      {t('prediction.keyDatasets.soilPh.citation')}
                    </p>
                  </div>

                  <div className='p-4 rounded-lg bg-status-warning-background'>
                    <h5 className='font-semibold text-foreground dark:text-white mb-2'>
                      {t('prediction.keyDatasets.nlcd.title')}
                    </h5>
                    <p className='text-foreground text-sm mb-2'>
                      {t('prediction.keyDatasets.nlcd.description')}
                    </p>
                    <p className='text-muted-foreground text-xs'>
                      {t('prediction.keyDatasets.nlcd.source')}
                    </p>
                    <p className='text-muted-foreground text-xs'>
                      {t('prediction.keyDatasets.nlcd.citation')}
                    </p>
                  </div>

                  <div className='p-4 rounded-lg bg-muted'>
                    <h5 className='font-semibold text-foreground dark:text-white mb-2'>
                      {t('prediction.keyDatasets.eudem.title')}
                    </h5>
                    <p className='text-foreground text-sm mb-2'>
                      {t('prediction.keyDatasets.eudem.description')}
                    </p>
                    <p className='text-muted-foreground text-xs'>
                      {t('prediction.keyDatasets.eudem.source')}
                    </p>
                    <p className='text-muted-foreground text-xs'>
                      {t('prediction.keyDatasets.eudem.citation')}
                    </p>
                  </div>

                  <div className='p-4 rounded-lg bg-muted'>
                    <h5 className='font-semibold text-foreground dark:text-white mb-2'>
                      {t('prediction.keyDatasets.hydrosheds.title')}
                    </h5>
                    <p className='text-foreground text-sm mb-2'>
                      {t('prediction.keyDatasets.hydrosheds.description')}
                    </p>
                    <p className='text-muted-foreground text-xs'>
                      {t('prediction.keyDatasets.hydrosheds.source')}
                    </p>
                    <p className='text-muted-foreground text-xs'>
                      {t('prediction.keyDatasets.hydrosheds.citation')}
                    </p>
                  </div>

                  <p className='text-foreground text-sm'>
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
