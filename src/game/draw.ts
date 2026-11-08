import {
  GROUND_Y,
  LIVES,
  MERCY_TICKS,
  PLAYER,
  PLAYER_X,
  RIDER,
  TICKS_PER_SECOND,
  VIEW_H,
  VIEW_W,
  score,
  type Game,
} from './sim';
import { STAGES, stageAt } from './stages';

/*
 * One picture of the game. Everything here is looks only: the sim never sees
 * it, so this file may use Math.sin and friends.
 *
 * The canvas is SCALE times the game's 320×180. The art stays on its 16-bit
 * grid (each game pixel is SCALE×SCALE canvas pixels), but everything moves
 * in 1/SCALE steps, so scrolling glides instead of stepping a pixel at a time.
 */
export const SCALE = 4;
const snap = (v: number) => Math.round(v * SCALE) / SCALE;

/** An image with its frames side by side ("run.6.webp": 6 frames). */
export interface Sprite {
  img: CanvasImageSource;
  frames: number;
  w: number;
  h: number;
}
/** Every game image by its path under assets/game, the frame count left off
 *  ("squirrel/run", "scandinavia/moose"). */
export type Art = Map<string, Sprite>;

export interface DrawOptions {
  reducedMotion: boolean;
  /** /play?debug: the hitboxes, for tuning. */
  debug: boolean;
}

/** Where to draw from: the game blended between its last two ticks, so a 90
 *  or 120 Hz screen shows the motion between them too. */
export interface View {
  dist: number;
  y: number;
}

const URLS = import.meta.glob<string>('../assets/game/**/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
});

/** Loads the game's art. An image that fails is left out and drawn as its
 *  box, so a stage whose art is not made yet still plays. */
export async function loadArt(): Promise<Art> {
  const art: Art = new Map();
  await Promise.all(
    Object.entries(URLS).map(async ([path, url]) => {
      const match = path.match(/game\/(.+?)(?:\.(\d+))?\.webp$/);
      if (!match) return;
      const img = new Image();
      img.src = url;
      try {
        await img.decode();
      } catch {
        return;
      }
      const frames = Number(match[2] ?? 1);
      const w = img.naturalWidth / frames;
      art.set(match[1], { img, frames, w, h: img.naturalHeight });
    })
  );
  return art;
}

// Behind everything: shows only at the edge while the screen sways or
// shakes, so it is the evening dark of every stage.
const SKY = '#1a1030';
const HOLE = '#14121a';
/** A thin veil of each stage's evening haze over its scenery (never the
 *  ground or what stands on it), so the things to jump and catch read
 *  first. 10%: at 20% the sunset washed out. */
const HAZE: Record<string, string> = {
  scandinavia: 'rgba(168, 82, 122, 0.1)',
  paris: 'rgba(176, 90, 140, 0.1)',
  rome: 'rgba(40, 60, 130, 0.1)',
  alps: 'rgba(200, 110, 140, 0.1)',
  atlantic: 'rgba(40, 60, 130, 0.1)',
  newyork: 'rgba(90, 60, 150, 0.1)',
  redwoods: 'rgba(110, 140, 190, 0.1)',
  canyon: 'rgba(60, 40, 120, 0.1)',
};
/** The scrolling layers: their speed against the ground's, and how much of
 *  the camera's lift they follow (the far sky none, the near trees most). */
const LAYERS = [
  ['mid', 0.35, 0.4],
  ['near', 0.6, 0.7],
] as const;
const FAR_SPEED = 0.15;

/** How far a pose hangs below the squirrel's box (the jump's tail). */
const DROP: Record<string, number> = { jump: 16, fall: 4 };

/** Easter eggs that are only scenery. */
interface Scenery {
  art: string;
  /** Where in the stage, 0–1. */
  at: number;
  /** Its layer's speed: 1 with the ground, 0.15 with the far sky. */
  factor: number;
  /** Its bottom edge on the screen. */
  bottom: number;
  /** Runs beside the squirrel for this many world px instead. */
  span?: number;
  /** Drawn over the squirrel (the drive-through tree). */
  front?: true;
}

const SCENERY: Record<string, Scenery[]> = {
  rome: [{ art: 'trevi', at: 0.6, factor: 1, bottom: GROUND_Y }],
  alps: [
    { art: 'stbernard', at: 0.4, factor: 1, bottom: GROUND_Y, span: 1200 },
  ],
  // Out on the moonlit horizon, not on the deck.
  atlantic: [{ art: 'whale', at: 0.5, factor: 0.35, bottom: 106 }],
  newyork: [{ art: 'liberty', at: 0.5, factor: 0.35, bottom: GROUND_Y }],
  redwoods: [
    { art: 'tunnel', at: 0.5, factor: 1, bottom: GROUND_Y, front: true },
  ],
  canyon: [{ art: 'condor', at: 0.5, factor: 0.6, bottom: 56 }],
};

/** What moves in each stage's air: in the sky behind everything, or in the
 *  air in front of the scenery (still behind what the squirrel meets). */
const AMBIENT: Record<string, { sky?: Ambient; air?: Ambient }> = {
  scandinavia: { air: 'motes' },
  paris: { air: 'leaves' },
  rome: { sky: 'stars' },
  alps: { air: 'snow' },
  atlantic: { sky: 'stars' },
  newyork: { sky: 'plane' },
  redwoods: { air: 'fireflies' },
  canyon: { sky: 'stars' },
};
type Ambient = 'motes' | 'leaves' | 'stars' | 'snow' | 'plane' | 'fireflies';

type Place = ReturnType<typeof stageAt>;

/** A fixed pseudo-random number in [0, 1) for n: the same every frame. */
const hash = (n: number) => {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};
const wrap = (v: number, size: number) => ((v % size) + size) % size;

/** Frame `frame` of a sprite, its bottom centre at (cx, bottom). */
function sprite(
  ctx: CanvasRenderingContext2D,
  s: Sprite,
  frame: number,
  cx: number,
  bottom: number
) {
  const f = frame % s.frames;
  ctx.drawImage(
    s.img,
    f * s.w,
    0,
    s.w,
    s.h,
    snap(cx - s.w / 2),
    snap(bottom - s.h),
    s.w,
    s.h
  );
}

function tile(
  ctx: CanvasRenderingContext2D,
  s: Sprite,
  offset: number,
  y: number
) {
  for (let x = -snap(wrap(offset, s.w)); x < VIEW_W; x += s.w)
    ctx.drawImage(s.img, x, y);
}

/** The far sky. Where one stage meets the next it blends into the next one
 *  as the new stage scrolls in, instead of a hard cut. */
function sky(
  ctx: CanvasRenderingContext2D,
  art: Art,
  a: string,
  b: string,
  dist: number,
  blend: number
) {
  for (const [id, alpha] of [
    [a, 1],
    [b, blend],
  ] as const) {
    const s = art.get(`${id}/far`);
    if (!s || alpha <= 0) continue;
    ctx.globalAlpha = alpha;
    tile(ctx, s, dist * FAR_SPEED, GROUND_Y - s.h);
  }
  ctx.globalAlpha = 1;
}

/** One stage's middle and near layers, haze and ground, between two screen
 *  columns: these scroll in with the world. */
function land(
  ctx: CanvasRenderingContext2D,
  art: Art,
  id: string,
  dist: number,
  from: number,
  to: number,
  lift: number
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(from, -VIEW_H, to - from, 3 * VIEW_H);
  ctx.clip();
  for (const [name, speed, follow] of LAYERS) {
    const s = art.get(`${id}/${name}`);
    if (s) tile(ctx, s, dist * speed, snap(GROUND_Y - s.h + lift * follow));
  }
  if (HAZE[id]) {
    ctx.fillStyle = HAZE[id];
    ctx.fillRect(from, 0, to - from, snap(GROUND_Y + lift));
  }
  const ground = art.get(`${id}/ground`);
  const top = snap(GROUND_Y + lift);
  if (ground) tile(ctx, ground, dist, top);
  else {
    ctx.fillStyle = '#4a3b2a';
    ctx.fillRect(from, top, to - from, VIEW_H);
  }
  ctx.restore();
}

function ambient(
  ctx: CanvasRenderingContext2D,
  kind: Ambient | undefined,
  tick: number,
  dist: number
) {
  if (!kind) return;
  const dot = (x: number, y: number, w: number, h: number, colour: string) => {
    ctx.fillStyle = colour;
    ctx.fillRect(snap(x), snap(y), w, h);
  };
  if (kind === 'stars') {
    // A shooting star every few seconds, somewhere high up.
    const period = 190;
    const n = Math.floor(tick / period);
    const age = tick - n * period;
    if (age > 26) return;
    const x0 = 60 + hash(n) * 240;
    const y0 = 8 + hash(n + 0.5) * 36;
    for (let k = 0; k < 10; k++) {
      ctx.globalAlpha = (1 - k / 10) * (1 - age / 26);
      dot(x0 - age * 4 + k * 2, y0 + age * 1.6 - k * 0.8, 1, 1, '#fff6e0');
    }
    ctx.globalAlpha = 1;
    return;
  }
  if (kind === 'plane') {
    // A plane's lights crossing the night far off, blinking.
    const x = wrap(tick * 0.18, VIEW_W + 60) - 30;
    dot(x, 34, 1, 1, '#f4f0ff');
    if (Math.floor(tick / 30) % 2) dot(x - 2, 34, 1, 1, '#ff5a5a');
    return;
  }
  const count = { motes: 14, leaves: 10, snow: 40, fireflies: 18 }[kind];
  for (let i = 0; i < count; i++) {
    const r = hash(i + 1);
    const drift = Math.sin(tick / 40 + i) * 4;
    if (kind === 'snow') {
      const x = wrap(r * 400 - dist * 0.5 + drift, VIEW_W + 20) - 10;
      const y =
        wrap(hash(i + 7) * 180 + tick * (0.25 + hash(i + 3) * 0.35), 190) - 10;
      dot(x, y, 1, 1, 'rgba(255, 255, 255, 0.85)');
    } else if (kind === 'leaves') {
      const x =
        wrap(r * 400 - dist * 0.7 - tick * 0.4 + drift * 2, VIEW_W + 20) - 10;
      const y =
        wrap(hash(i + 5) * 180 + tick * (0.3 + hash(i + 2) * 0.3), 170) - 10;
      dot(x, y, 2, 1, i % 2 ? '#e8954a' : '#c9663a');
    } else {
      // Fireflies blink; the golden motes of a northern summer just glow.
      const x = wrap(r * 400 - dist * 0.45 + drift * 1.5, VIEW_W + 20) - 10;
      const y = 50 + hash(i + 9) * 90 + Math.sin(tick / 37 + i * 2) * 5;
      ctx.globalAlpha =
        kind === 'fireflies'
          ? 0.5 + 0.5 * Math.sin(tick / 12 + i * 3)
          : 0.45 + 0.25 * Math.sin(tick / 30 + i);
      dot(x, y, 1, 1, kind === 'fireflies' ? '#ffe27a' : '#ffd9a0');
      ctx.globalAlpha = 1;
    }
  }
}

function scenery(
  ctx: CanvasRenderingContext2D,
  g: Game,
  art: Art,
  places: Place[],
  front: boolean,
  dist: number
) {
  const left = dist + PLAYER_X;
  for (const place of places) {
    const stage = STAGES[place.index];
    for (const item of SCENERY[stage.id] ?? []) {
      const s = art.get(`${stage.id}/${item.art}`);
      if (!s || !!item.front !== front) continue;
      const x = place.start + stage.length * item.at;
      if (item.span !== undefined) {
        if (left >= x && left <= x + item.span)
          sprite(ctx, s, Math.floor(dist / 7), PLAYER_X - 18, item.bottom);
        continue;
      }
      const cx = PLAYER_X + (x - left) * item.factor;
      sprite(ctx, s, Math.floor(g.tick / 10), cx, item.bottom);
    }
  }
}

function things(
  ctx: CanvasRenderingContext2D,
  g: Game,
  art: Art,
  dist: number
) {
  const numbers = art.get('common/digits');
  for (const t of g.things) {
    const x = t.x - dist;
    if (x > VIEW_W || x + t.w + 32 < 0) continue;
    if (t.kind === 'gap') {
      ctx.fillStyle = HOLE;
      ctx.fillRect(snap(x), GROUND_Y, t.w, VIEW_H);
      continue;
    }
    const s = art.get(`${t.stage}/${t.art}`);
    const cx = x + t.w / 2;
    const bottom = GROUND_Y - t.y;
    const catchable =
      t.kind === 'pickup' || t.kind === 'acorn' || t.kind === 'egg';
    if (t.hit === null) {
      // What can be caught bobs a little, so the eye finds it.
      const bob = catchable ? Math.sin((g.tick + t.x) / 9) * 1.5 : 0;
      if (s) sprite(ctx, s, Math.floor(g.tick / 8), cx, bottom + bob);
      else {
        ctx.fillStyle = '#5b4636';
        ctx.fillRect(snap(x), bottom - t.h, t.w, t.h);
      }
      continue;
    }
    const age = g.tick - t.hit;
    if (catchable) {
      sparkle(ctx, cx, bottom - t.h / 2, age);
      if (numbers && t.points)
        points(ctx, numbers, t.points, cx, bottom - t.h - age * 0.5, age);
      continue;
    }
    // Smashed things fly off for a moment; animals leap aside.
    if (!s || age > 40) continue;
    if (t.animal)
      sprite(ctx, s, 0, cx + age * 2, bottom - age * 3 + age * age * 0.12);
    else burst(ctx, s, cx, bottom, age);
  }
}

/** A caught thing's flash: a four-pointed star that opens and fades. */
function sparkle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  age: number
) {
  if (age > 14) return;
  const r = 2 + age * 0.6;
  ctx.globalAlpha = 1 - age / 14;
  ctx.fillStyle = '#fff3c4';
  ctx.fillRect(snap(cx - r), snap(cy), 2 * r, 1);
  ctx.fillRect(snap(cx), snap(cy - r), 1, 2 * r);
  ctx.fillRect(snap(cx - 1), snap(cy - 1), 3, 3);
  ctx.globalAlpha = 1;
}

/** "+10" rising from a caught thing, in the score's digits at half size. */
function points(
  ctx: CanvasRenderingContext2D,
  s: Sprite,
  value: number,
  cx: number,
  y: number,
  age: number
) {
  if (age > 30) return;
  const text = String(value);
  const w = s.w / 2;
  ctx.globalAlpha = age < 20 ? 1 : 1 - (age - 20) / 10;
  let x = cx - ((text.length + 1) * (w + 0.5)) / 2;
  // The plus sign, from the 1's stroke turned on its side would be fussy:
  // two small bars read as + at this size.
  ctx.fillStyle = '#fff6e0';
  ctx.fillRect(snap(x), snap(y - s.h / 4 - 0.5), w - 1, 1);
  ctx.fillRect(snap(x + w / 2 - 1), snap(y - s.h / 2 + 0.5), 1, s.h / 2 - 1);
  x += w + 0.5;
  for (const ch of text) {
    ctx.drawImage(
      s.img,
      Number(ch) * s.w,
      0,
      s.w,
      s.h,
      snap(x),
      snap(y - s.h / 2),
      w,
      s.h / 2
    );
    x += w + 0.5;
  }
  ctx.globalAlpha = 1;
}

/** A smashed thing: its four quarters fly apart. */
function burst(
  ctx: CanvasRenderingContext2D,
  s: Sprite,
  cx: number,
  bottom: number,
  age: number
) {
  const hw = Math.floor(s.w / 2);
  const hh = Math.floor(s.h / 2);
  for (let q = 0; q < 4; q++) {
    const sx = (q % 2) * hw;
    const sy = Math.floor(q / 2) * hh;
    const dx = (q % 2 ? 1 : -1) * age * 1.5;
    const dy = -age * (q < 2 ? 2.5 : 1.5) + age * age * 0.15;
    ctx.drawImage(
      s.img,
      sx,
      sy,
      hw,
      hh,
      snap(cx - hw + sx + dx),
      snap(bottom - s.h + sy + dy),
      hw,
      hh
    );
  }
}

let tintCanvas: HTMLCanvasElement | null = null;

/** The squirrel turned green: sick from the fly agaric. */
function tinted(s: Sprite, frame: number): Sprite {
  tintCanvas ??= document.createElement('canvas');
  tintCanvas.width = s.w;
  tintCanvas.height = s.h;
  const c = tintCanvas.getContext('2d');
  if (!c) return s;
  c.drawImage(s.img, (frame % s.frames) * s.w, 0, s.w, s.h, 0, 0, s.w, s.h);
  c.globalCompositeOperation = 'source-atop';
  c.fillStyle = 'rgba(90, 190, 60, 0.6)';
  c.fillRect(0, 0, s.w, s.h);
  return { img: tintCanvas, frames: 1, w: s.w, h: s.h };
}

function squirrel(
  ctx: CanvasRenderingContext2D,
  g: Game,
  art: Art,
  view: View
) {
  const bottom = GROUND_Y - view.y;
  // Dust where it touched down, whatever it is riding.
  const since = g.tick - g.landedAt;
  if (g.grounded && since < 12) {
    ctx.fillStyle = '#efe4d0';
    for (const k of [-1, 0, 1]) {
      ctx.globalAlpha = 0.7 * (1 - since / 12);
      const r = 1 + since * 0.15;
      ctx.fillRect(
        snap(PLAYER_X + 9 + k * (4 + since * 0.8) - r),
        snap(GROUND_Y - 1 - since * 0.25 - r),
        2 * r,
        2 * r
      );
    }
    ctx.globalAlpha = 1;
  }
  // Knocked: it blinks while it passes through things.
  if (!g.over && g.tick < g.mercyUntil && Math.floor(g.tick / 4) % 2) return;
  const vehicle = g.ride && art.get(`${g.ride.stage}/${g.ride.art}`);
  if (g.ride && vehicle) {
    // The last two seconds blink, as the ride wears off.
    const fading = g.ride.until - g.tick < 2 * TICKS_PER_SECOND;
    if (!fading || Math.floor(g.tick / 4) % 2) {
      sprite(
        ctx,
        vehicle,
        Math.floor(g.tick / 6),
        PLAYER_X + RIDER.w / 2,
        bottom
      );
      return;
    }
  }
  const pose = g.over
    ? 'crash'
    : g.grounded
      ? 'run'
      : g.vy > 0
        ? g.doubleUsed
          ? 'spin'
          : 'jump'
        : 'fall';
  const s = art.get(`squirrel/${pose}`);
  // The tail trails behind: the body, not the whole sprite, sits on the box.
  const cx = PLAYER_X + PLAYER.w / 2 - 5;
  if (!s) {
    ctx.fillStyle = '#c4622d';
    ctx.fillRect(PLAYER_X, snap(bottom - PLAYER.h), PLAYER.w, PLAYER.h);
    return;
  }
  const frame =
    pose === 'run' ? Math.floor(view.dist / 7) : Math.floor(g.tick / 5);
  const feet = bottom + (DROP[pose] ?? 0);
  if (g.tick < g.sickUntil) sprite(ctx, tinted(s, frame), 0, cx, feet);
  else sprite(ctx, s, frame, cx, feet);
  // The beret sits between the ears: 8 px ahead of the sprite's middle and
  // just under the ear tips in every pose. Not while curled up or crashed.
  const hat = g.wearing && art.get(`paris/${g.wearing}`);
  if (hat && pose !== 'spin' && pose !== 'crash')
    sprite(ctx, hat, 0, cx + 8, feet - s.h + (pose === 'jump' ? 9 : 12));
}

/** Streaks rushing past when the run is fast. */
function speedLines(ctx: CanvasRenderingContext2D, g: Game) {
  const count = Math.min(10, Math.floor((g.speed - 3.1) * 20));
  ctx.fillStyle = 'rgba(255, 250, 240, 0.22)';
  for (let i = 0; i < count; i++) {
    const lane = Math.floor(g.tick / 7) + i * 13;
    const y = 18 + hash(lane) * 110;
    const x = VIEW_W - wrap(g.tick * 9 + hash(i + 50) * VIEW_W, VIEW_W + 40);
    ctx.fillRect(snap(x), snap(y), 14, 1);
  }
}

function digits(ctx: CanvasRenderingContext2D, art: Art, value: number) {
  const text = String(value);
  const s = art.get('common/digits');
  if (!s) {
    ctx.fillStyle = '#fff';
    ctx.font = '8px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(text, VIEW_W - 6, 14);
    return;
  }
  let x = VIEW_W - 6 - text.length * (s.w + 1);
  for (const ch of text) {
    ctx.drawImage(s.img, Number(ch) * s.w, 0, s.w, s.h, x, 6, s.w, s.h);
    x += s.w + 1;
  }
}

// A heart, 7×6: the lives, top left. UI like the digits, not scenery.
const HEART = [
  '.XX.XX.',
  'XXXXXXX',
  'XXXXXXX',
  '.XXXXX.',
  '..XXX..',
  '...X...',
];

function hearts(ctx: CanvasRenderingContext2D, g: Game) {
  for (let i = 0; i < LIVES; i++) {
    const left = 6 + i * 10;
    // A dark outline (the heart drawn 1 px off each way), then the fill.
    for (const [dx, dy, colour] of [
      [-1, 0, '#2a1020'],
      [1, 0, '#2a1020'],
      [0, -1, '#2a1020'],
      [0, 1, '#2a1020'],
      [0, 0, i < g.lives ? '#ff4d6d' : '#5a3048'],
    ] as const) {
      ctx.fillStyle = colour;
      HEART.forEach((row, y) => {
        for (let x = 0; x < row.length; x++)
          if (row[x] === 'X') ctx.fillRect(left + x + dx, 6 + y + dy, 1, 1);
      });
    }
  }
}

function hitboxes(ctx: CanvasRenderingContext2D, g: Game, view: View) {
  const box = g.ride ? RIDER : PLAYER;
  ctx.lineWidth = 1 / SCALE;
  ctx.strokeStyle = '#ff0';
  ctx.strokeRect(PLAYER_X, GROUND_Y - view.y - box.h, box.w, box.h);
  ctx.strokeStyle = '#f0f';
  for (const t of g.things)
    if (t.hit === null)
      ctx.strokeRect(
        t.x - view.dist,
        GROUND_Y - t.y - t.h,
        t.w,
        Math.max(t.h, 1)
      );
}

export function draw(
  ctx: CanvasRenderingContext2D,
  g: Game,
  art: Art,
  options: DrawOptions,
  view: View = { dist: g.dist, y: g.y }
) {
  const { dist } = view;
  const calm = options.reducedMotion;
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = SKY;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // A smash or a knock shakes the screen for a moment.
  let smashed = -1000;
  for (const t of g.things)
    if (t.hit !== null && (t.kind === 'trap' || t.kind === 'agaric'))
      smashed = Math.max(smashed, t.hit);
  const knocked = g.mercyUntil > 0 ? g.mercyUntil - MERCY_TICKS : -1000;
  const shaking = Math.min(g.tick - smashed, g.tick - knocked) < 8;
  const sick = g.tick < g.sickUntil;
  ctx.save();
  if (!calm && shaking)
    ctx.translate(((g.tick % 3) - 1) * 1.5, (((g.tick + 1) % 3) - 1) * 1);
  if (sick && !calm) ctx.translate(Math.sin(g.tick / 5) * 3, 0);

  // The camera rises a little with a high jump and settles back.
  const lift = calm ? 0 : Math.max(0, (view.y - 18) * 0.35);

  const a = stageAt(dist);
  const b = stageAt(dist + VIEW_W);
  const seam = b.start > a.start ? b.start - dist : VIEW_W;
  const idA = STAGES[a.index].id;
  const idB = STAGES[b.index].id;
  sky(ctx, art, idA, idB, dist, seam < VIEW_W ? 1 - seam / VIEW_W : 0);
  if (!calm) ambient(ctx, AMBIENT[idA]?.sky, g.tick, dist);
  land(ctx, art, idA, dist, 0, snap(seam), lift);
  if (seam < VIEW_W) land(ctx, art, idB, dist, snap(seam), VIEW_W, lift);

  ctx.save();
  ctx.translate(0, snap(lift));
  const places = seam < VIEW_W ? [a, b] : [a];
  scenery(ctx, g, art, places, false, dist);
  if (!calm) {
    ctx.save();
    ctx.translate(0, snap(-lift * 0.3));
    ambient(ctx, AMBIENT[idA]?.air, g.tick, dist);
    ctx.restore();
  }
  things(ctx, g, art, dist);
  squirrel(ctx, g, art, view);
  scenery(ctx, g, art, places, true, dist);
  if (options.debug) hitboxes(ctx, g, view);
  ctx.restore();
  ctx.restore();

  if (sick && calm) {
    ctx.fillStyle = 'rgba(90, 190, 60, 0.18)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  // A knock flashes red.
  const sinceKnock = g.tick - knocked;
  if (sinceKnock < 12) {
    ctx.fillStyle = `rgba(255, 40, 70, ${0.3 * (1 - sinceKnock / 12)})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  if (!calm && g.speed > 3.1) speedLines(ctx, g);
  digits(ctx, art, score(g));
  hearts(ctx, g);
}
