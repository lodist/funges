/**
 * What this device has found in the game, for the collection: the landscapes
 * reached and every find, treat and ride caught, kept across runs. The goal
 * the game gives: all of them.
 */
import { PLAYER_X, type Game } from './sim';
import { STAGES, stageAt } from './stages';

const KEY = 'squirrel-found';

/** The landscapes by stage id; the finds, treats and rides as `stage/art`. */
export interface Found {
  stages: Set<string>;
  items: Set<string>;
}

export function readFound(): Found {
  try {
    const kept = JSON.parse(localStorage.getItem(KEY) ?? 'null') as {
      stages?: string[];
      items?: string[];
    } | null;
    return { stages: new Set(kept?.stages), items: new Set(kept?.items) };
  } catch {
    return { stages: new Set(), items: new Set() };
  }
}

function keep(found: Found) {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ stages: [...found.stages], items: [...found.items] })
    );
  } catch {
    // Blocked storage: this visit's finds only.
  }
}

/** Everything there is to find, stage by stage, in the classic order. */
export const ALL = STAGES.map(stage => ({
  stage: stage.id,
  finds: (stage.pickups ?? []).map(art => `${stage.id}/${art}`),
  treat: `${stage.id}/${stage.egg}`,
  ride: stage.ride ? `${stage.id}/${stage.ride}` : undefined,
}));

/** A run's discoverer: notes, after each tick, the landscape it is in and
 *  what it caught, and keeps them the moment something is new. */
export function discoverer() {
  const found = readFound();
  let riding = false;
  return (g: Game) => {
    let fresh = false;
    const here = STAGES[stageAt(g.dist + PLAYER_X, g.route).index].id;
    if (!found.stages.has(here)) {
      found.stages.add(here);
      fresh = true;
    }
    for (const t of g.things) {
      if (t.hit !== g.tick || (t.kind !== 'pickup' && t.kind !== 'egg'))
        continue;
      const item = `${t.stage}/${t.art}`;
      if (!found.items.has(item)) {
        found.items.add(item);
        fresh = true;
      }
    }
    if (g.ride && !riding) {
      const item = `${g.ride.stage}/${g.ride.art}`;
      if (!found.items.has(item)) {
        found.items.add(item);
        fresh = true;
      }
    }
    riding = Boolean(g.ride);
    if (fresh) keep(found);
  };
}
