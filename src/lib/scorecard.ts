import { useEffect, useState } from 'react';
import type { ScoreRegionId } from '@/lib/worth-foraging-now';

/**
 * How today's forecast did on mushroom finds it never learned from, built by
 * scripts/build_scorecard.py from a replay: per region and continent, the
 * finds and `place`, how often the forecast rated the find's spot higher that
 * day than another spot where people found mushrooms.
 */
export interface Tally {
  finds: number;
  place: number;
}

export interface AreaScorecard extends Tally {
  species: Record<string, Tally>;
}

export type Continent = 'EU' | 'US';

export interface Scorecard {
  updated_at: string;
  since: string;
  until: string;
  regions: Partial<Record<ScoreRegionId, AreaScorecard>>;
  continents: Partial<Record<Continent, AreaScorecard>>;
}

/** Picking one of two spots blindly is right half the time. */
export const CHANCE = 0.5;

export const continentOf = (region: ScoreRegionId): Continent =>
  region === 'NE' || region === 'SE' ? 'EU' : 'US';

const SCORECARD_URL = `${import.meta.env.BASE_URL}data/scorecard.json`;

let request: Promise<Scorecard | null> | null = null;

// ponytail: fetched once per session; a missing or broken file hides the lines.
export function loadScorecard(): Promise<Scorecard | null> {
  request ??= fetch(SCORECARD_URL)
    .then(response => (response.ok ? response.json() : null))
    .then((card: Scorecard | null) =>
      card?.regions && card.continents ? card : null
    )
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

/** A share as "times in 10", the way the landing and the sheet say it. */
export const timesInTen = (share: number): number => Math.round(share * 10);

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
