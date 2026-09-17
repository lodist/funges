import { describe, expect, it } from 'vitest';
import { canonicalHref } from '@/components/SEO';

describe('canonicalHref', () => {
  const origin = 'https://www.fung.es';

  it('points at the served URL, not the one that redirects', () => {
    expect(canonicalHref('/species', origin)).toBe(
      'https://www.fung.es/species/'
    );
  });

  it('leaves an already-slashed path alone', () => {
    expect(canonicalHref('/', origin)).toBe('https://www.fung.es/');
    expect(canonicalHref('/species/', origin)).toBe(
      'https://www.fung.es/species/'
    );
  });
});
