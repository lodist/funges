import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import SEO from '@/components/SEO';
import { Logo } from '@/components/Logo';
import { SpaceTab } from '@/components/SpaceTab';
import { Button } from '@/components/ui/button';
import { BAND_OUTLINE_CLASS } from '@/lib/band-surface';
import {
  ArrowRight,
  ArrowUpRight,
  Droplets,
  Shovel,
  Snowflake,
} from '@/lib/icons';
import styles from './LandingPage.module.scss';

const base = import.meta.env.BASE_URL;

// As on Terra's front page: the landing has no sidebar, so these are the only
// way to the legal pages from here.
const HELP_LINKS = [
  { to: '/support', key: 'support' },
  { to: '/impressum', key: 'impressum' },
  { to: '/privacy-policy', key: 'privacyPolicy' },
  { to: '/termsuse', key: 'termsOfUse' },
] as const;

// The garden's season, as Terra's hero follows the forager's: frosted kale in
// winter, peas going in in spring, tomatoes in summer, garlic in autumn.
const HERO_PHOTOS = [
  'huerta-hero-winter.webp',
  'huerta-hero-spring.webp',
  'huerta-hero-summer.webp',
  'huerta-hero-autumn.webp',
] as const;
const heroPhoto = (date: Date) =>
  HERO_PHOTOS[Math.floor(((date.getMonth() + 1) % 12) / 3)];

// The year from seed to plate, each step opening the page that does it.
const STEPS = [
  { id: 'plan', to: '/huerta/planner' },
  { id: 'plant', to: '/huerta/in-season' },
  { id: 'care', to: '/huerta/map' },
  { id: 'harvest', to: '/huerta/year' },
] as const;

// A week as the garden page lists it: a sample, the same in every language.
const WEEK = [
  { id: 'plant', icon: Shovel },
  { id: 'water', icon: Droplets },
  { id: 'frost', icon: Snowflake },
] as const;

/* Terra's front page in Huerta's colours, block for block: the hero with the
 * season's photograph, the companion's week on sand, the year from seed to
 * plate, and the close. Terra is one tab away, on the left. */
export default function HuertaLandingPage() {
  const { t } = useTranslation('huerta');
  const { t: tNav } = useTranslation('sidebar');

  return (
    <>
      <SEO
        title={t('landing.headline')}
        description={t('landing.intro')}
        canonicalUrl={`${base}huerta`}
      />
      <div className={styles.page}>
        <section className={styles.hero} aria-labelledby='landing-title'>
          <SpaceTab to='terra' />
          <header className={styles.header}>
            <Logo className='h-10 md:h-12' />
            <Link
              to='/huerta/in-season'
              className={`${styles.textLink} focus-ring`}
            >
              {t('landing.headerLink')}
              <ArrowUpRight className='size-5' />
            </Link>
          </header>
          <div className={styles.heroBody}>
            <div className={styles.heroCopy}>
              <h1 id='landing-title'>{t('landing.headline')}</h1>
              <p className={styles.intro}>{t('landing.intro')}</p>
              <div className={styles.choices}>
                <Button asChild size='lg'>
                  <Link to='/huerta/planner'>
                    {t('landing.cta')}
                    <ArrowRight className='size-5' />
                  </Link>
                </Button>
                <Button
                  asChild
                  size='lg'
                  variant='outline'
                  className={BAND_OUTLINE_CLASS}
                >
                  <Link to='/huerta/map'>{tNav('huertaMap')}</Link>
                </Button>
                <Button
                  asChild
                  size='lg'
                  variant='outline'
                  className={BAND_OUTLINE_CLASS}
                >
                  <Link to='/huerta/year'>{tNav('huertaYear')}</Link>
                </Button>
              </div>
              {/* Huerta is new: say so, and where to say what's off. */}
              <p className={styles.early}>
                {t('landing.early')}{' '}
                <Link to='/support' className='focus-ring'>
                  {t('landing.feedback')}
                </Link>
              </p>
            </div>
            <img
              className={styles.heroPhoto}
              src={`${base}landing/${heroPhoto(new Date())}`}
              alt=''
              width='960'
              height='1200'
              fetchPriority='high'
            />
          </div>
        </section>

        <section className={styles.forecast} aria-labelledby='week-title'>
          <div className={styles.forecastCopy}>
            <h2 id='week-title'>{t('landing.week.heading')}</h2>
            <p>{t('landing.week.body')}</p>
            <div className={styles.week}>
              <h3>{t('landing.week.title')}</h3>
              <ul>
                {WEEK.map(({ id, icon: Icon }) => (
                  <li key={id}>
                    <Icon className='size-5' />
                    <span>
                      <strong>{t(`landing.week.${id}.job`)}</strong>
                      <small>{t(`landing.week.${id}.why`)}</small>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <Button asChild size='lg'>
              <Link to='/huerta/planner'>
                {t('landing.cta')}
                <ArrowRight className='size-5' />
              </Link>
            </Button>
            <p className={styles.coverage}>{t('landing.coverage')}</p>
          </div>
        </section>

        <section className={styles.journey} aria-labelledby='journey-title'>
          <h2 id='journey-title'>{t('landing.journey')}</h2>
          <ol className={styles.timeline}>
            {STEPS.map(step => (
              <li key={step.id} className={styles.step}>
                <img
                  src={`${base}landing/huerta-step-${step.id}.webp`}
                  alt=''
                  loading='lazy'
                  width='768'
                  height='576'
                />
                <span aria-hidden='true' className={styles.node} />
                <div className={styles.stepCopy}>
                  <h3>{t(`landing.${step.id}.heading`)}</h3>
                  <p>{t(`landing.${step.id}.body`)}</p>
                  <Link
                    to={step.to}
                    className={`${styles.textLink} focus-ring`}
                  >
                    {t(`landing.${step.id}.link`)}
                    <ArrowUpRight className='size-5' />
                  </Link>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <footer className={styles.closing}>
          <div className={styles.invite}>
            <h2>{t('landing.closing')}</h2>
            <Button asChild size='lg'>
              <Link to='/huerta/planner'>
                {t('landing.cta')}
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
