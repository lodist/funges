import { beforeEach, describe, expect, it, vi } from 'vitest';
import { newGame, type Run } from '@/game/sim';

const run: Run = { seed: 1, presses: [], releases: [], slides: [] };

describe("the game's board posts", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubEnv('VITE_HUERTA_API', 'https://w.test');
    vi.resetModules();
  });

  it('sends a best once, with a name, and only when it beats the last one sent', async () => {
    const bodies: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        bodies.push(String(init?.body));
        return new Response(
          JSON.stringify({ name: 'Lo', bests: { classic: 1 }, rank: 3 })
        );
      })
    );
    const board = await import('@/game/board');
    const g = newGame(1);
    g.dist = 1000;
    g.bonus = 5;
    g.tick = 300;
    expect(board.keepIfBest('classic', board.bestOf(g, run))).toBe(true);
    // No name yet: kept here, nothing sent.
    expect(await board.sendBests()).toEqual({});
    localStorage.setItem('squirrel-name', '"Lo"');
    expect(await board.sendBests()).toEqual({ classic: 3 });
    expect(await board.sendBests()).toEqual({});
    // A worse run is not kept, so there is nothing new to send.
    g.dist = 500;
    expect(board.keepIfBest('classic', board.bestOf(g, run))).toBe(false);
    expect(await board.sendBests()).toEqual({});
    expect(bodies).toHaveLength(1);
    expect(JSON.parse(bodies[0]).best).toMatchObject({
      route: 'classic',
      score: 105,
      dist: 1000,
      bonus: 5,
      ticks: 300,
    });
  });
});
