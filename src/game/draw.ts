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
 * One picture of the game: a smooth silhouette world under a banded 16-bit
 * sky (Alto's light, our lines), with the 16-bit figures in it. Nothing has
 * an outline: the ground the action runs on is the lightest band in the
 * scene, mist rises at the foot of every layer so it is light behind the
 * play, and what can be caught glows.
 *
 * The canvas is as many device pixels as it is shown at; `scale` of them
 * make one game pixel (the game is 480×270). Pixel art is drawn nearest
 * neighbour, the smooth layers at full resolution, and everything moves in
 * 1/scale steps.
 *
 * Looks only: the sim never sees this file, so it may use Math.sin.
 */
let S = 3;
const snap = (v: number) => Math.round(v * S) / S;

/** An image with its frames side by side ("run.6.webp": 6 frames). */
export interface Sprite {
  img: CanvasImageSource;
  frames: number;
  w: number;
  h: number;
}
/** Every sprite by its path under assets/game, the frame count left off
 *  ("squirrel/run", "scandinavia/moose"). */
export type Art = Map<string, Sprite>;

export interface DrawOptions {
  reducedMotion: boolean;
  /** /play?debug: the hitboxes, for tuning. */
  debug: boolean;
  /** Canvas pixels per game pixel. */
  scale: number;
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
const NAME = /game\/(.+?)(?:\.(\d+))?\.webp$/;
/** Landscape masks load per stage, as the run nears it; sprites at once. */
const isMask = (name: string) => /\.(mask|lights)$/.test(name);

/** Loads the sprites. One that fails is left out and drawn as its box. */
export async function loadArt(): Promise<Art> {
  const art: Art = new Map();
  await Promise.all(
    Object.entries(URLS).map(async ([path, url]) => {
      const match = path.match(NAME);
      if (!match || isMask(match[1])) return;
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

/* ---------------------------------------------------------------- looks */

type LayerName = 'far' | 'mid' | 'near';

/** Each stage's hour, in colours. Tuning a stage's mood happens here. */
interface Look {
  /** Sky stops, top to horizon; drawn as flat bands, the 16-bit lines. */
  sky: [number, string][];
  /** A low sun or a moon: centre and radius in game px. */
  orb?: { x: number; y: number; r: number; colour: string; glow: string };
  stars?: number;
  aurora?: true;
  milkyway?: true;
  far: string;
  mid: string;
  near: string;
  /** The mist rising at each layer's foot, and how thick (far, mid, near). */
  mist: string;
  fog: [number, number, number];
  /** Lit windows. */
  lights: string;
  /** The ground's bands from its sunlit edge down: the lightest thing. */
  ground: string[];
  /** Inside a hole in the ground. */
  hole: string;
  /** Layer heights on screen where the default does not suit (game px). */
  heights?: Partial<Record<LayerName, number>>;
  /** The far layer comes with its own plain second half: no mirroring. */
  wide?: true;
}

const LOOKS: Record<string, Look> = {
  scandinavia: {
    wide: true,
    sky: [
      [0, '#2a1b4e'],
      [0.3, '#6a2f78'],
      [0.55, '#c9527a'],
      [0.75, '#f08a62'],
      [0.9, '#ffbe6e'],
      [1, '#ffd890'],
    ],
    orb: { x: 360, y: 128, r: 12, colour: '#fff1cf', glow: '#ffe2a8' },
    aurora: true,
    far: '#b585ad',
    mid: '#8a5689',
    near: '#56305f',
    mist: '#f3b3a4',
    fog: [0.75, 0.6, 0.7],
    lights: '#ffd28a',
    ground: ['#fbe8da', '#f4dccd', '#efd3c4', '#e9cabb', '#e2c0b2'],
    hole: '#3a2048',
  },
  paris: {
    heights: { near: 112 },
    wide: true,
    sky: [
      [0, '#3a1f5c'],
      [0.32, '#7b3a82'],
      [0.58, '#c45a8e'],
      [0.78, '#ec7f8c'],
      [0.92, '#ffb39a'],
      [1, '#ffd3b0'],
    ],
    orb: { x: 150, y: 140, r: 11, colour: '#fff0d8', glow: '#ffd0b0' },
    far: '#b98ab8',
    mid: '#8c5a8e',
    near: '#4e2a5c',
    mist: '#f2b8b8',
    fog: [0.7, 0.55, 0.65],
    lights: '#ffd28a',
    ground: ['#fbe9e4', '#f4dcd8', '#eed2cf', '#e7c8c6', '#e0bebd'],
    hole: '#341a40',
  },
  rome: {
    wide: true,
    sky: [
      [0, '#0b1030'],
      [0.35, '#14204e'],
      [0.65, '#1f3170'],
      [0.88, '#2e4890'],
      [1, '#4a63a8'],
    ],
    orb: { x: 330, y: 56, r: 14, colour: '#f4ecd8', glow: '#9fb3e8' },
    stars: 60,
    far: '#3b5596',
    mid: '#2b3f7a',
    near: '#17224a',
    mist: '#6d84c2',
    fog: [0.6, 0.5, 0.6],
    lights: '#ffd27a',
    ground: ['#e6ecfa', '#d8e0f4', '#cdd6ee', '#c2cce8', '#b7c2e0'],
    hole: '#0c1230',
  },
  alps: {
    wide: true,
    sky: [
      [0, '#2b1a52'],
      [0.3, '#6a2f78'],
      [0.55, '#c9527a'],
      [0.75, '#f08a62'],
      [0.9, '#ffbe6e'],
      [1, '#ffd890'],
    ],
    orb: { x: 384, y: 100, r: 11, colour: '#fff1cf', glow: '#ffe2a8' },
    far: '#b585ad',
    mid: '#8a5689',
    near: '#56305f',
    mist: '#f3b3a4',
    fog: [0.75, 0.6, 0.7],
    lights: '#ffd28a',
    ground: ['#fbe8da', '#f4dccd', '#efd3c4', '#e9cabb', '#e2c0b2'],
    hole: '#3a2048',
  },
  atlantic: {
    wide: true,
    sky: [
      [0, '#081236'],
      [0.4, '#10205a'],
      [0.75, '#1b3480'],
      [1, '#2b4c9e'],
    ],
    orb: { x: 120, y: 60, r: 14, colour: '#f4f0e0', glow: '#9fb6ee' },
    stars: 70,
    far: '#2c4688',
    mid: '#1f3266',
    near: '#101c40',
    mist: '#5a76b8',
    fog: [0.5, 0.45, 0.55],
    lights: '#ffe08a',
    ground: ['#dfe6f6', '#cfd8ee', '#c3cee6', '#b7c3de', '#abb8d6'],
    hole: '#070d24',
  },
  newyork: {
    wide: true,
    sky: [
      [0, '#140c2e'],
      [0.35, '#24164a'],
      [0.65, '#3a2166'],
      [0.88, '#5a2f7e'],
      [1, '#8a4a8a'],
    ],
    stars: 25,
    far: '#4a3a7e',
    mid: '#33265e',
    near: '#1a1236',
    mist: '#8a6aa8',
    fog: [0.55, 0.5, 0.6],
    lights: '#ffd27a',
    ground: ['#ece4f4', '#ddd3ea', '#d2c7e2', '#c7bbda', '#bcafd1'],
    hole: '#0e0a22',
  },
  redwoods: {
    heights: { near: 140 },
    sky: [
      [0, '#2a3e6e'],
      [0.45, '#4a68a0'],
      [0.8, '#7f9cc8'],
      [1, '#b8cde6'],
    ],
    orb: { x: 300, y: 70, r: 9, colour: '#eef3fa', glow: '#c8d8ee' },
    far: '#6a84b0',
    mid: '#45608c',
    near: '#1c2a44',
    mist: '#b8cde6',
    fog: [0.8, 0.7, 0.75],
    lights: '#f0c070',
    ground: ['#eef2f4', '#e2e9ec', '#d7e0e5', '#ccd7de', '#c1ced7'],
    hole: '#101826',
  },
  canyon: {
    heights: { far: 120, mid: 80 },
    sky: [
      [0, '#070818'],
      [0.35, '#101436'],
      [0.62, '#1e1e5a'],
      [0.82, '#3a2a6e'],
      [0.94, '#7a3a5e'],
      [1, '#e0784a'],
    ],
    stars: 90,
    milkyway: true,
    far: '#4a2a5a',
    mid: '#3a1e48',
    near: '#1a0e22',
    mist: '#8a4a6a',
    fog: [0.55, 0.45, 0.5],
    lights: '#ffc070',
    ground: ['#f4dccb', '#ebcdb9', '#e2c0ab', '#d9b39e', '#d0a792'],
    hole: '#100818',
  },
};

/** The layers: height on screen (game px), scroll speed against the
 *  ground's, and how much of the camera's lift they follow. */
const LAYERS: [LayerName, number, number, number][] = [
  ['far', 195, 0.12, 0.25],
  ['mid', 112, 0.3, 0.45],
  ['near', 150, 0.55, 0.7],
];
/** Where the sky's bands end, game px: the land covers what is below. */
const HORIZON = 150;
/** The sky's band edges, 0–1 of the way to the horizon: thinner lower down. */
const BANDS = [0, 0.2, 0.36, 0.49, 0.6, 0.69, 0.77, 0.84, 0.9, 0.95, 1];
/** The mist at a layer's foot: four bands of this many game px. */
const MIST_BAND = 17;
/** The ground's bands, game px from its edge down. */
const GROUND_BANDS = [0, 1, 7, 15, 26];

const rgb = (hex: string) =>
  [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const hexOf = (c: number[]) =>
  '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');

/** The sky's bands for a look: each band the colour at its middle. */
const skyBands = new Map<string, string[]>();
function bandsOf(id: string, look: Look) {
  let bands = skyBands.get(id);
  if (bands) return bands;
  bands = [];
  for (let i = 0; i < BANDS.length - 1; i++) {
    const t = (BANDS[i] + BANDS[i + 1]) / 2;
    const k = look.sky.findIndex(([at]) => at >= t);
    const [a, ca] = look.sky[Math.max(0, k - 1)];
    const [b, cb] = look.sky[Math.max(0, k)];
    const f = b > a ? (t - a) / (b - a) : 0;
    const x = rgb(ca);
    const y = rgb(cb);
    bands.push(hexOf(x.map((v, j) => v + (y[j] - v) * f)));
  }
  skyBands.set(id, bands);
  return bands;
}

/* ---------------------------------------------------------------- caches */

const masks = new Map<string, HTMLImageElement | 'loading' | 'missing'>();

/** A landscape mask, loading it on first ask: undefined until it is there. */
function mask(name: string): HTMLImageElement | 'missing' | undefined {
  const got = masks.get(name);
  if (got && got !== 'loading') return got;
  if (!got) {
    const url = URLS[`../assets/game/${name}.webp`];
    if (!url) {
      masks.set(name, 'missing');
      return 'missing';
    }
    masks.set(name, 'loading');
    const img = new Image();
    img.src = url;
    img.decode().then(
      () => masks.set(name, img),
      () => masks.set(name, 'missing')
    );
  }
  return undefined;
}

interface Layer {
  canvas: HTMLCanvasElement;
  /** One period (the mask and its mirror image), game px. */
  w: number;
  h: number;
  /** The colour of its misty foot, for the gap under it. */
  foot: string;
}
const layers = new Map<string, Layer | null>();
let builtThisFrame = false;

/** The mask once, or with its mirror image beside it so it tiles without a
 *  seam. A far layer with a landmark comes with its own plain second half
 *  instead: mirrored, the landmark would show twice in one view. */
function both(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number,
  mirror: boolean
) {
  ctx.drawImage(img, 0, 0, w, h);
  if (!mirror) return;
  ctx.save();
  ctx.translate(2 * w, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(img, 0, 0, w, h);
  ctx.restore();
}

const fogOf = (look: Look, name: LayerName) =>
  look.fog[name === 'far' ? 0 : name === 'mid' ? 1 : 2];
const heightOf = (look: Look | undefined, name: LayerName) =>
  look?.heights?.[name] ?? LAYERS.find(([n]) => n === name)![1];

/** A stage's layer in its colours, at the current scale; built on first ask,
 *  one per frame, so a new stage never stalls a frame for long. */
function layer(id: string, name: LayerName) {
  const key = `${id}/${name}@${S}`;
  if (layers.has(key)) return layers.get(key) ?? undefined;
  const look = LOOKS[id];
  const m = mask(`${id}/${name}.mask`);
  const l = mask(`${id}/${name}.lights`);
  if (!look || m === 'missing') {
    layers.set(key, null);
    return undefined;
  }
  if (!m || l === undefined || builtThisFrame) return undefined;
  builtThisFrame = true;
  const height = heightOf(look, name);
  const mirror = !(name === 'far' && look.wide);
  const h = Math.round(height * S);
  const w = Math.round((m.naturalWidth * h) / m.naturalHeight);
  const span = mirror ? 2 * w : w;
  const canvas = document.createElement('canvas');
  canvas.width = span;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;
  both(ctx, m, w, h, mirror);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = look[name];
  ctx.fillRect(0, 0, span, h);
  // Mist rising at the foot, in four bands on the game's pixel grid.
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = look.mist;
  const band = Math.round(MIST_BAND * S);
  const fog = fogOf(look, name);
  for (let i = 1; i <= 4; i++) {
    ctx.globalAlpha = (fog * i) / 4;
    ctx.fillRect(0, h - (5 - i) * band, span, band);
  }
  ctx.globalAlpha = 1;
  if (l !== 'missing') {
    const lit = document.createElement('canvas');
    lit.width = span;
    lit.height = h;
    const lc = lit.getContext('2d');
    if (lc) {
      both(lc, l, w, h, mirror);
      lc.globalCompositeOperation = 'source-in';
      lc.fillStyle = look.lights;
      lc.fillRect(0, 0, span, h);
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(lit, 0, 0);
    }
  }
  // Below the layer's foot (the camera's lift opens a gap there): the
  // colour of its misty foot, never the dark behind everything.
  const lo = rgb(look[name]);
  const hi = rgb(look.mist);
  const foot = hexOf(lo.map((v, j) => v + (hi[j] - v) * fog));
  const built = { canvas, w: span / S, h: height, foot };
  layers.set(key, built);
  return built;
}

/** Keeps the layers of the stages in play, frees the rest. */
function keep(ids: string[]) {
  for (const key of layers.keys())
    if (!ids.some(id => key.startsWith(`${id}/`)) || !key.endsWith(`@${S}`))
      layers.delete(key);
}

/** A blocky sun or moon with stepped rings of glow, in game px. */
const orbs = new Map<string, HTMLCanvasElement>();
function orbSprite(id: string, orb: NonNullable<Look['orb']>) {
  let c = orbs.get(id);
  if (c) return c;
  const reach = Math.ceil(orb.r * 3.2);
  const size = 2 * reach + 1;
  c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (ctx) {
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const d = Math.hypot(x - reach, y - reach);
        if (d <= orb.r) {
          ctx.fillStyle = orb.colour;
          ctx.globalAlpha = 1;
        } else if (d <= orb.r * 1.6) {
          ctx.fillStyle = orb.glow;
          ctx.globalAlpha = 0.32;
        } else if (d <= orb.r * 2.3) {
          ctx.fillStyle = orb.glow;
          ctx.globalAlpha = 0.18;
        } else if (d <= orb.r * 3.2) {
          ctx.fillStyle = orb.glow;
          ctx.globalAlpha = 0.09;
        } else continue;
        ctx.fillRect(x, y, 1, 1);
      }
  }
  orbs.set(id, c);
  return c;
}

/** The glow behind what can be caught: stepped rings, in game px. */
let glowCanvas: HTMLCanvasElement | null = null;
function glowSprite() {
  if (glowCanvas) return glowCanvas;
  const reach = 11;
  const size = 2 * reach + 1;
  glowCanvas = document.createElement('canvas');
  glowCanvas.width = size;
  glowCanvas.height = size;
  const ctx = glowCanvas.getContext('2d');
  if (ctx)
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const d = Math.hypot(x - reach, y - reach);
        if (d > reach) continue;
        ctx.globalAlpha = d < 5 ? 0.34 : d < 8 ? 0.2 : 0.1;
        ctx.fillStyle = '#ffd27a';
        ctx.fillRect(x, y, 1, 1);
      }
  return glowCanvas;
}

/* ---------------------------------------------------------------- scenery */

/** Easter eggs that are only scenery. */
interface Scenery {
  art: string;
  /** Where in the stage, 0–1. */
  at: number;
  /** Its layer's speed: 1 with the ground, 0.15 with the far sky. */
  factor: number;
  /** Its bottom edge on the screen. */
  bottom: number;
}

const SCENERY: Record<string, Scenery[]> = {
  canyon: [{ art: 'condor', at: 0.5, factor: 0.6, bottom: 84 }],
};

/** What moves in each stage's air, in front of the scenery. */
const AMBIENT: Record<string, Ambient | undefined> = {
  scandinavia: 'motes',
  paris: 'leaves',
  rome: 'stars',
  alps: 'snow',
  atlantic: 'stars',
  newyork: 'plane',
  redwoods: 'fireflies',
  canyon: 'stars',
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

/** One stage's whole backdrop: sky, sun or moon, the sky's own life, the
 *  three layers and the ground. */
function backdrop(
  ctx: CanvasRenderingContext2D,
  id: string,
  dist: number,
  lift: number,
  tick: number,
  calm: boolean
) {
  const look = LOOKS[id];
  if (!look) return;
  const bands = bandsOf(id, look);
  for (let i = 0; i < bands.length; i++) {
    const top = Math.round(BANDS[i] * HORIZON);
    const bottom =
      i === bands.length - 1
        ? GROUND_Y + 2
        : Math.round(BANDS[i + 1] * HORIZON);
    ctx.fillStyle = bands[i];
    ctx.fillRect(0, top, VIEW_W, bottom - top);
  }
  if (look.stars) stars(ctx, look.stars, tick, calm);
  if (look.milkyway) milkyway(ctx);
  if (look.aurora && !calm) aurora(ctx, tick);
  if (look.orb) {
    const o = orbSprite(id, look.orb);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      o,
      look.orb.x - (o.width - 1) / 2,
      look.orb.y - (o.height - 1) / 2
    );
  }
  ctx.imageSmoothingEnabled = true;
  for (const [name, , speed, follow] of LAYERS) {
    const l = layer(id, name);
    if (!l) continue;
    const bottom = snap(GROUND_Y + lift * follow);
    for (let x = -snap(wrap(dist * speed, l.w)); x < VIEW_W; x += l.w)
      ctx.drawImage(l.canvas, x, bottom - l.h, l.w, l.h);
    ctx.fillStyle = l.foot;
    ctx.fillRect(0, bottom - 0.5, VIEW_W, VIEW_H - bottom + 4);
  }
  ctx.imageSmoothingEnabled = false;
  // The ground: the lightest thing in the scene, banded like the sky.
  const top = snap(GROUND_Y + lift);
  for (let i = 0; i < look.ground.length; i++) {
    const y = top + GROUND_BANDS[i];
    const next =
      i + 1 < look.ground.length ? top + GROUND_BANDS[i + 1] : VIEW_H + 4;
    ctx.fillStyle = look.ground[i];
    ctx.fillRect(0, y, VIEW_W, next - y);
  }
}

function stars(
  ctx: CanvasRenderingContext2D,
  count: number,
  tick: number,
  calm: boolean
) {
  ctx.fillStyle = '#fff6e6';
  for (let i = 0; i < count; i++) {
    const x = Math.floor(hash(i + 0.31) * VIEW_W);
    const y = Math.floor(hash(i + 0.77) * HORIZON * 0.7);
    ctx.globalAlpha = calm ? 0.7 : 0.45 + 0.4 * Math.sin(tick / 25 + i * 1.7);
    ctx.fillRect(x, y, 1, 1);
  }
  ctx.globalAlpha = 1;
}

/** The Milky Way over the canyon: a band of faint dots, rising to the right. */
function milkyway(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#d8d0ff';
  for (let i = 0; i < 260; i++) {
    const t = hash(i + 2.1);
    const x = Math.floor(t * VIEW_W);
    const spread = (hash(i + 5.3) - 0.5) * (18 + 14 * hash(i + 9.1));
    const y = Math.floor(78 - t * 64 + spread);
    ctx.globalAlpha = 0.15 + 0.35 * hash(i + 4.4) * (1 - Math.abs(spread) / 32);
    ctx.fillRect(x, y, 1, 1);
  }
  ctx.globalAlpha = 1;
}

/** The northern lights: two slow ribbons, green and violet. */
function aurora(ctx: CanvasRenderingContext2D, tick: number) {
  for (const [base, colour, phase] of [
    [34, '#7dffc4', 0],
    [46, '#c49bff', 2],
  ] as const) {
    ctx.fillStyle = colour;
    for (let x = 0; x < VIEW_W; x += 2) {
      const y = base + Math.sin(x / 41 + tick / 140 + phase) * 7;
      ctx.globalAlpha = 0.16 + 0.1 * Math.sin(x / 23 + tick / 60 + phase);
      ctx.fillRect(x, Math.round(y), 2, 9);
    }
  }
  ctx.globalAlpha = 1;
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
    const x0 = 90 + hash(n) * 360;
    const y0 = 10 + hash(n + 0.5) * 50;
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
    dot(x, 50, 1, 1, '#f4f0ff');
    if (Math.floor(tick / 30) % 2) dot(x - 2, 50, 1, 1, '#ff5a5a');
    return;
  }
  const count = { motes: 18, leaves: 14, snow: 56, fireflies: 24 }[kind];
  for (let i = 0; i < count; i++) {
    const r = hash(i + 1);
    const drift = Math.sin(tick / 40 + i) * 4;
    if (kind === 'snow') {
      const x = wrap(r * 600 - dist * 0.5 + drift, VIEW_W + 20) - 10;
      const y =
        wrap(
          hash(i + 7) * VIEW_H + tick * (0.25 + hash(i + 3) * 0.35),
          VIEW_H + 10
        ) - 10;
      dot(x, y, 1, 1, 'rgba(255, 255, 255, 0.85)');
    } else if (kind === 'leaves') {
      const x =
        wrap(r * 600 - dist * 0.7 - tick * 0.4 + drift * 2, VIEW_W + 20) - 10;
      const y =
        wrap(
          hash(i + 5) * VIEW_H + tick * (0.3 + hash(i + 2) * 0.3),
          GROUND_Y + 10
        ) - 10;
      dot(x, y, 2, 1, i % 2 ? '#e8954a' : '#c9663a');
    } else {
      // Fireflies blink; the golden motes of a northern summer just glow.
      const x = wrap(r * 600 - dist * 0.45 + drift * 1.5, VIEW_W + 20) - 10;
      const y = 80 + hash(i + 9) * 130 + Math.sin(tick / 37 + i * 2) * 5;
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
  dist: number
) {
  const left = dist + PLAYER_X;
  for (const place of places) {
    const stage = STAGES[place.index];
    for (const item of SCENERY[stage.id] ?? []) {
      const s = art.get(`${stage.id}/${item.art}`);
      if (!s) continue;
      const x = place.start + stage.length * item.at;
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
      ctx.fillStyle = LOOKS[t.stage]?.hole ?? '#14121a';
      ctx.fillRect(snap(x), GROUND_Y, t.w, VIEW_H);
      continue;
    }
    const s = art.get(`${t.stage}/${t.art}`);
    const cx = x + t.w / 2;
    const bottom = GROUND_Y - t.y;
    const catchable =
      t.kind === 'pickup' || t.kind === 'acorn' || t.kind === 'egg';
    if (t.hit === null) {
      // What can be caught glows and bobs a little, so the eye finds it.
      const bob = catchable ? Math.sin((g.tick + t.x) / 9) * 1.5 : 0;
      if (catchable) {
        const glow = glowSprite();
        const middle = bottom + bob - (s ? s.h / 2 : t.h / 2);
        ctx.drawImage(
          glow,
          snap(cx - glow.width / 2),
          snap(middle - glow.height / 2)
        );
      }
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
  // Two small bars read as + at this size.
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

/** How far a pose hangs below the squirrel's box (the jump's tail). */
const DROP: Record<string, number> = { jump: 16, fall: 4 };

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
    ctx.fillStyle = '#fff8ee';
    for (const k of [-1, 0, 1]) {
      ctx.globalAlpha = 0.8 * (1 - since / 12);
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
  const count = Math.min(12, Math.floor((g.speed - 3.1) * 24));
  ctx.fillStyle = 'rgba(255, 250, 240, 0.22)';
  for (let i = 0; i < count; i++) {
    const lane = Math.floor(g.tick / 7) + i * 13;
    const y = 27 + hash(lane) * 165;
    const x = VIEW_W - wrap(g.tick * 9 + hash(i + 50) * VIEW_W, VIEW_W + 40);
    ctx.fillRect(snap(x), snap(y), 20, 1);
  }
}

/* ---------------------------------------------------------------- HUD */

/** The score and the hearts keep their old size on screen: drawn in a
 *  320-wide space, scaled up to the 480-wide view. */
const HUD_W = 320;

function digits(ctx: CanvasRenderingContext2D, art: Art, value: number) {
  const text = String(value);
  const s = art.get('common/digits');
  if (!s) {
    ctx.fillStyle = '#fff';
    ctx.font = '8px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(text, HUD_W - 6, 14);
    return;
  }
  let x = HUD_W - 6 - text.length * (s.w + 1);
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
  ctx.lineWidth = 1 / S;
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

/* ---------------------------------------------------------------- frame */

export function draw(
  ctx: CanvasRenderingContext2D,
  g: Game,
  art: Art,
  options: DrawOptions,
  view: View = { dist: g.dist, y: g.y }
) {
  const { dist } = view;
  const calm = options.reducedMotion;
  S = options.scale;
  builtThisFrame = false;
  ctx.setTransform(S, 0, 0, S, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#100a20';
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

  // One stage's world dissolves into the next as the new stage comes in.
  const a = stageAt(dist);
  const b = stageAt(dist + VIEW_W);
  const idA = STAGES[a.index].id;
  const idB = STAGES[b.index].id;
  const next = STAGES[(a.index + 1) % STAGES.length].id;
  keep([idA, next]);
  backdrop(ctx, idA, dist, lift, g.tick, calm);
  if (b.start > a.start) {
    ctx.globalAlpha = 1 - (b.start - dist) / VIEW_W;
    backdrop(ctx, idB, dist, lift, g.tick, calm);
    ctx.globalAlpha = 1;
  } else {
    // Ask for the next stage's layers early: built one a frame, unseen.
    for (const [name] of LAYERS) layer(next, name);
  }

  ctx.save();
  ctx.translate(0, snap(lift));
  const places = b.start > a.start ? [a, b] : [a];
  scenery(ctx, g, art, places, dist);
  if (!calm) {
    ctx.save();
    ctx.translate(0, snap(-lift * 0.3));
    ambient(ctx, AMBIENT[idA], g.tick, dist);
    ctx.restore();
  }
  things(ctx, g, art, dist);
  squirrel(ctx, g, art, view);
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
  ctx.save();
  ctx.scale(VIEW_W / HUD_W, VIEW_W / HUD_W);
  digits(ctx, art, score(g));
  hearts(ctx, g);
  ctx.restore();
}
