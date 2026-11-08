import { describe, expect, it } from 'vitest';
import source from '@/game/sim.ts?raw';
import { LAP, STAGES, stageAt } from '@/game/stages';
import {
  LIVES,
  PLAYER,
  PLAYER_X,
  POINTS,
  RIDE_TICKS,
  fill,
  newGame,
  replay,
  score,
  speedAt,
  step,
  type Game,
  type Run,
  type Thing,
} from '@/game/sim';

const idle = { press: false, release: false };
const press = { press: true, release: false };
const release = { press: false, release: true };

/** A game where nothing comes on its own: one thing at a time. */
function empty(seed = 1): Game {
  const g = newGame(seed);
  g.nextAt = Infinity;
  return g;
}

/** Puts a thing on the squirrel's path, `ahead` px in front of it. */
function place(g: Game, thing: Partial<Thing>, ahead = 30): Thing {
  const t: Thing = {
    kind: 'trap',
    stage: 'scandinavia',
    art: 'boulder',
    x: g.dist + PLAYER_X + PLAYER.w + ahead,
    y: 0,
    w: 16,
    h: 14,
    speed: 0,
    animal: false,
    points: 0,
    hit: null,
    ...thing,
  };
  g.things.push(t);
  return t;
}

function run(g: Game, ticks: number, input = idle) {
  for (let i = 0; i < ticks; i++) step(g, input);
}

/** The top of a jump: pressed, then let go on step `hold`. */
function peak(hold: number) {
  const g = empty();
  step(g, press);
  let top = g.y;
  for (let i = 1; i < 60; i++) {
    step(g, i === hold ? release : idle);
    top = Math.max(top, g.y);
  }
  return top;
}

describe('the squirrel', () => {
  it('runs along the ground and the distance grows', () => {
    const g = empty();
    run(g, 60);
    expect(g.y).toBe(0);
    expect(g.grounded).toBe(true);
    expect(g.dist).toBeGreaterThan(120);
  });

  it('jumps higher when held than when tapped', () => {
    expect(peak(40)).toBeGreaterThan(40);
    expect(peak(1)).toBeLessThan(24);
  });

  it('jumps once more in the air, and only once', () => {
    const g = empty();
    step(g, press);
    run(g, 10);
    const falling = g.vy;
    step(g, press);
    expect(g.vy).toBeGreaterThan(falling);
    expect(g.doubleUsed).toBe(true);
    const rising = g.vy;
    step(g, press);
    expect(g.vy).toBeLessThan(rising);
  });

  it('jumps again on landing when pressed just before it', () => {
    const g = empty();
    step(g, press);
    step(g, release);
    step(g, press);
    step(g, release);
    while (!(g.vy < 0 && g.y > 0 && g.y <= 12)) step(g, idle);
    step(g, press);
    step(g, release);
    let tookOff = false;
    for (let i = 0; i < 8; i++) {
      step(g, idle);
      if (g.vy > 0) tookOff = true;
    }
    expect(tookOff).toBe(true);
  });
});

describe('things on the way', () => {
  it('a trap costs a life, then the squirrel passes through things for a moment', () => {
    const g = empty();
    place(g, {});
    run(g, 40);
    expect(g.over).toBe(false);
    expect(g.lives).toBe(LIVES - 1);
    expect(g.mercyUntil).toBeGreaterThan(g.tick);
    place(g, {}, 10);
    run(g, 30);
    expect(g.lives).toBe(LIVES - 1);
  });

  it('the last life ends the run', () => {
    const g = empty();
    g.lives = 1;
    place(g, {});
    run(g, 60);
    expect(g.over).toBe(true);
  });

  it('a gap costs a life and the squirrel hops back out, unless it jumps it', () => {
    const fall = empty();
    place(fall, { kind: 'gap', w: 40, h: 0 }, 0);
    run(fall, 60);
    expect(fall.lives).toBe(LIVES - 1);
    expect(fall.over).toBe(false);
    run(fall, 90);
    expect(fall.y).toBeGreaterThanOrEqual(0);
    expect(fall.lives).toBe(LIVES - 1);

    const hop = empty();
    place(hop, { kind: 'gap', w: 40, h: 0 }, 6);
    step(hop, press);
    run(hop, 120);
    expect(hop.lives).toBe(LIVES);
  });

  it('the fly agaric makes the squirrel sick, and the run goes on', () => {
    const g = empty();
    place(g, { kind: 'agaric', stage: 'common', art: 'agaric', w: 12, h: 14 });
    run(g, 60);
    expect(g.over).toBe(false);
    expect(g.sickUntil).toBeGreaterThan(g.tick);
  });

  it('pickups add their points', () => {
    const g = empty();
    place(g, { kind: 'pickup', y: 2, w: 12, h: 12, points: POINTS.common });
    run(g, 60);
    expect(g.bonus).toBe(POINTS.common);
  });

  it('the golden acorn gives the stage its ride: it smashes traps, then ends after 7 s', () => {
    const g = empty();
    place(g, {
      kind: 'acorn',
      stage: 'common',
      art: 'acorn',
      w: 12,
      h: 12,
      points: POINTS.acorn,
    });
    run(g, 30);
    expect(g.ride?.art).toBe('longship');
    place(g, { art: 'moose', w: 26, h: 28, animal: true });
    place(g, {}, 120);
    run(g, 120);
    expect(g.over).toBe(false);
    expect(g.bonus).toBe(POINTS.acorn + 2 * POINTS.smash);
    run(g, RIDE_TICKS);
    expect(g.ride).toBeNull();
  });

  it('no gap comes within a ride of a golden acorn', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const g = newGame(seed);
      while (g.dist < 2 * LAP) {
        g.speed = speedAt(g.dist);
        g.dist += 3;
        fill(g);
      }
      const acorns = g.things.filter(t => t.kind === 'acorn');
      expect(acorns.length).toBeGreaterThan(5);
      for (const acorn of acorns)
        for (const gap of g.things.filter(t => t.kind === 'gap'))
          expect(
            gap.x < acorn.x ||
              gap.x > acorn.x + RIDE_TICKS * speedAt(acorn.x) + 64,
            `seed ${seed}`
          ).toBe(true);
    }
  });
});

describe('the journey', () => {
  it('goes from Scandinavia to the Grand Canyon, then round again', () => {
    expect(STAGES.map(s => s.id)).toEqual([
      'scandinavia',
      'paris',
      'rome',
      'alps',
      'atlantic',
      'newyork',
      'redwoods',
      'canyon',
    ]);
    expect(stageAt(0).index).toBe(0);
    expect(stageAt(STAGES[0].length).index).toBe(1);
    expect(stageAt(LAP - 1).index).toBe(STAGES.length - 1);
    expect(stageAt(LAP)).toEqual({ index: 0, lap: 1, start: LAP });
  });

  it('gets faster, and each lap a little faster still', () => {
    expect(speedAt(LAP / 2)).toBeGreaterThan(speedAt(0));
    expect(speedAt(3 * LAP)).toBeGreaterThan(speedAt(LAP - 1) * 1.25);
  });

  it('remembers the furthest stage reached', () => {
    const g = empty();
    g.dist = STAGES[0].length + STAGES[1].length;
    step(g, idle);
    expect(g.furthest).toBe(2);
  });
});

describe('a kept run', () => {
  /** Plays like a person: a jump every 50 ticks, held for 8. */
  function play(seed: number) {
    const g = newGame(seed);
    const kept: Run = { seed, presses: [], releases: [] };
    while (!g.over && g.tick < 20000) {
      const next = g.tick + 1;
      const input = next % 50 === 0 ? press : next % 50 === 8 ? release : idle;
      if (input.press) kept.presses.push(next);
      if (input.release) kept.releases.push(next);
      step(g, input);
    }
    return { g, kept };
  }

  it('replays to the same score, tick for tick', () => {
    for (const seed of [7, 42, 1234567]) {
      const { g, kept } = play(seed);
      const again = replay(kept);
      expect(again.tick).toBe(g.tick);
      expect(again.dist).toBe(g.dist);
      expect(score(again)).toBe(score(g));
    }
  });

  it('lays out its own course for each seed', () => {
    const course = (seed: number) => {
      const g = newGame(seed);
      while (g.dist < 3000) {
        g.dist += 3;
        fill(g);
      }
      return g.things.map(t => `${t.kind}:${Math.round(t.x)}`).join();
    };
    expect(course(1)).toBe(course(1));
    expect(course(1)).not.toBe(course(2));
  });

  it('uses no maths that engines may round differently', () => {
    const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    expect(code).not.toMatch(
      /Math\.(random|sin|cos|tan|atan|pow|exp|log|sqrt|hypot|cbrt)/
    );
  });
});
