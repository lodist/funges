import { useTranslation } from 'react-i18next';
import SEO from '@/components/SEO';

export default function TermsUsePage() {
  const { t } = useTranslation('terms');
  const { t: tCommon } = useTranslation('common');

  return (
    <>
      <SEO
        title={t('title')}
        description={t('welcome.title')}
        canonicalUrl={`${import.meta.env.BASE_URL}termsuse`}
      />
      <div className='terms-use-page max-w-4xl mx-auto px-4 py-8'>
        <div className='space-y-8'>
          {/* Header */}
          <div className='text-center'>
            <h1 className='text-3xl font-bold text-gray-900 dark:text-white mb-4'>
              {t('title')}
            </h1>
            <p className='text-lg text-gray-600 dark:text-gray-300 leading-relaxed max-w-3xl mx-auto'>
              {t('welcome.title')}
            </p>
          </div>

          {/* Use of the Service */}
          <section className='bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm'>
            <h2 className='text-xl font-semibold text-gray-900 dark:text-white mb-4'>
              {t('useOfService.title')}
            </h2>
            <p className='text-gray-700 dark:text-gray-300 leading-relaxed'>
              {t('useOfService.content')}
            </p>
          </section>

          {/* Foraging Disclaimer */}
          <section className='bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm'>
            <h2 className='text-xl font-semibold text-gray-900 dark:text-white mb-4'>
              {t('foragingDisclaimer.title')}
            </h2>
            <div className='space-y-4 text-gray-700 dark:text-gray-300 leading-relaxed'>
              <p>{t('foragingDisclaimer.content')}</p>
              <p>{t('foragingDisclaimer.misidentification')}</p>
              <p>{t('foragingDisclaimer.preparation')}</p>
            </div>
          </section>

          {/* Disclaimer of Liability */}
          <section className='bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm'>
            <h2 className='text-xl font-semibold text-gray-900 dark:text-white mb-4'>
              {t('disclaimer.title')}
            </h2>
            <div className='space-y-4 text-gray-700 dark:text-gray-300 leading-relaxed'>
              <p>{t('disclaimer.content')}</p>
            </div>
          </section>

          {/* No Professional Advice */}
          <section className='bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm'>
            <h2 className='text-xl font-semibold text-gray-900 dark:text-white mb-4'>
              {t('noProfessionalAdvice.title')}
            </h2>
            <p className='text-gray-700 dark:text-gray-300 leading-relaxed'>
              {t('noProfessionalAdvice.content')}
            </p>
          </section>

          {/* Third-Party Content and Services */}
          <section className='bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm'>
            <h2 className='text-xl font-semibold text-gray-900 dark:text-white mb-4'>
              {t('thirdParty.title')}
            </h2>
            <p className='text-gray-700 dark:text-gray-300 leading-relaxed'>
              {t('thirdParty.content')}
            </p>
          </section>

          {/* Intellectual Property */}
          <section className='bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm'>
            <h2 className='text-xl font-semibold text-gray-900 dark:text-white mb-4'>
              {t('intellectualProperty.title')}
            </h2>
            <p className='text-gray-700 dark:text-gray-300 leading-relaxed'>
              {t('intellectualProperty.content')}
            </p>
          </section>

          {/* Prohibited Use */}
          <section className='bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm'>
            <h2 className='text-xl font-semibold text-gray-900 dark:text-white mb-4'>
              {t('prohibitedUse.title')}
            </h2>
            <div className='space-y-4'>
              <p className='text-gray-700 dark:text-gray-300 leading-relaxed'>
                {t('prohibitedUse.intro')}
              </p>
              <ul className='space-y-2 text-gray-700 dark:text-gray-300'>
                {(
                  t('prohibitedUse.items', { returnObjects: true }) as string[]
                ).map((item: string) => (
                  <li key={item} className='flex items-start'>
                    <span className='text-red-600 dark:text-red-400 mr-2'>
                      •
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* Changes to the Terms */}
          <section className='bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm'>
            <h2 className='text-xl font-semibold text-gray-900 dark:text-white mb-4'>
              {t('changes.title')}
            </h2>
            <p className='text-gray-700 dark:text-gray-300 leading-relaxed'>
              {t('changes.content')}
            </p>
          </section>

          {/* Governing Law */}
          <section className='bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm'>
            <h2 className='text-xl font-semibold text-gray-900 dark:text-white mb-4'>
              {t('governingLaw.title')}
            </h2>
            <p className='text-gray-700 dark:text-gray-300 leading-relaxed'>
              {t('governingLaw.content')}
            </p>
          </section>

          {/* Contact */}
          <section className='bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm'>
            <h2 className='text-xl font-semibold text-gray-900 dark:text-white mb-4'>
              {t('contact.title')}
            </h2>
            <div className='space-y-2 text-gray-700 dark:text-gray-300'>
              <p>{t('contact.intro')}</p>
              <p>
                <span className='font-medium'>{tCommon('common.email')}:</span>{' '}
                <a
                  href={`mailto:${t('contact.email')}`}
                  className='text-blue-600 dark:text-blue-400 hover:underline'
                >
                  {t('contact.email')}
                </a>
              </p>
            </div>
          </section>

          {/* Last Updated */}
          <div className='text-center text-sm text-gray-500 dark:text-gray-400 pt-4'>
            {t('lastUpdated')}
          </div>
        </div>
      </div>
    </>
  );
}
