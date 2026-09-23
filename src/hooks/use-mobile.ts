import * as React from 'react';

const MOBILE_BREAKPOINT = 768;

// Read synchronously on the first render. The old `undefined` start made
// every phone render the desktop layout once and flip: the map was created
// with desktop sizing and trackResize on, and the resize that followed
// stopped its camera animation (MapLibre's resize() calls stop()).
export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean>(
    () => typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT
  );

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener('change', onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return !!isMobile;
}
