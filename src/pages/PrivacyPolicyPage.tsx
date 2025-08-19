import { useTranslation } from 'react-i18next';
import SEO from '@/components/SEO';

export default function PrivacyPolicyPage() {
  const { t } = useTranslation('privacy');
  const { t: tCommon } = useTranslation('common');

  return (
    <>
      <SEO
        title={t('title')}
        description={t('subtitle')}
        canonicalUrl={`${import.meta.env.BASE_URL}privacy-policy`}
      />
      <div className='privacy-policy-page max-w-4xl mx-auto px-4 py-8'>
        <div className='space-y-8'>
          {/* Header */}
          <div className='text-center'>
            <h1 className='text-3xl font-bold text-gray-900 dark:text-white mb-4'>
              {t('title')}
            </h1>
            <p className='text-lg text-gray-600 dark:text-gray-300 leading-relaxed max-w-3xl mx-auto'>
              {t('subtitle')}
            </p>
          </div>

          {/* Scope */}
          <section className='bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm'>
            <h2 className='text-xl font-semibold text-gray-900 dark:text-white mb-4'>
              {t('scope.title')}
            </h2>
            <p className='text-gray-700 dark:text-gray-300 leading-relaxed'>
              {t('scope.content')}
            </p>
          </section>

          {/* Information Collection and Use */}
          <section className='bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm'>
            <h2 className='text-xl font-semibold text-gray-900 dark:text-white mb-4'>
              {t('collection.title')}
            </h2>
            <div className='space-y-4 text-gray-700 dark:text-gray-300 leading-relaxed'>
              <p>{t('collection.content')}</p>
              <p>{t('collection.cookiebot')}</p>
            </div>
          </section>

          {/* Your Rights */}
          <section className='bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm'>
            <h2 className='text-xl font-semibold text-gray-900 dark:text-white mb-4'>
              {t('rights.title')}
            </h2>
            <div className='space-y-4'>
              <p className='text-gray-700 dark:text-gray-300 leading-relaxed'>
                {t('rights.intro')}
              </p>
              <ul className='space-y-2 text-gray-700 dark:text-gray-300'>
                <li className='flex items-start'>
                  <span className='text-blue-600 dark:text-blue-400 mr-2'>
                    •
                  </span>
                  {t('rights.access')}
                </li>
                <li className='flex items-start'>
                  <span className='text-blue-600 dark:text-blue-400 mr-2'>
                    •
                  </span>
                  {t('rights.rectification')}
                </li>
                <li className='flex items-start'>
                  <span className='text-blue-600 dark:text-blue-400 mr-2'>
                    •
                  </span>
                  {t('rights.erasure')}
                </li>
                <li className='flex items-start'>
                  <span className='text-blue-600 dark:text-blue-400 mr-2'>
                    •
                  </span>
                  {t('rights.restriction')}
                </li>
                <li className='flex items-start'>
                  <span className='text-blue-600 dark:text-blue-400 mr-2'>
                    •
                  </span>
                  {t('rights.objection')}
                </li>
                <li className='flex items-start'>
                  <span className='text-blue-600 dark:text-blue-400 mr-2'>
                    •
                  </span>
                  {t('rights.portability')}
                </li>
              </ul>
              <p className='text-gray-700 dark:text-gray-300 leading-relaxed'>
                {t('rights.exercise')}
              </p>
            </div>
          </section>

          {/* Data Protection */}
          <section className='bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm'>
            <h2 className='text-xl font-semibold text-gray-900 dark:text-white mb-4'>
              {t('protection.title')}
            </h2>
            <div className='space-y-4 text-gray-700 dark:text-gray-300 leading-relaxed'>
              <p>{t('protection.content')}</p>
              <p>{t('protection.security')}</p>
            </div>
          </section>

          {/* International Transfers */}
          <section className='bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm'>
            <h2 className='text-xl font-semibold text-gray-900 dark:text-white mb-4'>
              {t('transfers.title')}
            </h2>
            <p className='text-gray-700 dark:text-gray-300 leading-relaxed'>
              {t('transfers.content')}
            </p>
          </section>

          {/* Changes to This Privacy Policy */}
          <section className='bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm'>
            <h2 className='text-xl font-semibold text-gray-900 dark:text-white mb-4'>
              {t('changes.title')}
            </h2>
            <p className='text-gray-700 dark:text-gray-300 leading-relaxed'>
              {t('changes.content')}
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
