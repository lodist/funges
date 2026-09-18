import { afterEach, describe, expect, it } from 'vitest';
import { isAppleMobileDevice } from '@/lib/platform';

/**
 * The Liquid Glass mobile nav treatment is gated on this function alone, so
 * it has to say yes to iPhone/iPad and no to everything else — an Android
 * phone or a desktop browser also supports backdrop-filter, and getting this
 * wrong leaks (or withholds) the Apple-only look on the wrong device.
 */

const stub = (
  props: Partial<Pick<Navigator, 'userAgent' | 'platform' | 'maxTouchPoints'>>
) => {
  for (const [key, value] of Object.entries(props)) {
    Object.defineProperty(navigator, key, {
      value,
      configurable: true,
      writable: true,
    });
  }
};

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15';
const IPAD_LEGACY_UA =
  'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15';
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126';
const MAC_DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15';

describe('isAppleMobileDevice', () => {
  afterEach(() => {
    stub({ userAgent: '', platform: '', maxTouchPoints: 0 });
  });

  it('is true for an iPhone', () => {
    stub({ userAgent: IPHONE_UA, platform: 'iPhone', maxTouchPoints: 5 });
    expect(isAppleMobileDevice()).toBe(true);
  });

  it('is true for an iPad reporting its own UA', () => {
    stub({ userAgent: IPAD_LEGACY_UA, platform: 'iPad', maxTouchPoints: 5 });
    expect(isAppleMobileDevice()).toBe(true);
  });

  it('is true for iPadOS 13+ masquerading as a Mac, via touch points', () => {
    stub({
      userAgent: MAC_DESKTOP_UA,
      platform: 'MacIntel',
      maxTouchPoints: 5,
    });
    expect(isAppleMobileDevice()).toBe(true);
  });

  it('is false for a real desktop Mac (no multi-touch)', () => {
    stub({
      userAgent: MAC_DESKTOP_UA,
      platform: 'MacIntel',
      maxTouchPoints: 0,
    });
    expect(isAppleMobileDevice()).toBe(false);
  });

  it('is false for Android, which also supports backdrop-filter', () => {
    stub({
      userAgent: ANDROID_UA,
      platform: 'Linux armv8l',
      maxTouchPoints: 5,
    });
    expect(isAppleMobileDevice()).toBe(false);
  });
});
