import { useTranslation } from 'react-i18next';
import SEO from '@/components/SEO';

export default function ImpressumPage() {
  const { t } = useTranslation('impressum');
  const { t: tCommon } = useTranslation('common');

  return (
    <>
      <SEO
        title={t('title')}
        description={t('subtitle')}
        canonicalUrl={`${import.meta.env.BASE_URL}impressum`}
      />
      <div className='impressum-page max-w-4xl mx-auto px-4 py-8'>
        <div className='space-y-8'>
          {/* Header */}
          <div className='text-center'>
            <h1 className='text-3xl font-bold text-foreground dark:text-white mb-2'>
              {t('title')}
            </h1>
            <h2 className='text-xl text-muted-foreground'>{t('subtitle')}</h2>
          </div>

          {/* Responsible Entity */}
          <section className='bg-card rounded-lg p-6 shadow-sm'>
            <h3 className='text-lg font-semibold text-foreground dark:text-white mb-4'>
              {t('responsibleEntity.title')}
            </h3>
            <div className='space-y-1 text-foreground'>
              <p className='font-medium'>{t('responsibleEntity.name')}</p>
              <p>{t('responsibleEntity.address')}</p>
              <p>{t('responsibleEntity.city')}</p>
              <p>{t('responsibleEntity.country')}</p>
            </div>
          </section>

          {/* Administrator */}
          <section className='bg-card rounded-lg p-6 shadow-sm'>
            <h3 className='text-lg font-semibold text-foreground dark:text-white mb-4'>
              {t('administrator.title')}
            </h3>
            <div className='space-y-1 text-foreground'>
              <p className='font-medium'>{t('administrator.name')}</p>
              <p>{t('administrator.address')}</p>
              <p>{t('administrator.city')}</p>
              <p>{t('administrator.country')}</p>
              <p>
                <span className='font-medium'>{tCommon('common.email')}:</span>{' '}
                <a
                  href={`mailto:${t('administrator.email')}`}
                  className='text-primary-text hover:underline'
                >
                  {t('administrator.email')}
                </a>
              </p>
            </div>
          </section>

          {/* Disclaimer */}
          <section className='bg-card rounded-lg p-6 shadow-sm'>
            <h3 className='text-lg font-semibold text-foreground dark:text-white mb-4'>
              {t('disclaimer.title')}
            </h3>
            <p className='text-foreground leading-relaxed'>
              {t('disclaimer.content')}
            </p>
          </section>

          {/* Disclaimer for Content and Links */}
          <section className='bg-card rounded-lg p-6 shadow-sm'>
            <h3 className='text-lg font-semibold text-foreground dark:text-white mb-4'>
              {t('disclaimerContent.title')}
            </h3>
            <p className='text-foreground leading-relaxed'>
              {t('disclaimerContent.content')}
            </p>
          </section>

          {/* Last Updated */}
          <div className='text-center text-sm text-muted-foreground pt-4'>
            {t('lastUpdated')}
          </div>
        </div>
      </div>
    </>
  );
}
