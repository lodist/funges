import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import SEO from '@/components/SEO';
import { CROPS, type Crop } from '@/lib/huerta';
import {
  alternates,
  huertaPage,
  localizedPath,
  pathLanguage,
} from '@/lib/seo-pages';
import { Logo } from '@/components/Logo';
import { SpaceTab } from '@/components/SpaceTab';
import { Button } from '@/components/ui/button';
import { BAND_OUTLINE_CLASS } from '@/lib/band-surface';
import { heroPhoto } from '@/lib/hero-photos';
import { isPlayApp } from '@/lib/platform';
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

// The year from seed to plate, each step opening the page that does it.
const STEPS = [
  { id: 'plan', page: 'planner' },
  { id: 'plant', page: 'crops' },
  { id: 'care', page: 'map' },
  { id: 'harvest', page: 'calendar' },
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
  const { t, i18n } = useTranslation('huerta');
  const { t: tNav } = useTranslation('sidebar');
  // The garden's pages, in the visitor's language's words.
  const page = (p: Parameters<typeof huertaPage>[0]) =>
    huertaPage(p, i18n.language);

  return (
    <>
      <SEO
        title={t('landing.headline')}
        description={t('landing.intro')}
        canonicalUrl={localizedPath(
          '/huerta/',
          pathLanguage(window.location.pathname) ?? 'en'
        )}
        alternates={alternates('/huerta/', window.location.origin)}
      />
      <div className={styles.page}>
        <section className={styles.hero} aria-labelledby='landing-title'>
          <SpaceTab to='terra' />
          <header className={styles.header}>
            {/* Logo = home, as in the sidebar: the front page the spaces open from. */}
            <Link
              to='/'
              className='focus-ring inline-flex min-h-11 items-center rounded-md'
            >
              <Logo className='h-10 md:h-12' />
            </Link>
            <Link
              to={page('crops')}
              className={`${styles.textLink} focus-ring`}
            >
              {t('landing.headerLink')}
              <ArrowUpRight className='size-5' />
            </Link>
          </header>
          <div className={styles.heroBody}>
            <div className={styles.heroCopy}>
              <h1 id='landing-title'>{t('landing.headline')}</h1>
              <HuertaLiveLine />
              <div className={styles.choices}>
                <Button asChild size='lg'>
                  <Link to={page('planner')}>
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
                  <Link to={page('map')}>{tNav('huertaMap')}</Link>
                </Button>
                <Button
                  asChild
                  size='lg'
                  variant='outline'
                  className={BAND_OUTLINE_CLASS}
                >
                  <Link to={page('calendar')}>{tNav('huertaYear')}</Link>
                </Button>
              </div>
              {/* Huerta is new: say so, and where to say what's off (the
                  Play app has no Support page: Play's payments policy). */}
              <p className={styles.early}>
                {t('landing.early')}
                {isPlayApp() ? null : (
                  <>
                    {' '}
                    <Link to='/support' className='focus-ring'>
                      {t('landing.feedback')}
                    </Link>
                  </>
                )}
              </p>
            </div>
            <img
              className={styles.heroPhoto}
              src={`${base}${heroPhoto('huerta')}`}
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
              <Link to={page('planner')}>
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
                    to={page(step.page)}
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
              <Link to={page('planner')}>
                {t('landing.cta')}
                <ArrowRight className='size-5' />
              </Link>
            </Button>
          </div>
          <nav className={styles.helpLinks} aria-label={tNav('help')}>
            {HELP_LINKS.filter(
              ({ to }) => to !== '/support' || !isPlayApp()
            ).map(({ to, key }) => (
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

// ponytail: the continent comes from the time zone, as on Terra's live line.
const AREA = Intl.DateTimeFormat()
  .resolvedOptions()
  .timeZone.startsWith('America/')
  ? 'northAmerica'
  : 'europe';

/** What goes in now, from tonight's forecast (public/data/huerta_now.json,
 *  the areas counted as Terra's live line counts them): the vegetable going in
 *  at the most areas, or, when none is (mid-winter), whatever crop is. Until
 *  the data arrives, or when nothing goes in at all, the plain description. */
export function HuertaLiveLine() {
  const { t, i18n } = useTranslation('huerta');
  const [top, setTop] = useState<{ crop: Crop; areas: number } | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`${base}data/huerta_now.json`)
      .then(response => response.json())
      .then((data: Partial<Record<typeof AREA, Record<string, number>>>) => {
        const ranked = Object.entries(data[AREA] ?? {})
          .flatMap(([id, areas]) => {
            const crop = CROPS.find(c => c.id === id);
            return crop ? [{ crop, areas }] : [];
          })
          .sort((a, b) => b.areas - a.areas);
        // Vegetables first, as Terra's line puts mushrooms first, but not the
        // ones planted once for years (rhubarb, asparagus, artichoke).
        const vegetable = ranked.find(
          r => r.areas >= 10 && r.crop.kind === 'vegetable' && !r.crop.note
        );
        if (live) setTop(vegetable ?? ranked[0] ?? null);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  if (!top) {
    return <p className={styles.intro}>{t('landing.intro')}</p>;
  }
  return (
    <p className={styles.live}>
      <span aria-hidden='true' className={styles.liveDot} />
      <span>
        {t(`landing.live.${top.crop.how}`, {
          crop: t(`crops.${top.crop.id}`),
          areas: top.areas.toLocaleString(i18n.language),
          area: t(`common:home.live.${AREA}`),
        })}
      </span>
    </p>
  );
}
