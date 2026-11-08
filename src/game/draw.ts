import {
  GROUND_Y,
  LIVES,
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

// Behind everything: shows only at the edge while the sick squirrel's screen
// sways, so it is the evening dark of every stage.
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
const LAYERS = [
  ['far', 0.15],
  ['mid', 0.35],
  ['near', 0.6],
] as const;

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

type Place = ReturnType<typeof stageAt>;

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
    Math.round(cx - s.w / 2),
    Math.round(bottom - s.h),
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
  for (let x = -Math.floor(offset % s.w); x < VIEW_W; x += s.w)
    ctx.drawImage(s.img, x, y);
}

/** One stage's backdrop, between two screen columns. */
function scene(
  ctx: CanvasRenderingContext2D,
  art: Art,
  id: string,
  dist: number,
  from: number,
  to: number
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(from, 0, to - from, VIEW_H);
  ctx.clip();
  for (const [name, factor] of LAYERS) {
    const s = art.get(`${id}/${name}`);
    if (s) tile(ctx, s, dist * factor, GROUND_Y - s.h);
  }
  if (HAZE[id]) {
    ctx.fillStyle = HAZE[id];
    ctx.fillRect(from, 0, to - from, GROUND_Y);
  }
  const ground = art.get(`${id}/ground`);
  if (ground) tile(ctx, ground, dist, GROUND_Y);
  else {
    ctx.fillStyle = '#4a3b2a';
    ctx.fillRect(from, GROUND_Y, to - from, VIEW_H - GROUND_Y);
  }
  ctx.restore();
}

function scenery(
  ctx: CanvasRenderingContext2D,
  g: Game,
  art: Art,
  places: Place[],
  front: boolean
) {
  const left = g.dist + PLAYER_X;
  for (const place of places) {
    const stage = STAGES[place.index];
    for (const item of SCENERY[stage.id] ?? []) {
      const s = art.get(`${stage.id}/${item.art}`);
      if (!s || !!item.front !== front) continue;
      const x = place.start + stage.length * item.at;
      if (item.span !== undefined) {
        if (left >= x && left <= x + item.span)
          sprite(ctx, s, Math.floor(g.dist / 7), PLAYER_X - 18, item.bottom);
        continue;
      }
      const cx = PLAYER_X + (x - left) * item.factor;
      sprite(ctx, s, Math.floor(g.tick / 10), cx, item.bottom);
    }
  }
}

function things(ctx: CanvasRenderingContext2D, g: Game, art: Art) {
  for (const t of g.things) {
    const x = Math.floor(t.x - g.dist);
    if (x > VIEW_W || x + t.w + 32 < 0) continue;
    if (t.kind === 'gap') {
      ctx.fillStyle = HOLE;
      ctx.fillRect(x, GROUND_Y, t.w, VIEW_H - GROUND_Y);
      continue;
    }
    const s = art.get(`${t.stage}/${t.art}`);
    const cx = x + t.w / 2;
    const bottom = GROUND_Y - t.y;
    if (t.hit === null) {
      // What can be caught bobs a little, so the eye finds it.
      const bob =
        t.kind === 'pickup' || t.kind === 'acorn' || t.kind === 'egg'
          ? Math.round(Math.sin((g.tick + t.x) / 9) * 1.5)
          : 0;
      if (s) sprite(ctx, s, Math.floor(g.tick / 8), cx, bottom + bob);
      else {
        ctx.fillStyle = '#5b4636';
        ctx.fillRect(x, bottom - t.h, t.w, t.h);
      }
      continue;
    }
    // Taken pickups are gone; smashed things fly off for a moment.
    const age = g.tick - t.hit;
    if (!s || age > 40 || (t.kind !== 'trap' && t.kind !== 'agaric')) continue;
    if (t.animal)
      sprite(ctx, s, 0, cx + age * 2, bottom - age * 3 + age * age * 0.12);
    else burst(ctx, s, cx, bottom, age);
  }
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
      Math.round(cx - hw + sx + dx),
      Math.round(bottom - s.h + sy + dy),
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

function squirrel(ctx: CanvasRenderingContext2D, g: Game, art: Art) {
  // Knocked: it blinks while it passes through things.
  if (!g.over && g.tick < g.mercyUntil && Math.floor(g.tick / 4) % 2) return;
  const bottom = GROUND_Y - Math.round(g.y);
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
    ctx.fillRect(PLAYER_X, bottom - PLAYER.h, PLAYER.w, PLAYER.h);
    return;
  }
  const frame =
    pose === 'run' ? Math.floor(g.dist / 7) : Math.floor(g.tick / 5);
  const feet = bottom + (DROP[pose] ?? 0);
  if (g.tick < g.sickUntil) sprite(ctx, tinted(s, frame), 0, cx, feet);
  else sprite(ctx, s, frame, cx, feet);
  // The beret sits between the ears: 7 px ahead of the sprite's middle and
  // just under the ear tips in every pose. Not while curled up or crashed.
  const hat = g.wearing && art.get(`paris/${g.wearing}`);
  if (hat && pose !== 'spin' && pose !== 'crash')
    sprite(ctx, hat, 0, cx + 8, feet - s.h + (pose === 'jump' ? 9 : 12));
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

function hitboxes(ctx: CanvasRenderingContext2D, g: Game) {
  const box = g.ride ? RIDER : PLAYER;
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#ff0';
  ctx.strokeRect(PLAYER_X + 0.5, GROUND_Y - g.y - box.h + 0.5, box.w, box.h);
  ctx.strokeStyle = '#f0f';
  for (const t of g.things)
    if (t.hit === null)
      ctx.strokeRect(
        Math.floor(t.x - g.dist) + 0.5,
        GROUND_Y - t.y - t.h + 0.5,
        t.w,
        Math.max(t.h, 1)
      );
}

/** One picture of the game. Everything here is looks only: the sim never
 *  sees it, so the sway may use Math.sin. */
export function draw(
  ctx: CanvasRenderingContext2D,
  g: Game,
  art: Art,
  options: DrawOptions
) {
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = SKY;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const sick = g.tick < g.sickUntil;
  ctx.save();
  if (sick && !options.reducedMotion)
    ctx.translate(Math.round(Math.sin(g.tick / 5) * 3), 0);
  // Where one stage meets the next, the new one wipes in with the ground.
  const a = stageAt(g.dist);
  const b = stageAt(g.dist + VIEW_W);
  const seam = b.start > a.start ? Math.round(b.start - g.dist) : VIEW_W;
  scene(ctx, art, STAGES[a.index].id, g.dist, 0, seam);
  if (seam < VIEW_W) scene(ctx, art, STAGES[b.index].id, g.dist, seam, VIEW_W);
  const places = seam < VIEW_W ? [a, b] : [a];
  scenery(ctx, g, art, places, false);
  things(ctx, g, art);
  squirrel(ctx, g, art);
  scenery(ctx, g, art, places, true);
  ctx.restore();
  if (sick && options.reducedMotion) {
    ctx.fillStyle = 'rgba(90, 190, 60, 0.18)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  digits(ctx, art, score(g));
  hearts(ctx, g);
  if (options.debug) hitboxes(ctx, g);
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
