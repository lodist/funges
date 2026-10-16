import { describe, expect, it } from 'vitest';
import type { Recipe } from '@/data/recipes';
import { readyBy } from '@/lib/recipe-season';

const recipe = (species: string[]) => ({ species }) as Recipe;

describe('a recipe is ready by its main ingredient', () => {
  it('shows the main ingredient even when a side green scores higher', () => {
    expect(
      readyBy(
        recipe(['amaranth', 'dandelion']),
        { amaranth: 8.2, dandelion: 10 },
        'fall'
      )
    ).toEqual({ speciesId: 'amaranth', score: 8.2 });
  });

  it('is not ready when only a side ingredient is in season', () => {
    expect(
      readyBy(recipe(['st_george', 'nettle']), { nettle: 10 }, 'fall')
    ).toBeNull();
  });

  it('counts a sibling that cooks like the main ingredient', () => {
    expect(readyBy(recipe(['chant']), { winter_chant: 9.3 }, 'fall')).toEqual({
      speciesId: 'winter_chant',
      score: 9.3,
    });
  });

  it('falls back to the calendar when the day has no scores', () => {
    expect(readyBy(recipe(['nettle']), null, 'spring')).toEqual({
      speciesId: 'nettle',
    });
    expect(readyBy(recipe(['morel']), null, 'fall')).toBeNull();
  });
});
