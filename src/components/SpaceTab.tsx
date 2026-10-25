import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight } from '@/lib/icons';
import type { Space } from '@/lib/spaces';
import styles from '@/pages/LandingPage.module.scss';

/** The door from one space's front page to the other's: a tab on the hero's
 *  edge in the other space's colour (it carries that data-space), on the side
 *  that page slides in from. */
export function SpaceTab({ to }: { to: Space }) {
  const { t } = useTranslation('sidebar');
  const huerta = to === 'huerta';
  const Arrow = huerta ? ArrowRight : ArrowLeft;
  return (
    <Link
      to={huerta ? '/huerta' : '/'}
      viewTransition={{ types: [huerta ? 'to-huerta' : 'to-terra'] }}
      data-space={to}
      className={`${styles.spaceTab} ${huerta ? '' : styles.spaceTabLeft} focus-ring`}
      aria-label={`${t(`spaces.${to}.name`)}: ${t(`spaces.${to}.tagline`)}`}
    >
      <Arrow className='size-5' />
      <span className={styles.spaceName}>{t(`spaces.${to}.name`)}</span>
      <span className={styles.spaceTagline}>{t(`spaces.${to}.tagline`)}</span>
    </Link>
  );
}
