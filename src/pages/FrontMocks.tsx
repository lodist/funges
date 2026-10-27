import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { ArrowRight } from '@/lib/icons';
import type { Space } from '@/lib/spaces';
import { cn } from '@/lib/utils';
import { LiveLine } from './LandingPage';
import styles from './FrontMocks.module.scss';

/* Three drafts of the shared front page, for Loris to pick from (design
 * branch only, never shipped as they are): A two photographs side by side,
 * B one hero with a Wild / Garden switch, C the screen split in two colours.
 * Same world as the space front pages: colour blocks, hard edges, no fades. */

const base = import.meta.env.BASE_URL;
const season = () => Math.floor(((new Date().getMonth() + 1) % 12) / 3);
const PHOTOS = {
  terra: ['hero-winter', 'hero-spring', 'hero-summer', 'astra-porcini'],
  huerta: [
    'huerta-hero-winter',
    'huerta-hero-spring',
    'huerta-hero-summer',
    'huerta-hero-autumn',
  ],
};
const photo = (space: Space) =>
  `${base}landing/${PHOTOS[space][season()]}.webp`;

const HELP_LINKS = [
  { to: '/support', key: 'support' },
  { to: '/impressum', key: 'impressum' },
  { to: '/privacy-policy', key: 'privacyPolicy' },
  { to: '/termsuse', key: 'termsOfUse' },
] as const;

/** What each door says and where it leads, in the page's language. */
function useDoor(space: Space) {
  const { t } = useTranslation('common');
  const { t: tNav } = useTranslation('sidebar');
  const { t: tHuerta } = useTranslation('huerta');
  const terra = space === 'terra';
  return {
    name: tNav(`spaces.${space}.name`),
    tagline: tNav(`spaces.${space}.tagline`),
    line: terra ? (
      <LiveLine />
    ) : (
      <p className={styles.line}>{tHuerta('landing.intro')}</p>
    ),
    cta: terra ? t('home.cta') : tHuerta('landing.cta'),
    to: terra ? '/map' : '/huerta/planner',
  } as const;
}

function DoorCopy({ space }: { space: Space }) {
  const door = useDoor(space);
  return (
    <>
      <h2 className={styles.name}>{door.name}</h2>
      <p className={styles.tagline}>{door.tagline}</p>
      {door.line}
      <Button asChild size='lg' className={styles.cta}>
        <Link to={door.to}>
          {door.cta}
          <ArrowRight className='size-5' />
        </Link>
      </Button>
    </>
  );
}

function Footer() {
  const { t: tNav } = useTranslation('sidebar');
  return (
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
  );
}

/** A: the promise on sand, then two photographs side by side, each standing
 *  on its space's colour block: the forest floor and the garden bed. */
export function FrontA() {
  const { t } = useTranslation('common');
  return (
    <div className={styles.page}>
      <section className={styles.sandHero}>
        <Logo className='h-10 md:h-12' />
        <h1 className={styles.shout}>{t('common.appDescription')}</h1>
      </section>
      <div className={styles.diptych}>
        {(['terra', 'huerta'] as const).map(space => (
          <section key={space} data-space={space} className={styles.door}>
            <img src={photo(space)} alt='' width='960' height='1200' />
            <div className={styles.doorBody}>
              <DoorCopy space={space} />
            </div>
          </section>
        ))}
      </div>
      <Footer />
    </div>
  );
}

/** B: one hero, and a switch that turns the whole block from the forest's
 *  green to the garden's terracotta, photograph and all. */
export function FrontB() {
  const { t } = useTranslation('common');
  const { t: tNav } = useTranslation('sidebar');
  const [space, setSpace] = useState<Space>('terra');
  return (
    <div className={styles.page}>
      <section data-space={space} className={styles.switchHero}>
        <header className={styles.switchHeader}>
          <Logo className='h-10 md:h-12' />
          <div className={styles.switch} role='group'>
            {(['terra', 'huerta'] as const).map(s => (
              <button
                key={s}
                type='button'
                aria-pressed={space === s}
                onClick={() => setSpace(s)}
                className='focus-ring'
              >
                {tNav(`spaces.${s}.name`)}
              </button>
            ))}
          </div>
        </header>
        <div className={styles.switchBody}>
          <div className={styles.switchCopy}>
            <h1 className={styles.shout}>{t('common.appDescription')}</h1>
            <DoorCopy key={space} space={space} />
          </div>
          <img
            key={space}
            className={styles.switchPhoto}
            src={photo(space)}
            alt=''
            width='960'
            height='1200'
          />
        </div>
      </section>
      <Footer />
    </div>
  );
}

/** C: no photograph up top, only the two colours: the promise across a
 *  paper strip, then the screen split down the middle, forest and garden. */
export function FrontC() {
  const { t } = useTranslation('common');
  return (
    <div className={styles.page}>
      <section className={styles.strip}>
        <Logo className='h-10 md:h-12' />
        <h1 className={cn(styles.shout, styles.stripTitle)}>
          {t('common.appDescription')}
        </h1>
      </section>
      <div className={styles.split}>
        {(['terra', 'huerta'] as const).map(space => (
          <section key={space} data-space={space} className={styles.half}>
            <DoorCopy space={space} />
          </section>
        ))}
      </div>
      <Footer />
    </div>
  );
}
