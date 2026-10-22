import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { MapPinned, Navigation } from '@/lib/icons';
import { useMapStore } from '@/store/mapStore';

interface ScopeHeaderProps {
  title: string;
  /** Where the page's scores come from: "North Europe", "Within 100 km of you". */
  scopeLabel?: string;
  /** The page's own action in place of "Use my location" (Huerta: its place),
   *  null for none. */
  action?: ReactNode;
}

/**
 * A page title over the place its scores come from, with "Use my location"
 * until the reader has shared one. The map store only learns a position from
 * the map's locate control, so a visitor who lands on a list page first never
 * got the nearby scores. In Season, Species and Recipes share it, so the
 * three headers stay one header.
 */
export function ScopeHeader({ title, scopeLabel, action }: ScopeHeaderProps) {
  const { t } = useTranslation('common');
  const userLocation = useMapStore(state => state.userLocation);
  const getUserLocation = useMapStore(state => state.getUserLocation);
  const [locating, setLocating] = useState(false);
  const [failed, setFailed] = useState(false);

  const locate = () => {
    setLocating(true);
    setFailed(false);
    getUserLocation()
      .catch(() => setFailed(true))
      .finally(() => setLocating(false));
  };

  return (
    <div className='flex flex-wrap items-end justify-between gap-x-8 gap-y-4'>
      <div className='max-w-3xl min-w-0'>
        <h1 className='text-3xl leading-tight font-semibold text-balance text-foreground sm:text-4xl'>
          {title}
        </h1>
        {scopeLabel ? (
          <p className='mt-3 flex items-center gap-2 text-sm font-medium text-foreground'>
            <MapPinned className='size-4 shrink-0 text-primary-text' />
            {scopeLabel}
          </p>
        ) : null}
      </div>
      {action !== undefined ? (
        action
      ) : !userLocation ? (
        <div className='flex flex-col items-start gap-1'>
          <Button variant='outline' onClick={locate} disabled={locating}>
            <Navigation />
            {locating
              ? t('worthForagingNow.locating')
              : t('worthForagingNow.useLocation')}
          </Button>
          {failed ? (
            <p className='text-sm text-destructive-text'>
              {t('worthForagingNow.locationFailed')}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
