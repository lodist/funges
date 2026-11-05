import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isAppleMobileDevice,
  isPlayApp,
  offersPlayStore,
} from '@/lib/platform';

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

/** The Play app opens on the landing page, so a wrong yes there points the
 *  app at its own store page. */
describe('offersPlayStore', () => {
  const referrer = (value: string) =>
    Object.defineProperty(document, 'referrer', { value, configurable: true });

  afterEach(() => {
    stub({ userAgent: '', platform: '', maxTouchPoints: 0 });
    referrer('');
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('is true in a desktop or Android browser tab', () => {
    stub({ userAgent: MAC_DESKTOP_UA, platform: 'MacIntel' });
    expect(offersPlayStore()).toBe(true);
    stub({ userAgent: ANDROID_UA, platform: 'Linux armv8l' });
    expect(offersPlayStore()).toBe(true);
  });

  it('is false on an iPhone, which cannot install it', () => {
    stub({ userAgent: IPHONE_UA, platform: 'iPhone', maxTouchPoints: 5 });
    expect(offersPlayStore()).toBe(false);
  });

  it('is false in the Play app run by Chrome, or an installed PWA', () => {
    stub({ userAgent: ANDROID_UA, platform: 'Linux armv8l' });
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
    } as MediaQueryList);
    expect(offersPlayStore()).toBe(false);
  });

  it('is false in a TWA run by another browser, from its referrer', () => {
    stub({ userAgent: ANDROID_UA, platform: 'Linux armv8l' });
    referrer('android-app://es.fung.app/');
    expect(offersPlayStore()).toBe(false);
  });
});

/** Play's payments policy: a donation link inside the Play app can get the
 *  app pulled, so a wrong no here is the costly mistake. */
describe('isPlayApp', () => {
  const referrer = (value: string) =>
    Object.defineProperty(document, 'referrer', { value, configurable: true });
  const standalone = (matches: boolean) =>
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches,
    } as MediaQueryList);

  afterEach(() => {
    stub({ userAgent: '', platform: '' });
    referrer('');
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('is false in a browser tab, and in a desktop installed PWA', () => {
    stub({ userAgent: ANDROID_UA, platform: 'Linux armv8l' });
    standalone(false);
    expect(isPlayApp()).toBe(false);
    stub({ userAgent: MAC_DESKTOP_UA, platform: 'MacIntel' });
    standalone(true);
    expect(isPlayApp()).toBe(false);
  });

  it('is true in the Play app run by Chrome', () => {
    stub({ userAgent: ANDROID_UA, platform: 'Linux armv8l' });
    standalone(true);
    expect(isPlayApp()).toBe(true);
  });

  it('remembers a TWA run by another browser after a reload drops the referrer', () => {
    stub({ userAgent: ANDROID_UA, platform: 'Linux armv8l' });
    referrer('android-app://es.fung.app/');
    expect(isPlayApp()).toBe(true);
    referrer('');
    expect(isPlayApp()).toBe(true);
  });

  it('is false in a browser tab opened from another app', () => {
    stub({ userAgent: ANDROID_UA, platform: 'Linux armv8l' });
    standalone(false);
    referrer(
      'android-app://com.google.android.googlequicksearchbox/https/www.google.com'
    );
    expect(isPlayApp()).toBe(false);
  });
});
