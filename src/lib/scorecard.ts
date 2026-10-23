import { useEffect, useState } from 'react';
import type { ScoreRegionId } from '@/lib/worth-foraging-now';

/**
 * How today's forecast did on mushroom finds it never learned from, built by
 * scripts/build_scorecard.py from a replay: per region, the finds and the
 * share of them at spots the forecast ranked in its top quarter that day.
 */
export interface Tally {
  finds: number;
  top_quarter: number;
}

export interface RegionScorecard extends Tally {
  species: Record<string, Tally>;
}

export interface Scorecard {
  updated_at: string;
  since: string;
  until: string;
  regions: Partial<Record<ScoreRegionId, RegionScorecard>>;
}

/** A quarter of the spots are in the top quarter, so a blind guess hits 25%. */
export const CHANCE = 0.25;

const SCORECARD_URL = `${import.meta.env.BASE_URL}data/scorecard.json`;

let request: Promise<Scorecard | null> | null = null;

// ponytail: fetched once per session; a missing or broken file hides the lines.
export function loadScorecard(): Promise<Scorecard | null> {
  request ??= fetch(SCORECARD_URL)
    .then(response => (response.ok ? response.json() : null))
    .then((card: Scorecard | null) => (card?.regions ? card : null))
    .catch(() => null);
  return request;
}

export function useScorecard(): Scorecard | null {
  const [card, setCard] = useState<Scorecard | null>(null);
  useEffect(() => {
    let live = true;
    loadScorecard().then(loaded => {
      if (live) setCard(loaded);
    });
    return () => {
      live = false;
    };
  }, []);
  return card;
}

/** Several regions' mushrooms as one, each weighed by its finds. */
export function pooledTally(
  card: Scorecard,
  regionIds: ScoreRegionId[]
): Tally | null {
  const tallies = regionIds.flatMap(id => card.regions[id] ?? []);
  const finds = tallies.reduce((sum, tally) => sum + tally.finds, 0);
  if (finds === 0) return null;
  const hits = tallies.reduce(
    (sum, tally) => sum + tally.top_quarter * tally.finds,
    0
  );
  return { finds, top_quarter: hits / finds };
}

export function formatShare(share: number, language: string): string {
  return new Intl.NumberFormat(language, {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(share);
}

/** "October 5", never split across lines; `short` for tight labels. */
export function formatDay(
  iso: string,
  language: string,
  month: 'long' | 'short' = 'long'
): string {
  return new Intl.DateTimeFormat(language, { day: 'numeric', month })
    .format(new Date(`${iso}T12:00:00`))
    .replace(/ /g, ' ');
}
