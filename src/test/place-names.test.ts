import { describe, expect, it, vi } from 'vitest';
import i18n from '@/i18n';
import { decodeAdvice, decodeYear } from '@/lib/huerta-wire';
import { shownPlace } from '@/lib/place-names';

vi.mock('@/i18n', () => ({ default: { resolvedLanguage: 'it' } }));
const reading = (lang: string) =>
  ((i18n as { resolvedLanguage: string }).resolvedLanguage = lang);

describe('a Huerta place in the reader’s language', () => {
  const rome = { place: 'Rome', lat: 41.9, lon: 12.5 };

  it('takes the city’s own name where the language has one', () => {
    reading('it');
    expect(shownPlace(rome)).toBe('Roma');
    reading('de');
    expect(shownPlace(rome)).toBe('Rom');
    reading('en');
    expect(shownPlace(rome)).toBe('Rome');
    reading('es');
    expect(shownPlace({ place: 'Almeria', lat: 36.84, lon: -2.46 })).toBe(
      'Almería'
    );
  });

  it('leaves a namesake elsewhere, and a place without a position, alone', () => {
    reading('it');
    expect(shownPlace({ place: 'Rome', lat: 34.26, lon: -85.16 })).toBe('Rome');
    expect(shownPlace({ place: 'Rome' })).toBe('Rome');
    reading('de');
    expect(shownPlace({ place: 'Zug', lat: 47.17, lon: 8.52 })).toBe('Zug');
  });

  it('gets the position from the Worker’s answers', () => {
    reading('it');
    const advice = decodeAdvice({
      day: '2026-11-24',
      crops: [],
      place: {
        name: 'Rome',
        lat: 41.9,
        lon: 12.5,
        frost: '',
        soil: null,
        nights: null,
        rain: null,
        water: null,
        statuses: '',
      },
    });
    const year = decodeYear({
      crops: [],
      place: { name: 'Rome', lat: 41.9, lon: 12.5, months: '' },
    });
    expect([shownPlace(advice), shownPlace(year)]).toEqual(['Roma', 'Roma']);
  });
});
