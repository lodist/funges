import { LAP, STAGES, stageAt } from './stages';

/*
 * The game as numbers: no DOM, no clock. One step() is one tick (1/60 s).
 * The same seed and the same taps give the same run on every device, and in
 * the Worker that will check posted scores. So in this file: only + − × ÷,
 * Math.floor/min/max/abs and the integer maths of the seeded random below;
 * never Math.random, Math.sin or Math.pow (sim.test.ts checks).
 *
 * The land rolls. Downhill the squirrel sleds on a leaf and
 * gathers speed, uphill it runs and loses some. Tap to jump, tap again in
 * the air to jump higher (a roll); catches in a row build a combo.
 */

export const TICKS_PER_SECOND = 60;
// The view, zoomed out: a small squirrel in a big world.
export const VIEW_W = 480;
export const VIEW_H = 270;
/** Where the land under the squirrel sits on the screen, game px from the
 *  top, when the camera is level. */
export const GROUND_Y = 200;
/** The squirrel's left edge on the screen. */
export const PLAYER_X = 72;
export const PLAYER = { w: 10, h: 10 };
/** Flat on its belly: under a low flyer. */
export const SLIDER = { w: 15, h: 5 };
export const SLIDE_TICKS = 40;
export const RIDER = { w: 30, h: 21 };
export const RIDE_TICKS = 7 * TICKS_PER_SECOND;
export const SICK_TICKS = 3 * TICKS_PER_SECOND;
/** An egg's points count only when all the lives are left; else it is one
 *  back. */
export const POINTS = { common: 10, rare: 50, smash: 25, acorn: 100, egg: 100 };
export const LIVES = 3;
/** After a knock, 1.5 s of blinking and passing through things. */
export const MERCY_TICKS = 90;
/** The combo holds this long without a new catch; every three in a row
 *  raise the multiplier by one. */
export const COMBO_TICKS = 150;
const COMBO_STEP = 3;
/** Things to catch: their box, and how high they hang (the rare ones and
 *  the golden acorn up in the air). */
const ITEM = 8;
const RARE_Y = 28;
const ACORN_Y = 22;
/** An egg floats this high over its hilltop: past a jump, not a second. */
const EGG_RISE = 60;

const GRAVITY = 0.32;
export const JUMP = 5.4;
/** The second jump, a tap in the air: higher, with a roll. */
export const DOUBLE_JUMP = 4.6;
/** A slide asked for in the air: straight down at this speed first. */
const DIVE = 8;
/** A press this many ticks before landing still jumps. */
const BUFFER = 6;
/** Speeds, world px per tick. Running, it never goes below RUN. */
export const RUN = 2.6;
export const CRUISE = 3.4;
export const TOP = 7;
/** Speed gained downhill and lost uphill per tick, per unit of slope. */
const SLOPE_GAIN = 0.07;
const SLOPE_LOSS = 0.045;
/** The land keeps within this of its starting height. */
const LAND_MAX = 160;
/** Ticks in the air on a jump: the room left between two things. */
const AIRTIME = 34;
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
  /** Its height above the land under its middle. */
  rel: number;
  w: number;
  h: number;
  /** Towards the squirrel, on top of the scroll. */
  speed: number;
  animal: boolean;
  points: number;
  /** The tick it was taken or smashed; null while it stands. */
  hit: number | null;
}

/** The land: heights at points, eased between them (flat at each point, so
 *  every hilltop and valley is round), except up a ramp: straight, with a
 *  lip at its top to fly off. */
export interface Land {
  xs: number[];
  hs: number[];
  /** The segment ending at point i is a ramp. */
  ramp: boolean[];
}

export interface Game {
  rng: number;
  tick: number;
  /** World pixels run. */
  dist: number;
  speed: number;
  land: Land;
  /** The squirrel's altitude and vertical speed, up positive. */
  y: number;
  vy: number;
  grounded: boolean;
  doubleUsed: boolean;
  /** Tick of a press made in the air with both jumps spent. */
  buffered: number;
  /** Things caught in a row, and until when the row holds. */
  combo: number;
  comboUntil: number;
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
  /** Down in a hole: no landing until it is out. */
  falling: boolean;
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
  const g: Game = {
    rng: seed | 0,
    tick: 0,
    dist: 0,
    speed: CRUISE,
    // A flat start, then the land rolls.
    land: { xs: [-VIEW_W, FIRST_AT], hs: [0, 0], ramp: [false, false] },
    y: 0,
    vy: 0,
    grounded: true,
    doubleUsed: false,
    buffered: -BUFFER - 1,
    combo: 0,
    comboUntil: 0,
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
    falling: false,
    over: false,
  };
  grow(g, 3 * VIEW_W);
  return g;
}

/** A knock: one life less, then a moment of mercy; none left ends the run. */
function hurt(g: Game) {
  g.lives--;
  g.combo = 0;
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

/** The combo's multiplier for what is caught now. */
export const multiplier = (g: Game) =>
  g.tick < g.comboUntil ? 1 + Math.floor(g.combo / COMBO_STEP) : 1;

/** The land's height at world x, and its slope (up positive). */
export function ground(land: Land, x: number): [number, number] {
  const { xs, hs } = land;
  let lo = 0;
  let hi = xs.length - 1;
  if (x <= xs[lo]) return [hs[lo], 0];
  if (x >= xs[hi]) return [hs[hi], 0];
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= x) lo = mid;
    else hi = mid;
  }
  const span = xs[hi] - xs[lo];
  const t = (x - xs[lo]) / span;
  const dh = hs[hi] - hs[lo];
  if (land.ramp[hi]) return [hs[lo] + dh * t, dh / span];
  return [hs[lo] + dh * t * t * (3 - 2 * t), (dh * 6 * t * (1 - t)) / span];
}

/** Lays the land out to world x, hill after valley. */
function grow(g: Game, until: number) {
  const { xs, hs, ramp } = g.land;
  while (xs[xs.length - 1] < until) {
    const x = xs[xs.length - 1];
    const h = hs[hs.length - 1];
    const hills = STAGES[stageAt(x).index].hills;
    const roll = random(g);
    if (roll < 0.15) {
      xs.push(x + 120 + 160 * random(g));
      hs.push(h);
      ramp.push(false);
      continue;
    }
    // Downhill more often, and longer: the land stays within its band.
    const down = h > LAND_MAX * 0.4 || (h > -LAND_MAX * 0.4 && roll < 0.6);
    if (down && random(g) < 0.25) {
      // A kicker before the drop: off its lip the squirrel flies.
      xs.push(x + 40);
      hs.push(h + 18 * hills);
      ramp.push(true);
    }
    const from = hs[hs.length - 1];
    const span = down ? 260 + 260 * random(g) : 160 + 160 * random(g);
    const rise = down ? -(60 + 90 * random(g)) : 40 + 60 * random(g);
    xs.push(xs[xs.length - 1] + span);
    hs.push(Math.max(-LAND_MAX, Math.min(LAND_MAX, from + rise * hills)));
    ramp.push(false);
  }
}

/** Forgets the land far behind. */
function trim(g: Game) {
  const { xs, hs, ramp } = g.land;
  while (xs.length > 3 && xs[1] < g.dist - VIEW_W) {
    xs.shift();
    hs.shift();
    ramp.shift();
  }
}

function jump(g: Game, slope: number) {
  g.vy = JUMP + g.speed * slope;
  g.grounded = false;
}

export function step(g: Game, input: Input) {
  if (g.over) return;
  g.tick++;
  grow(g, g.dist + 3 * VIEW_W);
  trim(g);

  const box = () => (g.ride ? RIDER : g.tick < g.slideUntil ? SLIDER : PLAYER);
  const feet = () => g.dist + PLAYER_X + PLAYER.w / 2;
  const [, slope] = ground(g.land, feet());

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
    if (g.grounded) jump(g, slope);
    else if (!g.doubleUsed) {
      g.vy = DOUBLE_JUMP;
      g.doubleUsed = true;
    } else g.buffered = g.tick;
  }

  // On the land: faster downhill, slower uphill, settling to a cruise.
  const lap = Math.floor(g.dist / LAP);
  const top = TOP * (1 + 0.15 * lap);
  if (g.grounded) {
    if (slope < 0) g.speed -= slope * SLOPE_GAIN;
    else g.speed -= slope * SLOPE_LOSS;
    g.speed += (CRUISE - g.speed) * 0.004;
    g.speed = Math.max(RUN, Math.min(top, g.speed));
  }
  g.dist += g.speed;
  for (const t of g.things) {
    if (!t.speed) continue;
    t.x -= t.speed;
    t.y = ground(g.land, t.x + t.w / 2)[0] + t.rel;
  }

  const left = g.dist + PLAYER_X;
  const [h, s] = ground(g.land, feet());
  // During mercy the land holds everywhere: no second fall.
  const overGap =
    g.tick >= g.mercyUntil &&
    g.things.some(
      t => t.kind === 'gap' && t.x <= left && left + box().w <= t.x + t.w
    );
  if (g.grounded) {
    // It follows the land, unless the land falls away faster than gravity
    // pulls: then, off a crest or a kicker's lip, it flies.
    const follow = g.speed * s;
    const free = g.y + g.vy - GRAVITY;
    if (overGap || (follow < g.vy - GRAVITY && free > h)) {
      g.grounded = false;
      g.y = free;
      g.vy -= GRAVITY;
    } else {
      g.y = h;
      g.vy = follow;
    }
  } else {
    g.vy -= GRAVITY;
    g.y += g.vy;
    if (overGap && g.y < h - 2) g.falling = true;
    if (!g.falling) {
      if (g.y <= h) land(g, s);
    } else if (g.y < h - 40) {
      hurt(g);
      if (g.over) return;
      // Out of the hole with a hop.
      g.falling = false;
      g.y = h;
      g.vy = JUMP;
    }
  }

  for (const t of g.things) {
    if (t.hit !== null || t.kind === 'gap') continue;
    const harmful = t.kind === 'trap' || t.kind === 'agaric';
    if (harmful && g.tick < g.mercyUntil) continue;
    const b = box();
    if (t.x >= left + b.w || left >= t.x + t.w) continue;
    if (t.y >= g.y + b.h || g.y >= t.y + t.h) continue;
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

/** Touching down. */
function land(g: Game, slope: number) {
  g.grounded = true;
  g.doubleUsed = false;
  g.landedAt = g.tick;
  g.vy = g.speed * slope;
  if (g.diving) {
    g.diving = false;
    g.slideUntil = g.tick + SLIDE_TICKS;
  }
  if (g.tick - g.buffered <= BUFFER) {
    g.buffered = -BUFFER - 1;
    jump(g, slope);
  }
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
  // What is caught in a combo counts times its multiplier.
  t.points *= multiplier(g);
  g.bonus += t.points;
  g.combo = g.tick < g.comboUntil ? g.combo + 1 : 1;
  g.comboUntil = g.tick + COMBO_TICKS;
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

/** The first hilltop at or after world x (the land grows to find one). */
function crest(g: Game, x: number) {
  const { xs, hs } = g.land;
  for (let i = 1; ; i++) {
    if (i + 1 >= xs.length) grow(g, xs[xs.length - 1] + VIEW_W);
    if (xs[i] >= x && hs[i] > hs[i - 1] && hs[i] > hs[i + 1]) return xs[i];
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
      width = put(
        g,
        'acorn',
        'common',
        'acorn',
        x,
        ACORN_Y,
        ITEM,
        ITEM,
        POINTS.acorn
      );
      g.noGapUntil = x + TOP * RIDE_TICKS;
    } else if (x >= g.eggAt) {
      g.eggAt = Infinity;
      // Up past a hilltop: only both jumps from the top of the hill reach it.
      const top = crest(g, x);
      const [hill] = ground(g.land, top);
      const ex = top + 90;
      const rel = hill + EGG_RISE - ground(g.land, ex + ITEM / 2)[0];
      put(g, 'egg', stage.id, stage.egg, ex, rel, ITEM, ITEM, POINTS.egg);
      width = ex + ITEM - x;
    } else {
      const roll = random(g);
      const steep = (from: number, to: number) =>
        Math.abs(ground(g.land, from)[1]) > 0.35 ||
        Math.abs(ground(g.land, to)[1]) > 0.35;
      const w = 28 + Math.floor(random(g) * 28);
      if (roll >= 0.82) {
        // Nothing: room to run.
        width = 0;
      } else if (
        stage.gaps &&
        x > g.noGapUntil &&
        roll < 0.12 &&
        !steep(x, x + w)
      ) {
        width = put(g, 'gap', stage.id, 'gap', x, 0, w, 0, 0);
      } else if (stage.pickups && roll >= 0.46) {
        if (random(g) < 0.15)
          width = put(
            g,
            'pickup',
            stage.id,
            stage.pickups[1],
            x,
            RARE_Y,
            ITEM,
            ITEM,
            POINTS.rare
          );
        else {
          for (let i = 0; i < 3; i++)
            put(
              g,
              'pickup',
              stage.id,
              stage.pickups[0],
              x + i * 12,
              2,
              ITEM,
              ITEM,
              POINTS.common
            );
          width = 32;
        }
      } else if (stage.pickups && roll >= 0.4) {
        width = put(g, 'agaric', 'common', 'agaric', x, 0, ITEM, ITEM, 0);
      } else {
        const trap = stage.traps[Math.floor(random(g) * stage.traps.length)];
        const speed = trap.speed ?? 0;
        // A mover starts further out, so it closes on the thing before it
        // only once the squirrel is past both.
        x += ((VIEW_W + 64 + room) * speed) / g.speed;
        // Low flyers: jump them or slide under them. High ones: run under.
        const rel = trap.fly ? (random(g) < 0.5 ? 7 : 16) : 0;
        width = put(
          g,
          'trap',
          stage.id,
          trap.id,
          x,
          rel,
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

/** A thing at world x, `rel` above the land under its middle. */
function put(
  g: Game,
  kind: Kind,
  stage: string,
  art: string,
  x: number,
  rel: number,
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
    y: ground(g.land, x + w / 2)[0] + rel,
    rel,
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
