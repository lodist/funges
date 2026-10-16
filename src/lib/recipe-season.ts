import { recipeSpeciesFamily, type Recipe } from '@/data/recipes';
import { getSpeciesById } from '@/data/species';
import {
  seasonPlace,
  speciesSeasons,
  type Season,
  type SeasonPlace,
} from '@/lib/seasons';

/** The wild ingredient that makes a recipe cookable today. `score` is absent
 *  when the day's scores are unavailable and the calendar alone decided. */
export interface ReadyBy {
  speciesId: string;
  score?: number;
}

/**
 * A recipe is ready when its main wild ingredient, the first one listed and
 * the one the dish is named for, or a sibling that cooks like it, scores
 * today; offline, when its season is today's. Any ingredient used to do: a
 * side green at 10 made an amaranth dish read "Dandelion", and a spring St
 * George's frittata "ready" in October because of its nettles.
 */
export function readyBy(
  recipe: Recipe,
  scores: Record<string, number> | null,
  season: Season
): ReadyBy | null {
  const [main] = recipe.species;
  if (!main) return null;
  let best: ReadyBy | null = null;
  for (const member of recipeSpeciesFamily(main)) {
    if (scores) {
      const score = scores[member];
      if (score !== undefined && (best?.score ?? -1) < score) {
        best = { speciesId: member, score };
      }
    } else if (
      !best &&
      speciesSeasons(getSpeciesById(member)?.season).includes(season)
    ) {
      best = { speciesId: member };
    }
  }
  return best;
}

/** How soon a recipe's ingredient comes back: next season first. */
export const COMING_BACK: SeasonPlace[] = ['next', 'later', 'before', 'now'];

/** How soon the main ingredient comes back, as a COMING_BACK rank. */
export function comingBack(recipe: Recipe, season: Season) {
  return COMING_BACK.indexOf(
    seasonPlace(
      speciesSeasons(getSpeciesById(recipe.species[0])?.season),
      season
    )
  );
}
