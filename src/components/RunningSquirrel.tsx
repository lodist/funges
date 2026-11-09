import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import run from '@/assets/game/squirrel/run@3x.8.webp';
import styles from './RunningSquirrel.module.scss';

/** The front page's way into the game: the squirrel runs across the top of
 *  the page, then across the bottom. Tapping it opens the game. */
export function RunningSquirrel({ lane }: { lane: 'top' | 'bottom' }) {
  const { t } = useTranslation('common');
  return (
    <div className={styles.track} data-lane={lane}>
      <Link
        to='/play'
        className={styles.runner}
        aria-label={t('game.play')}
        title={t('game.play')}
        style={{ backgroundImage: `url(${run})` }}
      />
    </div>
  );
}
