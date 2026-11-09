/**
 * Squirrel Run's boards, on the Huerta Worker (its src/game.js). A player is
 * this device's random key under a nickname; signed in to Huerta, the account,
 * which keeps the name and the bests on every device.
 *
 * Light on the Worker: a best goes up only when it beats the last one sent,
 * a board is kept by the browser for five minutes (the Worker says so), and
 * the posts are plain text, so the browser asks no CORS preflight first.
 */
import { apiUrl } from '@/lib/huerta-session';
import type { Game, Run } from './sim';
import { score } from './sim';

const API = import.meta.env.VITE_HUERTA_API as string | undefined;
/** Whether this build has a Worker to keep the boards. */
export const boardsOn = Boolean(API);

export type Route = 'classic' | 'random';
export const ROUTES: Route[] = ['classic', 'random'];

export interface Entry {
  name: string;
  score: number;
  furthest: number;
}

/** A best as this device keeps it and posts it. */
export interface Best {
  score: number;
  dist: number;
  bonus: number;
  ticks: number;
  furthest: number;
  run: Run;
}

const KEY = 'squirrel-key';
const NAME = 'squirrel-name';
const SENT = 'squirrel-sent';
const bestKey = (route: Route) =>
  route === 'random' ? 'squirrel-best-random' : 'squirrel-best';

const read = <T>(key: string): T | null => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null;
  } catch {
    return null;
  }
};
const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Blocked storage: kept for this visit only.
  }
};

/** This device's player key: random, made once. */
function deviceKey() {
  let key = read<string>(KEY);
  if (!key) {
    key = [...crypto.getRandomValues(new Uint8Array(32))]
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    write(KEY, key);
  }
  return key;
}

export const playerName = () => read<string>(NAME);
export const readBest = (route: Route) => read<Best>(bestKey(route));

/** A run's end as a best: what the board shows and what checks it. */
export const bestOf = (g: Game, run: Run): Best => ({
  score: score(g),
  dist: g.dist,
  bonus: g.bonus,
  ticks: g.tick,
  furthest: g.furthest,
  run,
});

/** Keeps a run's end when it beats this device's best on its route. */
export function keepIfBest(route: Route, best: Best) {
  const before = readBest(route);
  if (before && before.score >= best.score) return false;
  write(bestKey(route), best);
  return true;
}

interface Answer {
  name: string;
  bests: Partial<Record<Route, number>>;
  rank?: number;
}

async function post(body: object): Promise<Answer> {
  const send = (extra: object) =>
    fetch(apiUrl('/v1/game/player'), {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ key: deviceKey(), ...body, ...extra }),
    });
  let response = await send({});
  // A player the boards no longer know (its account deleted): made again
  // under this device's name.
  const name = playerName();
  if (response.status === 400 && name && !('name' in body))
    response = await send({ name });
  if (!response.ok) throw new Error(`board ${response.status}`);
  const answer = (await response.json()) as Answer;
  write(NAME, answer.name);
  return answer;
}

/** The name this device plays under; signed in, the account's too. */
export const setName = (name: string) => post({ name });

/** Signed in: this device joins the account's player and takes its name. */
export const joinAccount = () => post({});

/**
 * Posts this device's bests the boards have not seen yet, once it has a name.
 * The rank of each one posted, by route.
 */
export async function sendBests(): Promise<Partial<Record<Route, number>>> {
  if (!boardsOn || !playerName()) return {};
  const sent = read<Partial<Record<Route, number>>>(SENT) ?? {};
  const ranks: Partial<Record<Route, number>> = {};
  for (const route of ROUTES) {
    const best = readBest(route);
    if (!best || (sent[route] ?? -1) >= best.score) continue;
    // Bests kept before routes or before the board carry no distance.
    if (!Number.isFinite(best.dist)) continue;
    const answer = await post({ best: { route, ...best } });
    sent[route] = best.score;
    write(SENT, sent);
    if (answer.rank) ranks[route] = answer.rank;
  }
  return ranks;
}

/** A route's board: the browser keeps it five minutes, unless `fresh`. */
export async function board(route: Route, fresh = false): Promise<Entry[]> {
  const response = await fetch(`${API}/v1/game/board?route=${route}`, {
    cache: fresh ? 'no-cache' : 'default',
  });
  if (!response.ok) throw new Error(`board ${response.status}`);
  return ((await response.json()) as { top: Entry[] }).top;
}
