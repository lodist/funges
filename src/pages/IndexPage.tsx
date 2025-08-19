import { useTranslation } from 'react-i18next';
import SEO from '@/components/SEO';

export default function IndexPage() {
  const { t } = useTranslation('common');
  return (
    <>
      <SEO
        title={t('home.title')}
        description={t('home.description')}
        canonicalUrl={import.meta.env.BASE_URL}
      />
      <div className='index-page'>
        <h1>{t('home.title')}</h1>
        <p>{t('home.subtitle')}</p>
        {/* Main page content will go here */}
      </div>
    </>
  );
}
