import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Check, MapPinned } from '@/lib/icons';
import { cn } from '@/lib/utils';

const HIDDEN = 'huerta-guide-hidden';
const STEPS = ['place', 'plan', 'sow'] as const;

/** My garden's first steps, until something is sown: where the garden is,
 *  its beds, then sowing and ticking off. `done` says whether the first two
 *  are. "Hide" keeps it away on this device, for gardeners who know their
 *  way. */
export function GardenGuide({ done }: { done: [boolean, boolean] }) {
  const { t } = useTranslation('huerta');
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(HIDDEN) === '1';
    } catch {
      return false;
    }
  });
  if (hidden) return null;
  const current = done[0] ? (done[1] ? 2 : 1) : 0;
  const hide = () => {
    setHidden(true);
    try {
      localStorage.setItem(HIDDEN, '1');
    } catch {
      // Blocked storage: hidden for this visit only.
    }
  };
  return (
    <section
      aria-labelledby='garden-guide'
      className='rounded-card bg-card p-4 elevation-raised sm:p-5'
    >
      <div className='flex items-center justify-between gap-3'>
        <h2
          id='garden-guide'
          className='text-base font-semibold text-foreground'
        >
          {t('guide.title')}
        </h2>
        <Button variant='ghost' onClick={hide}>
          {t('guide.hide')}
        </Button>
      </div>
      <ol className='mt-3 grid gap-2 sm:grid-cols-3 sm:gap-3'>
        {STEPS.map((step, i) => {
          const ok = i < 2 && done[i];
          const now = i === current;
          return (
            <li
              key={step}
              aria-current={now ? 'step' : undefined}
              className={cn('flex gap-3 rounded-lg p-3', now && 'bg-muted')}
            >
              <span
                className={cn(
                  'grid size-7 shrink-0 place-items-center rounded-full text-sm font-semibold',
                  ok
                    ? 'bg-primary text-primary-foreground'
                    : 'border border-border text-foreground'
                )}
              >
                {ok ? <Check className='size-4' /> : i + 1}
              </span>
              <span className='min-w-0'>
                <span
                  className={cn(
                    'block font-medium',
                    now ? 'text-foreground' : 'text-muted-foreground'
                  )}
                >
                  {t(`guide.${step}.title`)}
                </span>
                {now ? (
                  <span className='mt-0.5 block text-sm text-muted-foreground'>
                    {t(`guide.${step}.text`)}
                  </span>
                ) : null}
                {now && step === 'place' ? (
                  <Button asChild className='mt-2'>
                    <Link to='/huerta/map'>
                      <MapPinned className='size-4' />
                      {t('guide.place.action')}
                    </Link>
                  </Button>
                ) : null}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
