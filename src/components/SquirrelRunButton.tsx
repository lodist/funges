import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { BAND_GHOST_CLASS } from '@/lib/band-surface';
import { Squirrel } from '@/lib/icons';

/** The map rail's way into the game, in Terra and in Huerta. */
export function SquirrelRunButton() {
  const { t } = useTranslation('common');
  return (
    <Button
      asChild
      variant='ghost'
      size='icon'
      className={BAND_GHOST_CLASS}
      title={t('game.play')}
    >
      <Link to='/play' aria-label={t('game.play')}>
        <Squirrel className='h-4 w-4' />
      </Link>
    </Button>
  );
}
