import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import SEO from '@/components/SEO';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { ArrowRight } from '@/lib/icons';
import {
  alternates,
  localizedPath,
  pathLanguage,
  type IndexedLanguage,
} from '@/lib/seo-pages';
import { spaceDoor, visibleSpaces, type Space } from '@/lib/spaces';
import { LiveLine } from './LandingPage';
import styles from './FrontPage.module.scss';

const base = import.meta.env.BASE_URL;

// Each door's photograph follows the season (meteorological), as on the
// space's own front page.
const PHOTOS: Record<Space, string[]> = {
  terra: ['hero-winter', 'hero-spring', 'hero-summer', 'astra-porcini'],
  huerta: [
    'huerta-hero-winter',
    'huerta-hero-spring',
    'huerta-hero-summer',
    'huerta-hero-autumn',
  ],
};
const photo = (space: Space) =>
  `${base}landing/${PHOTOS[space][Math.floor(((new Date().getMonth() + 1) % 12) / 3)]}.webp`;

// The sidebar's Help group: the front page has no sidebar.
const HELP_LINKS = [
  { to: '/support', key: 'support' },
  { to: '/impressum', key: 'impressum' },
  { to: '/privacy-policy', key: 'privacyPolicy' },
  { to: '/termsuse', key: 'termsOfUse' },
] as const;

/** One space's door: its photograph standing on its colour block, its name,
 *  what it is, one line about it and the way in. */
function Door({ space, lang }: { space: Space; lang: IndexedLanguage }) {
  const { t } = useTranslation('sidebar');
  const { t: tHuerta } = useTranslation('huerta');
  const name = t(`spaces.${space}.name`);
  return (
    <section data-space={space} className={styles.door}>
      <img src={photo(space)} alt='' width='960' height='1200' />
      <div className={styles.doorBody}>
        <h2 className={styles.name}>{name}</h2>
        <p className={styles.tagline}>{t(`spaces.${space}.tagline`)}</p>
        {space === 'terra' ? (
          <LiveLine />
        ) : (
          <p className={styles.line}>{tHuerta('landing.intro')}</p>
        )}
        <Button asChild size='lg' className={styles.cta}>
          <Link to={spaceDoor(space, lang)}>
            {t('spaces.open', { space: name })}
            <ArrowRight className='size-5' />
          </Link>
        </Button>
      </div>
    </section>
  );
}

/* The front page every space opens from: what Funges is on sand, then one
 * door per space, side by side, in the spaces' own colour blocks. Hard edges,
 * no fades, like the space front pages behind the doors. */
export default function FrontPage() {
  const { t } = useTranslation('common');
  const { t: tNav } = useTranslation('sidebar');
  const lang = pathLanguage(window.location.pathname) ?? 'en';
  return (
    <>
      <SEO
        title={t('home.metaTitle')}
        description={t('home.metaDescription')}
        bare
        canonicalUrl={localizedPath('/', lang)}
        alternates={alternates('/', window.location.origin)}
      />
      <div className={styles.page}>
        <section className={styles.hero}>
          <Logo className='h-10 md:h-12' />
          <h1 className={styles.shout}>{t('common.appDescription')}</h1>
        </section>
        <div className={styles.doors}>
          {visibleSpaces().map(space => (
            <Door key={space} space={space} lang={lang} />
          ))}
        </div>
        <footer className={styles.footer}>
          <Logo className='h-8' />
          <nav aria-label={tNav('help')}>
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
