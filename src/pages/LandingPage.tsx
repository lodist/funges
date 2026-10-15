import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import SEO from '@/components/SEO';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ArrowRight, ArrowUpRight } from '@/lib/icons';
import styles from './LandingPage.module.scss';

const base = import.meta.env.BASE_URL;

// The sidebar's Help group, in its order: the landing page has no sidebar, so
// these are the only way to the legal pages from here.
const HELP_LINKS = [
  { to: '/support', key: 'support' },
  { to: '/impressum', key: 'impressum' },
  { to: '/privacy-policy', key: 'privacyPolicy' },
  { to: '/termsuse', key: 'termsOfUse' },
] as const;

/* A walk into the wild: photographic atmosphere, then a real map and useful
 * paths into identification and cooking. The established palette, fonts and
 * controls stay intact. Imagery lives in public/landing; its provenance is in
 * .impeccable/surfaces/src-pages-landingpage-tsx.md.
 */
export default function LandingPage() {
  const { t } = useTranslation('common');
  const { t: tNav } = useTranslation('sidebar');

  return (
    <>
      <SEO
        title={t('home.headline')}
        description={t('home.description')}
        canonicalUrl={base}
      />
      <div className={styles.page}>
        <header className={styles.header}>
          <Logo className='h-10 md:h-12' />
          <Link
            to='/worth-foraging-now'
            className={`${styles.textLink} focus-ring`}
          >
            {t('home.ctaSecondary')}
            <ArrowUpRight className='size-5' />
          </Link>
        </header>
        <section className={styles.hero} aria-labelledby='landing-title'>
          <div className={styles.heroCopy}>
            <h1 id='landing-title'>{t('home.headline')}</h1>
            <p className={styles.intro}>{t('home.description')}</p>
            <Button asChild size='lg' className={styles.primaryAction}>
              <Link to='/map'>
                {t('home.cta')}
                <ArrowRight className='size-5' />
              </Link>
            </Button>
          </div>
          <img
            className={styles.heroPhoto}
            src={`${base}landing/astra-porcini.webp`}
            alt=''
            width='960'
            height='1200'
            fetchPriority='high'
          />
        </section>

        <section className={styles.forecast} aria-labelledby='forecast-title'>
          <div className={styles.forecastCopy}>
            <h2 id='forecast-title'>{t('home.forecast.heading')}</h2>
            <p>{t('home.forecast.body')}</p>
            <Button asChild size='lg'>
              <Link to='/worth-foraging-now'>
                {t('home.forecast.link')}
                <ArrowRight className='size-5' />
              </Link>
            </Button>
            <p className={styles.coverage}>{t('home.coverage')}</p>
          </div>
          <div className={styles.mapFigure}>
            <Link
              to='/map'
              search={{
                species: 'pine_bolete',
                lat: 47.38,
                lng: 10.21,
                zoom: 8.7,
              }}
              className={`${styles.mapLink} focus-ring`}
              aria-label={t('home.cta')}
            >
              <img
                src={`${base}landing/alps-map.webp`}
                alt=''
                loading='lazy'
                width='1280'
                height='528'
              />
              <span className={styles.mapAction}>
                {t('home.cta')}
                <ArrowUpRight className='size-5' />
              </span>
            </Link>
            <div className={styles.attribution}>
              <a
                href='https://www.openstreetmap.org/copyright'
                target='_blank'
                rel='noreferrer'
              >
                {'© OpenStreetMap'}
              </a>
              <span>{' · Terrain: Mapzen / AWS'}</span>
            </div>
          </div>
        </section>

        <section
          className={styles.spectacles}
          aria-labelledby='spectacles-title'
        >
          <img
            src={`${base}landing/autumn-beech-road.webp`}
            alt=''
            loading='lazy'
            width='1280'
            height='720'
          />
          <div className={styles.spectaclesCopy}>
            <h2 id='spectacles-title'>{t('home.spectacles.heading')}</h2>
            <div>
              <p>{t('home.spectacles.body')}</p>
              <Link
                to='/map'
                search={{ species: 'foliage' }}
                className={`${styles.textLink} focus-ring`}
              >
                {t('home.spectacles.link')}
                <ArrowUpRight className='size-5' />
              </Link>
            </div>
          </div>
        </section>

        <div className={styles.featureGrid}>
          <section className={styles.feature} aria-labelledby='identify-title'>
            <img
              src={`${base}landing/lingonberries-pine-forest.webp`}
              alt=''
              loading='lazy'
              width='768'
              height='576'
            />
            <div className={styles.sectionCopy}>
              <h2 id='identify-title'>{t('home.identify.heading')}</h2>
              <p>{t('home.identify.body')}</p>
              <Link
                to='/map'
                search={{ identify: true }}
                className={`${styles.textLink} focus-ring`}
              >
                {t('home.identify.link')}
                <ArrowUpRight className='size-5' />
              </Link>
              {/* PRODUCT.md: safety stays unmissable in every treatment, so
                  this takes IdentifyPanel's permanent-notice look rather than
                  a muted caption. */}
              <p className={styles.safety}>
                <AlertTriangle className='size-4' />
                {t('home.identify.safety')}
              </p>
            </div>
          </section>
          <section className={styles.feature} aria-labelledby='cook-title'>
            <img
              src={`${base}landing/wild-mushroom-toast.webp`}
              alt=''
              loading='lazy'
              width='768'
              height='576'
            />
            <div className={styles.sectionCopy}>
              <h2 id='cook-title'>{t('home.cook.heading')}</h2>
              <p>{t('home.cook.body')}</p>
              <Link to='/recipes' className={`${styles.textLink} focus-ring`}>
                {t('home.cook.link')}
                <ArrowUpRight className='size-5' />
              </Link>
            </div>
          </section>
        </div>
        <footer className={styles.closing}>
          <div className={styles.invite}>
            <h2>{t('home.closing.heading')}</h2>
            <Button asChild size='lg'>
              <Link to='/map'>
                {t('home.closing.cta')}
                <ArrowRight className='size-5' />
              </Link>
            </Button>
          </div>
          <nav className={styles.helpLinks} aria-label={tNav('help')}>
            {HELP_LINKS.map(({ to, key }) => (
              <Link key={to} to={to} className='focus-ring'>
                {tNav(key)}
              </Link>
            ))}
          </nav>
        </footer>
      </div>
    </>
  );
}
