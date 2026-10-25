import { useEffect, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { GoogleMark } from '@/components/HuertaSignIn';
import { Button } from '@/components/ui/button';
import { finishSignIn, startSignIn } from '@/lib/huerta-session';

type State = 'working' | 'elsewhere' | 'failed';

/** Where Google's sign-in page comes back: the session, then the page the
 *  sign-in began on; or, when it began in another browser view (the iPhone
 *  Home Screen app), a word to go back there. */
export default function HuertaSignInPage() {
  const { t } = useTranslation('huerta');
  const navigate = useNavigate();
  const [state, setState] = useState<State>('working');
  const once = useRef(false);

  useEffect(() => {
    if (once.current) return; // the token works once
    once.current = true;
    finishSignIn(window.location.hash)
      .then(({ back, here }) => {
        if (here) void navigate({ to: back, replace: true });
        else setState('elsewhere');
      })
      .catch(() => setState('failed'));
  }, [navigate]);

  return (
    <div className='container mx-auto max-w-7xl px-4 py-16' aria-live='polite'>
      {state === 'working' ? (
        <p className='text-lg text-muted-foreground'>{t('signin.working')}</p>
      ) : state === 'elsewhere' ? (
        <p className='text-lg font-medium text-foreground'>
          {t('signin.doneElsewhere')}
        </p>
      ) : (
        <div className='flex flex-col items-start gap-4'>
          <p className='text-lg font-medium text-foreground'>
            {t('signin.failed')}
          </p>
          <Button
            size='lg'
            variant='outline'
            className='bg-card'
            onClick={() => void startSignIn('/huerta/in-season')}
          >
            <GoogleMark />
            {t('signin.retry')}
          </Button>
        </div>
      )}
    </div>
  );
}
