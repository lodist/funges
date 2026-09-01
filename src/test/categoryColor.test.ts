import { describe, expect, it } from 'vitest';

import { CATEGORIES, categoryVar, toCategory } from '@/lib/categoryColor';

describe('toCategory', () => {
  it('passes the five canonical categories through', () => {
    for (const c of CATEGORIES) expect(toCategory(c)).toBe(c);
  });

  it('folds aliases and plurals onto a canonical category', () => {
    expect(toCategory('herb')).toBe('plant');
    expect(toCategory('Mushrooms')).toBe('mushroom');
    expect(toCategory(' berries ')).toBe('berry');
  });

  it('falls back to plant for unknown, empty, and missing input', () => {
    expect(toCategory('lichen')).toBe('plant');
    expect(toCategory('')).toBe('plant');
    expect(toCategory(undefined)).toBe('plant');
    expect(toCategory(null)).toBe('plant');
  });
});

describe('categoryVar', () => {
  it('references the token every category has a definition for', () => {
    expect(categoryVar('nut')).toBe('var(--category-nut)');
  });
});
