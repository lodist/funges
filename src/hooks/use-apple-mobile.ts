import * as React from 'react';
import { isAppleMobileDevice } from '@/lib/platform';

/**
 * Client-only and UA doesn't change mid-session, so a lazy initializer is
 * enough — no resize-style reactivity needed the way `useIsMobile` needs one
 * for viewport width.
 */
export function useIsAppleMobile() {
  const [isAppleMobile] = React.useState(isAppleMobileDevice);

  return isAppleMobile;
}
