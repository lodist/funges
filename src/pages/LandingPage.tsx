import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Trans, useTranslation } from 'react-i18next';
import SEO from '@/components/SEO';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { useSpeciesData } from '@/data/species';
import { BAND_OUTLINE_CLASS } from '@/lib/band-surface';
import { seasonalSpectacle } from '@/lib/bloom';
import { AlertTriangle, ArrowRight, ArrowUpRight } from '@/lib/icons';
import { offersPlayStore, PLAY_STORE_URL } from '@/lib/platform';
import {
  CHANCE,
  formatDay,
  formatShare,
  pooledTally,
  useScorecard,
} from '@/lib/scorecard';
import {
  fetchStrongestSpeciesToday,
  type ScoreRegionId,
} from '@/lib/worth-foraging-now';
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

// The first picture follows the season (meteorological, the same on both
// continents): morel in spring, chanterelles in summer, the porcino in autumn
// and oyster mushrooms in winter. The porcino is shared with Support.
const HERO_PHOTOS = [
  'hero-winter.webp',
  'hero-spring.webp',
  'hero-summer.webp',
  'astra-porcini.webp',
] as const;
const heroPhoto = (date: Date) =>
  HERO_PHOTOS[Math.floor(((date.getMonth() + 1) % 12) / 3)];

// The walk's last two steps; the first, the spectacles, follows the season.
const STEPS = [
  {
    id: 'identify',
    image: `${base}landing/lingonberries-pine-forest.webp`,
    width: 768,
    height: 576,
    // The photo ID page is served with its own headers, so the link loads a
    // fresh document rather than routing client-side (lib/isolation).
    to: '/identify',
    search: undefined,
    reloadDocument: true,
  },
  {
    id: 'cook',
    image: `${base}landing/wild-mushroom-toast.webp`,
    width: 768,
    height: 576,
    to: '/recipes',
    search: undefined,
    reloadDocument: false,
  },
] as const;

/* Colour blocks, one message each, hard edges and no fades: the forest-green
 * hero with tonight's live line and three choices, the forecast on sand under
 * the photograph that hangs into it, the walk from forest to table on bright
 * green, and a green close. Imagery lives in public/landing; its provenance
 * is in .impeccable/surfaces/src-pages-landingpage-tsx.md.
 */
export default function LandingPage() {
  const { t } = useTranslation('common');
  const { t: tNav } = useTranslation('sidebar');
  const { t: tMap } = useTranslation('map');

  // The spectacle on now on the visitor's continent, else the next to start,
  // with its own photograph (foliage shares Support's beech road).
  const { spectacle, inSeason } = seasonalSpectacle(
    new Date(),
    AMERICAS ? ['use', 'usw'] : ['ne', 'se']
  );
  const spectacleStep = {
    id: 'spectacles',
    image:
      spectacle.code === 'foliage'
        ? `${base}landing/autumn-beech-road.webp`
        : `${base}landing/spectacle-${spectacle.code}.webp`,
    width: spectacle.code === 'foliage' ? 1280 : 768,
    height: spectacle.code === 'foliage' ? 720 : 576,
    to: '/map',
    search: { species: spectacle.code },
    reloadDocument: false,
    link: t(inSeason ? 'home.spectacles.now' : 'home.spectacles.next', {
      name: tMap(`${spectacle.keys}.name`),
    }),
  } as const;
  const journey = [
    spectacleStep,
    ...STEPS.map(step => ({ ...step, link: t(`home.${step.id}.link`) })),
  ];

  return (
    <>
      <SEO
        title={t('home.headline')}
        description={t('home.description')}
        canonicalUrl={base}
      />
      <div className={styles.page}>
        <section className={styles.hero} aria-labelledby='landing-title'>
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
          <div className={styles.heroBody}>
            <div className={styles.heroCopy}>
              <h1 id='landing-title'>{t('home.headline')}</h1>
              <LiveLine />
              {/* Three doors: what the visitor came to do, said as buttons. */}
              <div className={styles.choices}>
                <Button asChild size='lg'>
                  <Link to='/map'>
                    {t('home.cta')}
                    <ArrowRight className='size-5' />
                  </Link>
                </Button>
                <Button
                  asChild
                  size='lg'
                  variant='outline'
                  className={BAND_OUTLINE_CLASS}
                >
                  <Link to='/recipes'>{t('home.cook.link')}</Link>
                </Button>
                <Button
                  asChild
                  size='lg'
                  variant='outline'
                  className={BAND_OUTLINE_CLASS}
                >
                  <Link to='/data'>{t('home.data.link')}</Link>
                </Button>
              </div>
            </div>
            {/* Hangs over the block below on a hard edge: the one move that
                ties the hero to the page instead of boxing it in. */}
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

        <section className={styles.forecast} aria-labelledby='forecast-title'>
          <div className={styles.forecastCopy}>
            <h2 id='forecast-title'>{t('home.forecast.heading')}</h2>
            <p>{t('home.forecast.body')}</p>
            <ProofLine />
            <Button asChild size='lg'>
              <Link to='/worth-foraging-now'>
                {t('home.forecast.link')}
                <ArrowRight className='size-5' />
              </Link>
            </Button>
            <p className={styles.coverage}>{t('home.coverage')}</p>
          </div>
        </section>

        <section className={styles.journey} aria-labelledby='journey-title'>
          <h2 id='journey-title'>{t('home.journey.heading')}</h2>
          {/* One line through the three steps and a node at each, photo and
              words trading sides: the walk reads top to bottom. */}
          <ol className={styles.timeline}>
            {journey.map(step => (
              <li key={step.id} className={styles.step}>
                <img
                  src={step.image}
                  alt=''
                  loading='lazy'
                  width={step.width}
                  height={step.height}
                />
                <span aria-hidden='true' className={styles.node} />
                <div className={styles.stepCopy}>
                  <h3>{t(`home.${step.id}.heading`)}</h3>
                  <p>{t(`home.${step.id}.body`)}</p>
                  <Link
                    to={step.to}
                    search={step.search}
                    reloadDocument={step.reloadDocument}
                    className={`${styles.textLink} focus-ring`}
                  >
                    {step.link}
                    <ArrowUpRight className='size-5' />
                  </Link>
                  {step.id === 'identify' ? (
                    // PRODUCT.md: safety stays unmissable in every treatment,
                    // so this keeps the Identify page's permanent-notice look.
                    <p className={styles.safety}>
                      <AlertTriangle className='size-4' />
                      {t('home.identify.safety')}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </section>

        <footer className={styles.closing}>
          <div className={styles.invite}>
            <h2>{t('home.closing.heading')}</h2>
            <div className='flex flex-wrap gap-3'>
              <Button asChild size='lg'>
                <Link to='/map'>
                  {t('home.closing.cta')}
                  <ArrowRight className='size-5' />
                </Link>
              </Button>
              {/* The Play app opens on this page, so it has to know where it
                  is: see offersPlayStore. */}
              {offersPlayStore() ? (
                <Button
                  asChild
                  size='lg'
                  variant='outline'
                  className={BAND_OUTLINE_CLASS}
                >
                  <a href={PLAY_STORE_URL} target='_blank' rel='noopener'>
                    {tNav('googlePlay')}
                    <ArrowUpRight className='size-5' />
                  </a>
                </Button>
              ) : null}
            </div>
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

// ponytail: the continent comes from the time zone, not a location prompt;
// a visitor abroad sees their home continent until they open the map.
const AMERICAS = Intl.DateTimeFormat()
  .resolvedOptions()
  .timeZone.startsWith('America/');
const REGIONS: ScoreRegionId[] = AMERICAS ? ['USE', 'USW'] : ['NE', 'SE'];

/** What is up tonight, from the nightly forecast: the mushroom strong in the
 *  most areas, or, when no mushroom is (mid-winter), whatever is. Until the
 *  data arrives, or when nothing is up at all, the plain description. */
function LiveLine() {
  const { t, i18n } = useTranslation('common');
  const species = useSpeciesData();
  const [top, setTop] = useState<{ speciesId: string; areas: number } | null>(
    null
  );

  useEffect(() => {
    let live = true;
    fetchStrongestSpeciesToday(REGIONS)
      .then(ranked => {
        const known = ranked.filter(r =>
          species.some(s => s.id === r.speciesId)
        );
        const mushroom = known.find(
          r =>
            r.areas >= 10 &&
            species.find(s => s.id === r.speciesId)?.category === 'mushroom'
        );
        if (live) setTop(mushroom ?? known[0] ?? null);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [species]);

  const name = top
    ? species.find(s => s.id === top.speciesId)?.name.replace(/\s*\(.*\)$/, '')
    : null;

  if (!top || !name) {
    return <p className={styles.intro}>{t('home.description')}</p>;
  }
  return (
    <p className={styles.live}>
      <span aria-hidden='true' className={styles.liveDot} />
      <span>
        {t('home.live.line', {
          species: name,
          areas: top.areas.toLocaleString(i18n.language),
          area: t(AMERICAS ? 'home.live.northAmerica' : 'home.live.europe'),
        })}
      </span>
    </p>
  );
}

/** Why to believe the forecast: how today's model did on the continent's
 *  recent mushroom finds, the Data page holding the rest. Nothing until a
 *  region there has enough finds (the US, for now). */
function ProofLine() {
  const { t, i18n } = useTranslation('common');
  const card = useScorecard();
  const tally = card ? pooledTally(card, REGIONS) : null;
  if (!card || !tally) return null;

  return (
    <div className={styles.proof}>
      <p>
        <Trans
          t={t}
          i18nKey='home.proof.line'
          values={{
            area: t(AMERICAS ? 'home.live.northAmerica' : 'home.live.europe'),
            since: formatDay(card.since, i18n.language),
            share: formatShare(tally.top_quarter, i18n.language),
            chance: formatShare(CHANCE, i18n.language),
          }}
          components={{ strong: <strong /> }}
        />
      </p>
      <Link
        to='/data'
        hash='scorecard'
        className={`${styles.textLink} focus-ring`}
      >
        {t('home.proof.link')}
        <ArrowUpRight className='size-5' />
      </Link>
    </div>
  );
}
