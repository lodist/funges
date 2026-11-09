import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import pause from '@/assets/game/squirrel/pause@4x.5.webp';
import run from '@/assets/game/squirrel/run@4x.6.webp';
import styles from './RunningSquirrel.module.scss';

/** The front page's way into the game: a squirrel's silhouette runs across
 *  the top of the page, stops to look around and runs on, then does the same
 *  across the bottom. Its drawn frames are masks filled with the lane's
 *  colour, like the logo. Tapping it opens the game. */
export function RunningSquirrel({ lane }: { lane: 'top' | 'bottom' }) {
  const { t } = useTranslation('common');
  return (
    <div className={styles.track} data-lane={lane}>
      <Link
        to='/play'
        className={styles.runner}
        aria-label={t('game.play')}
        title={t('game.playShort')}
      >
        <span className={styles.legs} style={{ maskImage: `url(${run})` }} />
        <span className={styles.pose} style={{ maskImage: `url(${pause})` }} />
      </Link>
    </div>
  );
}
