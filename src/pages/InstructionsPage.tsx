import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import SEO from '@/components/SEO';
import { Separator } from '@/components/ui/separator';
import {
  Map,
  Navigation,
  Moon,
  Hash,
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
} from 'lucide-react';

export default function InstructionsPage() {
  const { t } = useTranslation('instructions');

  const functions = [
    {
      icon: ChefHat,
      text: t('functions.recipes'),
      color: 'text-emerald-600',
    },
    {
      icon: Navigation,
      text: t('functions.location'),
      color: 'text-purple-600',
    },
    { icon: Moon, text: t('functions.theme'), color: 'text-gray-600' },
    { icon: Hash, text: t('functions.numbers'), color: 'text-orange-600' },
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
            <h1 className='text-3xl font-bold text-gray-900 dark:text-white mb-2'>
              {t('title')}
            </h1>
            <h2 className='text-xl text-gray-600 dark:text-gray-300'>
              {t('subtitle')}
            </h2>
          </div>

          {/* Map Description Section */}
          <Card className='py-6'>
            <CardHeader>
              <CardTitle className='flex items-center gap-3 text-2xl'>
                <Map className='h-8 w-8 text-green-600 hidden lg:block' />
                {t('mapDescription.intro')}
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-4'>
              <p className='text-gray-700 dark:text-gray-300 leading-relaxed'>
                {t('mapDescription.selection')}
              </p>
              <p className='text-gray-700 dark:text-gray-300 leading-relaxed'>
                {t('mapDescription.colorCoding')}
              </p>
              <div className='bg-gradient-to-r from-[#FFFFCD] to-[#800020] min-h-8 px-3 py-2 rounded-lg flex items-center justify-center text-white font-semibold text-xs sm:text-sm text-center'>
                {t('mapDescription.scale')}
              </div>
              <p className='text-gray-700 dark:text-gray-300 leading-relaxed'>
                {t('mapDescription.scores')}
              </p>
              <p className='text-gray-700 dark:text-gray-300 leading-relaxed'>
                {t('mapDescription.polygons')}
              </p>
            </CardContent>
          </Card>

          {/* Functions Section */}
          <Card className='mb-8 shadow-lg border-0 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm py-6'>
            <CardHeader>
              <CardTitle className='text-2xl'>{t('functions.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className='grid md:grid-cols-2 gap-4'>
                {functions.map(func => (
                  <div
                    key={func.text}
                    className='flex items-center gap-4 p-4 rounded-lg bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors'
                  >
                    <func.icon
                      className={`h-6 w-6 ${func.color} flex-shrink-0`}
                    />
                    <span className='text-gray-700 dark:text-gray-300'>
                      {func.text}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Map Interaction Section */}
          <Card className='mb-8 shadow-lg border-0 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm py-6'>
            <CardHeader>
              <CardTitle className='text-2xl'>
                {t('mapInteraction.title')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className='flex items-center gap-4 p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20'>
                <Globe className='h-6 w-6 text-blue-600' />
                <span className='text-gray-700 dark:text-gray-300'>
                  {t('mapInteraction.maps')}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* About Section */}
          <Card className='mb-8 shadow-lg border-0 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm py-6'>
            <CardHeader>
              <CardTitle className='text-2xl'>{t('about.title')}</CardTitle>
            </CardHeader>
            <CardContent className='space-y-6'>
              <p className='text-gray-700 dark:text-gray-300 leading-relaxed'>
                {t('about.description')}
              </p>
              <p className='text-gray-700 dark:text-gray-300 leading-relaxed'>
                {t('about.dataCombination')}
              </p>
              <p className='text-gray-700 dark:text-gray-300 leading-relaxed'>
                {t('about.climateChange')}
              </p>
              <p className='text-gray-700 dark:text-gray-300 leading-relaxed'>
                {t('about.currentStatus')}
              </p>

              <Separator />

              <div>
                <h4 className='text-xl font-semibold text-gray-900 dark:text-white mb-4'>
                  {t('about.keyFeatures.title')}
                </h4>
                <div className='grid md:grid-cols-2 gap-4'>
                  {keyFeatures.map(feature => (
                    <div
                      key={feature.text}
                      className='flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50'
                    >
                      <feature.icon className='h-5 w-5 text-green-600 mt-0.5 flex-shrink-0' />
                      <span className='text-gray-700 dark:text-gray-300 text-sm'>
                        {feature.text}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Mission Section */}
          <Card className='mb-8 shadow-lg border-0 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm py-6'>
            <CardHeader>
              <CardTitle className='flex items-center gap-3 text-2xl'>
                <Target className='h-8 w-8 text-green-600 hidden lg:block' />
                {t('mission.title')}
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-4'>
              <p className='text-gray-700 dark:text-gray-300 leading-relaxed'>
                {t('mission.commitment')}
              </p>
              <p className='text-gray-700 dark:text-gray-300 leading-relaxed'>
                {t('mission.goal')}
              </p>
              <p className='text-gray-700 dark:text-gray-300 leading-relaxed'>
                {t('mission.sustainability')}
              </p>
              <p className='text-gray-700 dark:text-gray-300 leading-relaxed'>
                {t('mission.community')}
              </p>
              <p className='text-gray-700 dark:text-gray-300 leading-relaxed'>
                {t('mission.openAccess')}
              </p>
            </CardContent>
          </Card>

          {/* Prediction Section */}
          <Card className='mb-8 shadow-lg border-0 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm py-6'>
            <CardHeader>
              <CardTitle className='flex items-center gap-3 text-2xl'>
                <Lightbulb className='h-8 w-8 text-green-600 hidden lg:block' />
                {t('prediction.title')}
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-6'>
              <p className='text-gray-700 dark:text-gray-300 leading-relaxed'>
                {t('prediction.description')}
              </p>

              <div>
                <p className='font-semibold text-gray-900 dark:text-white mb-3'>
                  {t('prediction.monitorTitle')}
                </p>
                <div className='space-y-2'>
                  {variables.map(variable => (
                    <div
                      key={variable.text}
                      className='flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50'
                    >
                      <variable.icon className='h-5 w-5 text-green-600 flex-shrink-0' />
                      <span className='text-gray-700 dark:text-gray-300'>
                        {variable.text}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <p className='text-gray-700 dark:text-gray-300 leading-relaxed'>
                {t('prediction.goal')}
              </p>

              <Separator />

              <div>
                <h4 className='text-xl font-semibold text-gray-900 dark:text-white mb-4'>
                  {t('prediction.methodology.title')}
                </h4>
                <p className='text-gray-700 dark:text-gray-300 leading-relaxed mb-3'>
                  {t('prediction.methodology.description')}
                </p>
                <p className='text-gray-700 dark:text-gray-300 leading-relaxed'>
                  {t('prediction.methodology.datasets')}
                </p>
              </div>

              <Separator />

              <div>
                <h4 className='text-xl font-semibold text-gray-900 dark:text-white mb-4'>
                  {t('prediction.keyDatasets.title')}
                </h4>

                <div className='space-y-6'>
                  <div className='p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20'>
                    <h5 className='font-semibold text-gray-900 dark:text-white mb-2'>
                      {t('prediction.keyDatasets.corine.title')}
                    </h5>
                    <p className='text-gray-700 dark:text-gray-300 text-sm mb-2'>
                      {t('prediction.keyDatasets.corine.description')}
                    </p>
                    <p className='text-gray-600 dark:text-gray-400 text-xs'>
                      {t('prediction.keyDatasets.corine.source')}
                    </p>
                    <p className='text-gray-600 dark:text-gray-400 text-xs'>
                      {t('prediction.keyDatasets.corine.citation')}
                    </p>
                  </div>

                  <div className='p-4 rounded-lg bg-green-50 dark:bg-green-900/20'>
                    <h5 className='font-semibold text-gray-900 dark:text-white mb-2'>
                      {t('prediction.keyDatasets.soilPh.title')}
                    </h5>
                    <p className='text-gray-700 dark:text-gray-300 text-sm mb-2'>
                      {t('prediction.keyDatasets.soilPh.description')}
                    </p>
                    <p className='text-gray-600 dark:text-gray-400 text-xs'>
                      {t('prediction.keyDatasets.soilPh.source')}
                    </p>
                    <p className='text-gray-600 dark:text-gray-400 text-xs'>
                      {t('prediction.keyDatasets.soilPh.citation')}
                    </p>
                  </div>

                  <div className='p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20'>
                    <h5 className='font-semibold text-gray-900 dark:text-white mb-2'>
                      {t('prediction.keyDatasets.nlcd.title')}
                    </h5>
                    <p className='text-gray-700 dark:text-gray-300 text-sm mb-2'>
                      {t('prediction.keyDatasets.nlcd.description')}
                    </p>
                    <p className='text-gray-600 dark:text-gray-400 text-xs'>
                      {t('prediction.keyDatasets.nlcd.source')}
                    </p>
                    <p className='text-gray-600 dark:text-gray-400 text-xs'>
                      {t('prediction.keyDatasets.nlcd.citation')}
                    </p>
                  </div>

                  <p className='text-gray-700 dark:text-gray-300 text-sm'>
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
