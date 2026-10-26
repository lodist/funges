import { useEffect, useState } from 'react';

/**
 * How today's forecast did on 2026 mushroom finds, built by
 * scripts/build_scorecard.py from scripts/qa_season_auc.py: per mushroom and
 * for all of them, how often at the same spot a day in its season scored
 * above a day out of season (`auc`), on how many finds and spots.
 */
export interface SeasonTally {
  finds: number;
  auc: number;
}

export interface Scorecard {
  updated_at: string;
  season: {
    since: string;
    until: string;
    spots: number;
    all: SeasonTally;
    species: Record<string, SeasonTally>;
  } | null;
}

/** A coin toss: one of two days picked blindly is the right one half the time. */
export const CHANCE = 0.5;

const SCORECARD_URL = `${import.meta.env.BASE_URL}data/scorecard.json`;

let request: Promise<Scorecard | null> | null = null;

// ponytail: fetched once per session; a missing or broken file hides the lines.
export function loadScorecard(): Promise<Scorecard | null> {
  request ??= fetch(SCORECARD_URL)
    .then(response => (response.ok ? response.json() : null))
    .then((card: Scorecard | null) => (card?.season ? card : null))
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
