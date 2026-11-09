import { LAP, STAGES, stageAt } from './stages';

/*
 * The game as numbers: no DOM, no clock. One step() is one tick (1/60 s).
 * The same seed and the same taps give the same run on every device, and in
 * the Worker that will check posted scores. So in this file: only + − × ÷,
 * Math.floor/min/max and the integer maths of the seeded random below; never
 * Math.random, Math.sin or Math.pow (sim.test.ts checks).
 */

export const TICKS_PER_SECOND = 60;
// The view, zoomed out like Alto's: a small squirrel in a big world.
export const VIEW_W = 480;
export const VIEW_H = 270;
/** The ground line, in game pixels from the top. */
export const GROUND_Y = 225;
/** The squirrel's left edge on the screen. */
export const PLAYER_X = 72;
export const PLAYER = { w: 14, h: 13 };
/** Flat on its belly: under a low flyer. */
export const SLIDER = { w: 20, h: 6 };
export const SLIDE_TICKS = 40;
export const RIDER = { w: 40, h: 28 };
export const RIDE_TICKS = 7 * TICKS_PER_SECOND;
export const SICK_TICKS = 3 * TICKS_PER_SECOND;
/** An egg's points count only when all the lives are left; else it is one back. */
export const POINTS = { common: 10, rare: 50, smash: 25, acorn: 100, egg: 100 };
export const LIVES = 3;
/** An egg's height: above a full jump's reach (49 + the squirrel's 13), so
 *  only a second jump near the top of the first gets it. */
export const EGG_Y = 70;
/** After a knock, 1.5 s of blinking and passing through things. */
export const MERCY_TICKS = 90;

const GRAVITY = 0.32;
export const JUMP = 5.6;
export const DOUBLE_JUMP = 4.6;
/** Letting go while rising cuts the rise to this: a tap is a hop. */
const JUMP_CUT = 3.2;
/** A slide asked for in the air: straight down at this speed first. */
const DIVE = 8;
/** A press this many ticks before landing still jumps. */
const BUFFER = 6;
const BASE_SPEED = 2.2;
const SPEED_GAIN = 0.00004;
const MAX_SPEED = 3.6;
/** Ticks in the air on a full jump: the room left between two things. */
const AIRTIME = 36;
/** The first thing shows up about three seconds in. */
const FIRST_AT = 600;

export type Kind = 'trap' | 'gap' | 'pickup' | 'acorn' | 'agaric' | 'egg';

export interface Thing {
  kind: Kind;
  /** Its art: `${stage}/${art}` under src/assets/game. */
  stage: string;
  art: string;
  /** World x of the left edge, and the altitude of the bottom. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Towards the squirrel, on top of the scroll. */
  speed: number;
  animal: boolean;
  points: number;
  /** The tick it was taken or smashed; null while it stands. */
  hit: number | null;
}

export interface Game {
  rng: number;
  tick: number;
  /** World pixels run. */
  dist: number;
  speed: number;
  /** The squirrel's altitude and vertical speed, up positive. */
  y: number;
  vy: number;
  grounded: boolean;
  doubleUsed: boolean;
  holding: boolean;
  /** Tick of a press made in the air with both jumps spent. */
  buffered: number;
  ride: { stage: string; art: string; until: number } | null;
  sickUntil: number;
  bonus: number;
  things: Thing[];
  /** World x where the next thing may go. */
  nextAt: number;
  /** The absolute stage (lap × stages + index) whose acorn and egg are set. */
  setFor: number;
  acornAt: number;
  eggAt: number;
  noGapUntil: number;
  /** The furthest absolute stage reached. */
  furthest: number;
  lives: number;
  /** Until this tick the squirrel blinks and passes through things. */
  mercyUntil: number;
  /** The tick it last touched down (for the dust; no rule reads it). */
  landedAt: number;
  /** Until this tick it slides on its belly. */
  slideUntil: number;
  /** Diving to the ground, to slide when it lands. */
  diving: boolean;
  over: boolean;
}

export interface Input {
  press: boolean;
  release: boolean;
  slide?: boolean;
}

/** A run as it is kept (and later posted): replaying it gives its score. */
export interface Run {
  seed: number;
  /** The ticks of each press and each release, in order. */
  presses: number[];
  releases: number[];
  /** And of each slide (none in runs kept before there were slides). */
  slides?: number[];
}

export function newGame(seed: number): Game {
  return {
    rng: seed | 0,
    tick: 0,
    dist: 0,
    speed: BASE_SPEED,
    y: 0,
    vy: 0,
    grounded: true,
    doubleUsed: false,
    holding: false,
    buffered: -BUFFER - 1,
    ride: null,
    sickUntil: 0,
    bonus: 0,
    things: [],
    nextAt: FIRST_AT,
    setFor: -1,
    acornAt: Infinity,
    eggAt: Infinity,
    noGapUntil: 0,
    furthest: 0,
    lives: LIVES,
    mercyUntil: 0,
    landedAt: -1000,
    slideUntil: 0,
    diving: false,
    over: false,
  };
}

/** A knock: one life less, then a moment of mercy; none left ends the run. */
function hurt(g: Game) {
  g.lives--;
  if (g.lives <= 0) g.over = true;
  else g.mercyUntil = g.tick + MERCY_TICKS;
}

/** mulberry32: integer maths, the same on every engine. */
function random(g: Game) {
  g.rng = (g.rng + 0x6d2b79f5) | 0;
  let t = g.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const score = (g: Game) => Math.floor(g.dist / 10) + g.bonus;

/** The speed at a distance: rising, capped, the cap 15% higher each lap. */
export function speedAt(dist: number) {
  const lap = Math.floor(dist / LAP);
  return Math.min(MAX_SPEED * (1 + 0.15 * lap), BASE_SPEED + SPEED_GAIN * dist);
}

export function step(g: Game, input: Input) {
  if (g.over) return;
  g.tick++;

  if (input.slide && !g.ride) {
    if (g.grounded) g.slideUntil = g.tick + SLIDE_TICKS;
    else {
      g.vy = Math.min(g.vy, -DIVE);
      g.diving = true;
    }
  }
  if (input.press) {
    // A jump ends a slide or a dive.
    g.slideUntil = 0;
    g.diving = false;
    g.holding = true;
    if (g.grounded) {
      g.vy = JUMP;
      g.grounded = false;
    } else if (!g.doubleUsed) {
      g.vy = DOUBLE_JUMP;
      g.doubleUsed = true;
    } else g.buffered = g.tick;
  }
  if (input.release) {
    g.holding = false;
    if (g.vy > JUMP_CUT) g.vy = JUMP_CUT;
  }

  g.speed = speedAt(g.dist);
  g.dist += g.speed;
  for (const t of g.things) t.x -= t.speed;

  const box = g.ride ? RIDER : g.tick < g.slideUntil ? SLIDER : PLAYER;
  const left = g.dist + PLAYER_X;
  g.vy -= GRAVITY;
  g.y += g.vy;
  if (g.y <= 0) {
    // During mercy the ground holds everywhere: no second fall.
    const overGap =
      g.tick >= g.mercyUntil &&
      g.things.some(
        t => t.kind === 'gap' && t.x <= left && left + box.w <= t.x + t.w
      );
    if (!overGap && g.y > -12) {
      const landed = !g.grounded;
      if (landed) g.landedAt = g.tick;
      g.y = 0;
      g.vy = 0;
      g.grounded = true;
      g.doubleUsed = false;
      if (landed && g.diving) {
        g.diving = false;
        g.slideUntil = g.tick + SLIDE_TICKS;
      }
      if (landed && g.tick - g.buffered <= BUFFER) {
        g.buffered = -BUFFER - 1;
        g.vy = g.holding ? JUMP : JUMP_CUT;
        g.grounded = false;
      }
    } else {
      g.grounded = false;
      if (g.y < -40) {
        hurt(g);
        if (g.over) return;
        // Out of the hole with a hop.
        g.y = 0;
        g.vy = JUMP;
      }
    }
  }

  for (const t of g.things) {
    if (t.hit !== null || t.kind === 'gap') continue;
    const harmful = t.kind === 'trap' || t.kind === 'agaric';
    if (harmful && g.tick < g.mercyUntil) continue;
    if (t.x >= left + box.w || left >= t.x + t.w) continue;
    if (t.y >= g.y + box.h || g.y >= t.y + t.h) continue;
    touch(g, t);
    if (g.over) return;
  }
  if (g.ride && g.tick >= g.ride.until) g.ride = null;
  g.things = g.things.filter(t => t.x + t.w > g.dist - 64);

  const here = stageAt(left);
  const reached = here.lap * STAGES.length + here.index;
  if (reached > g.furthest) g.furthest = reached;
  fill(g);
}

function touch(g: Game, t: Thing) {
  if (t.kind === 'trap' || t.kind === 'agaric') {
    if (g.ride) {
      t.hit = g.tick;
      g.bonus += POINTS.smash;
    } else if (t.kind === 'agaric') {
      t.hit = g.tick;
      g.sickUntil = g.tick + SICK_TICKS;
    } else hurt(g);
    return;
  }
  t.hit = g.tick;
  if (t.kind === 'egg' && g.lives < LIVES) {
    g.lives++;
    // No points: the picture shows a heart rising instead.
    t.points = 0;
    return;
  }
  g.bonus += t.points;
  if (t.kind === 'acorn') {
    const stage = STAGES[stageAt(t.x).index];
    if (stage.ride)
      g.ride = {
        stage: stage.id,
        art: stage.ride,
        until: g.tick + RIDE_TICKS,
      };
  }
}

/** Lays out the next things, just past the right edge of the screen. */
export function fill(g: Game) {
  while (g.nextAt < g.dist + VIEW_W + 64) {
    let x = g.nextAt;
    const at = stageAt(x);
    const stage = STAGES[at.index];
    const absolute = at.lap * STAGES.length + at.index;
    if (g.setFor < absolute) {
      g.setFor = absolute;
      g.acornAt = stage.ride
        ? at.start + stage.length * (0.25 + 0.5 * random(g))
        : Infinity;
      g.eggAt = at.start + stage.length * 0.6;
    }
    // Room to land and jump again before the next thing.
    const room = g.speed * AIRTIME + 24;
    let width: number;
    if (x >= g.acornAt) {
      g.acornAt = Infinity;
      width = put(g, 'acorn', 'common', 'acorn', x, 26, 12, 12, POINTS.acorn);
      g.noGapUntil = x + g.speed * RIDE_TICKS + VIEW_W;
    } else if (x >= g.eggAt) {
      g.eggAt = Infinity;
      // High over one of the stage's standing traps: jump early, then
      // again at the top.
      const still = stage.traps.filter(t => !t.fly && !t.speed);
      const trap = still[Math.floor(random(g) * still.length)];
      put(
        g,
        'trap',
        stage.id,
        trap.id,
        x,
        0,
        trap.w,
        trap.h,
        0,
        0,
        !!trap.animal
      );
      put(
        g,
        'egg',
        stage.id,
        stage.egg,
        x + (trap.w - 12) / 2,
        EGG_Y,
        12,
        12,
        POINTS.egg
      );
      width = trap.w;
    } else {
      const roll = random(g);
      if (stage.gaps && x > g.noGapUntil && roll < 0.12) {
        const w = 28 + Math.floor(random(g) * 28);
        width = put(g, 'gap', stage.id, 'gap', x, 0, w, 0, 0);
      } else if (stage.pickups && roll >= 0.7) {
        if (random(g) < 0.15)
          width = put(
            g,
            'pickup',
            stage.id,
            stage.pickups[1],
            x,
            34,
            12,
            12,
            POINTS.rare
          );
        else {
          for (let i = 0; i < 3; i++)
            put(
              g,
              'pickup',
              stage.id,
              stage.pickups[0],
              x + i * 18,
              2,
              12,
              12,
              POINTS.common
            );
          width = 48;
        }
      } else if (stage.pickups && roll >= 0.62) {
        width = put(g, 'agaric', 'common', 'agaric', x, 0, 12, 14, 0);
      } else {
        const trap = stage.traps[Math.floor(random(g) * stage.traps.length)];
        const speed = trap.speed ?? 0;
        // A mover starts further out, so it closes on the thing before it
        // only once the squirrel is past both.
        x += ((VIEW_W + 64 + room) * speed) / g.speed;
        // Low flyers: jump them or slide under them. High ones: run under.
        const y = trap.fly ? (random(g) < 0.5 ? 8 : 22) : 0;
        width = put(
          g,
          'trap',
          stage.id,
          trap.id,
          x,
          y,
          trap.w,
          trap.h,
          0,
          speed,
          trap.animal ?? false
        );
      }
    }
    g.nextAt = x + width + room * (1 + random(g));
  }
}

function put(
  g: Game,
  kind: Kind,
  stage: string,
  art: string,
  x: number,
  y: number,
  w: number,
  h: number,
  points: number,
  speed = 0,
  animal = false
) {
  g.things.push({
    kind,
    stage,
    art,
    x,
    y,
    w,
    h,
    speed,
    animal,
    points,
    hit: null,
  });
  return w;
}

/** Plays a kept run again, tick by tick, until it ends (an hour at most). */
export function replay(run: Run, limit = 3600 * TICKS_PER_SECOND) {
  const g = newGame(run.seed);
  const slides = run.slides ?? [];
  let p = 0;
  let r = 0;
  let s = 0;
  while (!g.over && g.tick < limit) {
    const next = g.tick + 1;
    const press = run.presses[p] === next;
    const release = run.releases[r] === next;
    const slide = slides[s] === next;
    if (press) p++;
    if (release) r++;
    if (slide) s++;
    step(g, { press, release, slide });
  }
  return g;
}
