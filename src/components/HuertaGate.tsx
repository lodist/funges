import { Fragment, useEffect, type ReactNode } from 'react';
import { HuertaSignIn } from '@/components/HuertaSignIn';
import {
  chooseGarden,
  gardens,
  syncGardens,
  useCurrentGardenId,
} from '@/lib/gardens';
import { huertaApiConfigured } from '@/lib/huerta-api';
import { pickUpHandoff, useSession } from '@/lib/huerta-session';

/**
 * Huerta is for signed-in accounts: every Huerta page shows the sign-in
 * screen until then. Signed in, the gardens sync on open and when back
 * online, and the page starts afresh when another garden is chosen.
 */
export function HuertaGate({ children }: { children: ReactNode }) {
  const signedIn = Boolean(useSession());
  const garden = useCurrentGardenId();

  // A morning alert opens /huerta?garden=<id>: that garden.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('garden');
    if (id && gardens().some(g => g.id === id)) chooseGarden(id);
  }, []);

  useEffect(() => {
    if (!signedIn) {
      // Signed in in another browser view (iPhone): collect it on return.
      const back = () => {
        if (document.visibilityState === 'visible') void pickUpHandoff();
      };
      document.addEventListener('visibilitychange', back);
      return () => document.removeEventListener('visibilitychange', back);
    }
    const sync = () => void syncGardens().catch(() => {});
    sync();
    window.addEventListener('online', sync);
    return () => window.removeEventListener('online', sync);
  }, [signedIn]);

  // Builds without the Worker (tests, local without it) show the sample.
  if (!huertaApiConfigured) return <>{children}</>;
  if (!signedIn) return <HuertaSignIn />;
  return <Fragment key={garden}>{children}</Fragment>;
}
