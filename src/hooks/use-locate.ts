import { useState } from 'react';
import type { Place } from '@/lib/huerta-api';

/** The device's position, once: `locate()` asks for it and hands it to
 *  `onPick`; `failed` once it could not be had (refused, no fix in 15 s, or
 *  no geolocation at all) until the next try. */
export function useLocate(onPick: (place: Place) => void) {
  const [locating, setLocating] = useState(false);
  const [failed, setFailed] = useState(false);
  const locate = () => {
    if (!navigator.geolocation) return setFailed(true);
    setLocating(true);
    setFailed(false);
    navigator.geolocation.getCurrentPosition(
      position => {
        setLocating(false);
        onPick({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        });
      },
      () => {
        setLocating(false);
        setFailed(true);
      },
      { maximumAge: 3_600_000, timeout: 15_000 }
    );
  };
  return { locate, locating, failed };
}
