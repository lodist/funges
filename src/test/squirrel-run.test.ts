import { describe, expect, it } from 'vitest';
import source from '@/game/sim.ts?raw';
import { LAP, STAGES, stageAt } from '@/game/stages';
import {
  CRUISE,
  LIVES,
  PLAYER,
  PLAYER_X,
  POINTS,
  RIDE_TICKS,
  RUN,
  TOP,
  VIEW_MAX_W,
  fill,
  ground,
  newGame,
  replay,
  score,
  step,
  type Game,
  type Run,
  type Thing,
} from '@/game/sim';

const idle = { press: false, release: false };
const press = { press: true, release: false };
const release = { press: false, release: true };
const slide = { press: false, release: false, slide: true };

/** A game on flat land where nothing comes on its own: one thing at a time. */
function empty(seed = 1): Game {
  const g = newGame(seed);
  g.nextAt = Infinity;
  g.land = { xs: [-1e9, 1e12], hs: [0, 0], ramp: [false, false] };
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
    rel: 0,
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

/** A land from the squirrel on: flat, then `drop` px down over `span` px. */
function slope(g: Game, drop: number, span = 2000) {
  g.land = {
    xs: [-1e9, g.dist + 200, g.dist + 200 + span, 1e12],
    hs: [0, 0, -drop, -drop],
    ramp: [false, false, false, false],
  };
}

describe('the squirrel', () => {
  it('runs along the ground and the distance grows', () => {
    const g = empty();
    run(g, 60);
    expect(g.y).toBe(0);
    expect(g.grounded).toBe(true);
    expect(g.dist).toBeGreaterThan(150);
  });

  it('jumps on a tap and comes back down', () => {
    const g = empty();
    step(g, press);
    step(g, release);
    expect(g.grounded).toBe(false);
    run(g, 60);
    expect(g.grounded).toBe(true);
    expect(g.y).toBe(0);
  });

  it('jumps again on landing when pressed just before it', () => {
    const g = empty();
    step(g, press);
    step(g, release);
    while (!(g.vy < 0 && g.y <= 12)) step(g, idle);
    step(g, press);
    step(g, release);
    let tookOff = false;
    for (let i = 0; i < 8; i++) {
      step(g, idle);
      if (g.vy > 0) tookOff = true;
    }
    expect(tookOff).toBe(true);
  });

  it('jumps once more in the air, with a roll, and only once', () => {
    const g = empty();
    step(g, press);
    step(g, release);
    run(g, 10);
    const falling = g.vy;
    step(g, press);
    expect(g.vy).toBeGreaterThan(falling);
    expect(g.doubleUsed).toBe(true);
    const rising = g.vy;
    step(g, press);
    expect(g.vy).toBeLessThan(rising);
  });

  it('catches in a row build a combo: every three raise the multiplier', () => {
    const g = empty();
    for (let i = 0; i < 4; i++)
      place(
        g,
        { kind: 'pickup', y: 2, w: 8, h: 8, points: POINTS.common },
        20 + i * 12
      );
    run(g, 60);
    expect(g.bonus).toBe(3 * POINTS.common + 2 * POINTS.common);
  });
});

describe('the land', () => {
  it('rolls within its band, and the run starts flat', () => {
    const g = newGame(3);
    g.nextAt = Infinity;
    expect(ground(g.land, 300)[0]).toBe(0);
    for (let i = 0; i < 4000; i++) {
      step(g, idle);
      const [h, s] = ground(g.land, g.dist + 300);
      expect(Math.abs(h)).toBeLessThanOrEqual(160);
      expect(Math.abs(s)).toBeLessThan(2);
    }
    expect(g.over).toBe(false);
  });

  it('downhill the squirrel speeds up; uphill it slows, but keeps running', () => {
    const down = empty();
    slope(down, 600);
    run(down, 200);
    expect(down.speed).toBeGreaterThan(CRUISE + 1);

    const up = empty();
    slope(up, -600);
    run(up, 400);
    expect(up.speed).toBeLessThan(CRUISE);
    expect(up.speed).toBeGreaterThanOrEqual(RUN);
  });

  it('each lap lets it go faster', () => {
    const fastest = (lap: number) => {
      const g = empty();
      g.dist = lap * LAP;
      slope(g, 8000, 8000);
      run(g, 900);
      return g.speed;
    };
    expect(fastest(0)).toBeLessThanOrEqual(TOP);
    expect(fastest(2)).toBeGreaterThan(TOP);
  });

  it('off a kicker it flies without a tap', () => {
    const g = empty();
    g.land = {
      xs: [-1e9, g.dist + 150, g.dist + 190, g.dist + 500, 1e12],
      hs: [0, 0, 18, -100, -100],
      ramp: [false, false, true, false, false],
    };
    let flew = false;
    for (let i = 0; i < 200; i++) {
      step(g, idle);
      if (!g.grounded) flew = true;
    }
    expect(flew).toBe(true);
    expect(g.lives).toBe(LIVES);
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
    step(hop, release);
    run(hop, 120);
    expect(hop.lives).toBe(LIVES);
  });

  it('a hole on a downhill costs one life, and the squirrel is soon back on the land', () => {
    const g = empty();
    slope(g, 600);
    run(g, 60);
    place(g, { kind: 'gap', w: 40, h: 0 }, 0);
    run(g, 60);
    expect(g.lives).toBe(LIVES - 1);
    expect(g.falling).toBe(false);
    run(g, 60);
    const [h] = ground(g.land, g.dist + PLAYER_X + PLAYER.w / 2);
    expect(g.y).toBeGreaterThanOrEqual(h - 0.5);
    expect(g.lives).toBe(LIVES - 1);
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

  it('an easter egg is a life back, or its points when all the lives are left', () => {
    const egg = {
      kind: 'egg' as const,
      y: 2,
      w: 12,
      h: 12,
      points: POINTS.egg,
    };
    const knocked = empty();
    knocked.lives = LIVES - 1;
    place(knocked, egg);
    run(knocked, 60);
    expect(knocked.lives).toBe(LIVES);
    expect(knocked.bonus).toBe(0);

    const whole = empty();
    place(whole, egg);
    run(whole, 60);
    expect(whole.lives).toBe(LIVES);
    expect(whole.bonus).toBe(POINTS.egg);
  });

  it('a slide passes under a low flyer that stops a squirrel standing up', () => {
    const pigeon = { art: 'pigeon', y: 8, w: 14, h: 10, animal: true };
    const standing = empty();
    place(standing, pigeon);
    run(standing, 40);
    expect(standing.lives).toBe(LIVES - 1);

    const sliding = empty();
    place(sliding, pigeon);
    step(sliding, slide);
    run(sliding, 30);
    expect(sliding.lives).toBe(LIVES);
  });

  it('a slide asked for in the air dives to the ground, then slides', () => {
    const g = empty();
    step(g, press);
    step(g, release);
    run(g, 8);
    step(g, slide);
    run(g, 12);
    expect(g.grounded).toBe(true);
    expect(g.tick).toBeLessThan(g.slideUntil);
  });

  it('every stage hides one easter egg, up past a hilltop', () => {
    const g = newGame(1);
    while (g.dist < LAP) {
      g.dist += 3;
      fill(g);
    }
    const eggs = g.things.filter(t => t.kind === 'egg' && t.x < LAP);
    expect(eggs.map(t => t.stage)).toEqual(STAGES.map(s => s.id));
    // Out of reach of a squirrel just running along.
    for (const egg of eggs) expect(egg.rel).toBeGreaterThan(PLAYER.h);
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
    for (const seed of [1, 2, 3, 4]) {
      const g = newGame(seed);
      while (g.dist < 2 * LAP) {
        g.dist += 3;
        fill(g);
      }
      const acorns = g.things.filter(t => t.kind === 'acorn');
      expect(acorns.length).toBeGreaterThan(5);
      for (const acorn of acorns)
        for (const gap of g.things.filter(t => t.kind === 'gap'))
          expect(
            gap.x < acorn.x || gap.x > acorn.x + RIDE_TICKS * TOP,
            `seed ${seed}`
          ).toBe(true);
    }
  });

  it('comes in past the right edge of the widest screen, never inside it', () => {
    for (const seed of [1, 2]) {
      const g = newGame(seed);
      fill(g);
      const first = g.things.length;
      while (g.dist < LAP / 4) {
        g.dist += 7;
        const before = g.things.length;
        fill(g);
        for (const t of g.things.slice(before))
          expect(t.x - g.dist, `seed ${seed}`).toBeGreaterThan(VIEW_MAX_W);
      }
      expect(g.things.length - first).toBeGreaterThan(20);
    }
  });
});

describe('the journey', () => {
  it('goes from Scandinavia over the fjords to the Grand Canyon, then round again', () => {
    expect(STAGES.map(s => s.id)).toEqual([
      'scandinavia',
      'fjords',
      'copenhagen',
      'highlands',
      'paris',
      'barcelona',
      'rome',
      'alps',
      'newyork',
      'neworleans',
      'yosemite',
      'sequoia',
      'canyon',
    ]);
    expect(stageAt(0).index).toBe(0);
    expect(stageAt(STAGES[0].length).index).toBe(1);
    expect(stageAt(LAP - 1).index).toBe(STAGES.length - 1);
    expect(stageAt(LAP)).toEqual({ index: 0, lap: 1, start: LAP });
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
