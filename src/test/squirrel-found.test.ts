import { beforeEach, describe, expect, it } from 'vitest';
import { discoverer, readFound } from '@/game/found';
import { newGame, type Thing } from '@/game/sim';

const thing = (kind: Thing['kind'], art: string, hit: number): Thing => ({
  kind,
  stage: 'scandinavia',
  art,
  x: 100,
  y: 0,
  rel: 0,
  w: 8,
  h: 8,
  speed: 0,
  animal: false,
  points: 10,
  hit,
});

describe("the game's collection", () => {
  beforeEach(() => localStorage.clear());

  it('keeps the landscapes reached and the finds, treats and rides caught', () => {
    const g = newGame(1);
    const discover = discoverer();
    discover(g);
    expect([...readFound().stages]).toEqual(['scandinavia']);

    g.tick = 5;
    g.things.push(
      thing('pickup', 'cloudberry', 5),
      thing('egg', 'bun', 5),
      thing('trap', 'moose', 5), // smashed on a ride: not a find
      thing('pickup', 'chanterelle', 4) // caught before: noted then, not now
    );
    g.ride = { stage: 'scandinavia', art: 'longship', until: 99 };
    discover(g);
    expect([...readFound().items].sort()).toEqual([
      'scandinavia/bun',
      'scandinavia/cloudberry',
      'scandinavia/longship',
    ]);
    // Kept across runs: a new run's discoverer starts from them.
    const again = discoverer();
    g.tick = 6;
    again(g);
    expect(readFound().items.size).toBe(3);
  });
});
