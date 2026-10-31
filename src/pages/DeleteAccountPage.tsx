import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import SEO from '@/components/SEO';
import { Button } from '@/components/ui/button';

/** How to delete a Huerta account, reachable without the app: the web link
 *  Google Play asks for. Built like the privacy policy, whose texts it shares. */
export default function DeleteAccountPage() {
  const { t } = useTranslation('privacy');
  const email = t('contact.email');
  const steps = t('deleteAccount.steps', { returnObjects: true }) as string[];
  // The address inside the sentence, as a link: the text around it, either side.
  const other = t('deleteAccount.other', { email: '@@' }).split('@@');

  return (
    <>
      <SEO
        title={t('deleteAccount.title')}
        description={t('deleteAccount.intro')}
        canonicalUrl={`${import.meta.env.BASE_URL}delete-account`}
      />
      <div className='max-w-4xl mx-auto px-4 py-8'>
        <div className='space-y-8'>
          <div className='text-center'>
            <h1 className='text-3xl font-bold text-foreground dark:text-white mb-4'>
              {t('deleteAccount.title')}
            </h1>
            <p className='text-lg text-muted-foreground leading-relaxed max-w-3xl mx-auto'>
              {t('deleteAccount.intro')}
            </p>
          </div>

          <section className='bg-card rounded-lg p-6 shadow-sm'>
            <h2 className='text-xl font-semibold text-foreground dark:text-white mb-4'>
              {t('deleteAccount.stepsTitle')}
            </h2>
            <ol className='list-decimal space-y-2 pl-6 text-foreground leading-relaxed'>
              {steps.map(step => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <div className='mt-6'>
              <Button asChild>
                <Link to='/huerta'>{t('deleteAccount.open')}</Link>
              </Button>
            </div>
          </section>

          <section className='bg-card rounded-lg p-6 shadow-sm'>
            <div className='space-y-4 text-foreground leading-relaxed'>
              <p>{t('deleteAccount.what')}</p>
              <p>
                {other[0]}
                <a
                  href={`mailto:${email}`}
                  className='font-medium text-primary-text underline underline-offset-4'
                >
                  {email}
                </a>
                {other[1]}
              </p>
              <p>
                <Link
                  to='/privacy-policy'
                  className='font-medium text-primary-text underline underline-offset-4'
                >
                  {t('deleteAccount.privacy')}
                </Link>
              </p>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
