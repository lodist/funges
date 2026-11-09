import {
  DOUBLE_JUMP,
  GROUND_Y,
  JUMP,
  LIVES,
  MERCY_TICKS,
  PLAYER,
  PLAYER_X,
  RIDER,
  SLIDER,
  TICKS_PER_SECOND,
  VIEW_H,
  VIEW_W,
  ground,
  multiplier,
  score,
  type Game,
} from './sim';
import { STAGES, stageAt } from './stages';

/*
 * One picture of the game: a smooth silhouette world under a banded 16-bit
 * sky (soft light, our lines), with painted figures in it. Nothing has an
 * outline: the ground the action runs on is the lightest band in the scene,
 * mist rises at the foot of every layer so it is light behind the play, and
 * what can be caught glows.
 *
 * The canvas is as many device pixels as it is shown at; `scale` of them
 * make one game pixel (the game is 480×270). The painted figures (stored at
 * 4x, the squirrel at 6x) and the layers are drawn smoothed, the pixel bits
 * that are left (sun, hearts, digits) nearest neighbour, and everything
 * moves in 1/scale steps.
 *
 * Looks only: the sim never sees this file, so it may use Math.sin.
 */
let S = 3;
const snap = (v: number) => Math.round(v * S) / S;
/** The world height shown at GROUND_Y this frame (see camera()). */
let CAM = 0;
/** The view's width this frame in game px: 480 at 16:9, wider on a wider
 *  screen (up to VIEW_MAX_W). */
let W = VIEW_W;
/** Game px of extra sky over the 270 high view, on a screen narrower than
 *  16:9 (up to 90 at 4:3). */
let TOP = 0;
/** A world height's place on the screen. */
const sy = (height: number) => GROUND_Y - (height - CAM);

/** How big things are drawn against their pictures, small in a big
 *  world (the squirrel about 5% of the screen's height): the
 *  squirrel, traps and rides at three quarters, what is caught at half. */
const SIZE = { squirrel: 0.75, trap: 0.75, item: 0.5 };

/** An image with its frames side by side ("pigeon.2.webp": 2 frames). */
export interface Sprite {
  img: CanvasImageSource;
  frames: number;
  /** One frame's size in game px. */
  w: number;
  h: number;
  /** Image px per game px: 1 for pixel art, 4 for the painted figures
   *  ("moose@4x.webp"), which are drawn smoothed. */
  res: number;
}
/** Every sprite by its path under assets/game, the frame count left off
 *  ("squirrel/body", "scandinavia/moose"). */
export type Art = Map<string, Sprite>;

export interface DrawOptions {
  reducedMotion: boolean;
  /** /play?debug: the hitboxes, for tuning. */
  debug: boolean;
  /** Canvas pixels per game pixel. */
  scale: number;
  /** The view's width and height in game px (see W and TOP). */
  width: number;
  height: number;
}

/** Where to draw from: the game blended between its last two ticks, so a 90
 *  or 120 Hz screen shows the motion between them too. */
export interface View {
  dist: number;
  y: number;
  /** Once the run is over: ms since, while its end plays. */
  ended?: number;
}

const URLS = import.meta.glob<string>('../assets/game/**/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
});
const NAME = /game\/(.+?)(?:@(\d)x)?(?:\.(\d+))?\.webp$/;
/** Landscape masks load per stage, as the run nears it, and the collection's
 *  postcards only there; sprites at once. */
const isMask = (name: string) => /\.(mask|lights)$|\/postcard$/.test(name);

/** A sprite's file and its frame count, for pictures outside the canvas
 *  (the collection): "fjords/reindeer" → its URL, 2. */
export function artUrl(name: string) {
  for (const [path, url] of Object.entries(URLS)) {
    const match = path.match(NAME);
    if (match?.[1] === name) return { url, frames: Number(match[3] ?? 1) };
  }
  return undefined;
}

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
      const res = Number(match[2] ?? 1);
      const frames = Number(match[3] ?? 1);
      art.set(match[1], {
        img,
        frames,
        w: img.naturalWidth / frames / res,
        h: img.naturalHeight / res,
        res,
      });
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
  /** The northern lights, and how bright (1 is Scandinavia's faint glow). */
  aurora?: number;
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
    aurora: 1,
    far: '#b585ad',
    mid: '#8a5689',
    near: '#56305f',
    mist: '#f3b3a4',
    fog: [0.75, 0.6, 0.7],
    lights: '#ffd28a',
    ground: ['#cdd6a8', '#bdc898', '#aebb8b', '#a0ae7f', '#93a174'],
    hole: '#3a2048',
  },
  fjords: {
    wide: true,
    sky: [
      [0, '#0f1d3a'],
      [0.4, '#1f3b66'],
      [0.75, '#3f6a9a'],
      [1, '#8fb4d4'],
    ],
    orb: { x: 120, y: 60, r: 8, colour: '#eef4fa', glow: '#b8d0e8' },
    stars: 40,
    far: '#5f86ae',
    mid: '#3a5d84',
    near: '#1a2f4a',
    mist: '#9fbfdc',
    fog: [0.75, 0.6, 0.65],
    lights: '#ffd27a',
    ground: ['#c9d2da', '#b9c3cd', '#aab5c1', '#9ca8b5', '#8f9caa'],
    hole: '#081428',
  },
  copenhagen: {
    wide: true,
    sky: [
      [0, '#3a2a5a'],
      [0.35, '#8a4a6a'],
      [0.65, '#e08a5a'],
      [0.88, '#f6c27a'],
      [1, '#ffe0a0'],
    ],
    orb: { x: 380, y: 130, r: 12, colour: '#fff0c8', glow: '#ffd890' },
    far: '#c9907e',
    mid: '#9a5e5e',
    near: '#5a3040',
    mist: '#f6c8a0',
    fog: [0.7, 0.55, 0.6],
    lights: '#ffe08a',
    ground: ['#e2d6c8', '#d5c8b8', '#c8baa9', '#bbac9b', '#ae9f8e'],
    hole: '#2a1420',
  },
  highlands: {
    wide: true,
    sky: [
      [0, '#3d4a63'],
      [0.4, '#6f7f96'],
      [0.7, '#b8a9b4'],
      [0.9, '#e8c4b4'],
      [1, '#f6dcc4'],
    ],
    orb: { x: 300, y: 135, r: 10, colour: '#fff4e0', glow: '#f6dcc4' },
    far: '#8d9aa8',
    mid: '#5f7068',
    near: '#2f3e36',
    mist: '#d8d4d0',
    fog: [0.85, 0.75, 0.7],
    lights: '#ffd98a',
    ground: ['#b8c0a0', '#aab292', '#9ca485', '#8f9779', '#838a6e'],
    hole: '#141c18',
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
    ground: ['#ecd9b8', '#e2cca7', '#d8bf98', '#cdb28a', '#c2a67e'],
    hole: '#341a40',
  },
  barcelona: {
    wide: true,
    sky: [
      [0, '#2a1440'],
      [0.3, '#7a2a5a'],
      [0.6, '#e0524a'],
      [0.82, '#f89a4a'],
      [1, '#ffd27a'],
    ],
    orb: { x: 140, y: 132, r: 13, colour: '#fff0c0', glow: '#ffc070' },
    far: '#c86a6a',
    mid: '#8a3a5a',
    near: '#4a1a3a',
    mist: '#f8a88a',
    fog: [0.7, 0.55, 0.6],
    lights: '#ffe08a',
    ground: ['#efcfae', '#e6c09c', '#dcb28c', '#d1a47e', '#c69771'],
    hole: '#2a0e1c',
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
    ground: ['#d8cbbb', '#cbbcab', '#bdad9c', '#b0a08f', '#a39383'],
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
    ground: ['#bccab2', '#adbca3', '#9fae95', '#92a188', '#86947c'],
    hole: '#0e0a22',
  },
  neworleans: {
    wide: true,
    sky: [
      [0, '#1a1236'],
      [0.4, '#3a2a5e'],
      [0.7, '#6a4a7e'],
      [0.9, '#a86a7a'],
      [1, '#d89a7a'],
    ],
    orb: { x: 400, y: 50, r: 9, colour: '#fbf4dc', glow: '#e8d8b0' },
    stars: 30,
    far: '#6a5a8a',
    mid: '#40345e',
    near: '#1c2a22',
    mist: '#9a8aaa',
    fog: [0.7, 0.6, 0.55],
    lights: '#ffc870',
    ground: ['#b4c9a0', '#a5bb92', '#97ad85', '#8a9f79', '#7e926e'],
    hole: '#0c0a14',
  },
  yosemite: {
    wide: true,
    sky: [
      [0, '#2a2a5a'],
      [0.4, '#5a4a8a'],
      [0.7, '#b07aa0'],
      [0.88, '#f0a890'],
      [1, '#ffd0a8'],
    ],
    orb: { x: 90, y: 50, r: 6, colour: '#fff6ea', glow: '#f0d8e0' },
    stars: 20,
    far: '#d8a0a8',
    mid: '#7a5a7a',
    near: '#2e2a3e',
    mist: '#e8b8b0',
    fog: [0.6, 0.55, 0.6],
    lights: '#ffd27a',
    ground: ['#e2d8cc', '#d6cbbe', '#cabeb1', '#beb2a5', '#b2a699'],
    hole: '#140e1c',
  },
  sequoia: {
    heights: { near: 140 },
    wide: true,
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
    ground: ['#d6c1b0', '#c9b1a0', '#bba291', '#ae9484', '#a18777'],
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
    ground: ['#e6b9a0', '#dcaa8f', '#d09b80', '#c48d73', '#b88067'],
    hole: '#100818',
  },
  // Miami Beach at a neon dusk: hot pink over teal-dark, windows in neon.
  miami: {
    sky: [
      [0, '#14143c'],
      [0.35, '#3a1f6e'],
      [0.6, '#b4357f'],
      [0.8, '#ff6f8f'],
      [0.92, '#ffa577'],
      [1, '#ffd19a'],
    ],
    orb: { x: 330, y: 132, r: 13, colour: '#fff1c8', glow: '#ffb38a' },
    stars: 20,
    far: '#7a3f8f',
    mid: '#3c1f63',
    near: '#1a0f33',
    mist: '#ff9fb4',
    fog: [0.7, 0.55, 0.6],
    lights: '#7af0ff',
    ground: ['#f6d6c8', '#efc8bb', '#e6baae', '#dcaca2', '#d29f97'],
    hole: '#1a0a24',
  },
  // Santorini: the sun going down over the caldera.
  santorini: {
    wide: true,
    sky: [
      [0, '#2b2a5e'],
      [0.35, '#5a4a8a'],
      [0.6, '#c06a8a'],
      [0.8, '#f09a78'],
      [0.93, '#ffc98a'],
      [1, '#ffe2a8'],
    ],
    orb: { x: 140, y: 138, r: 12, colour: '#fff0c4', glow: '#ffc98a' },
    far: '#a8749a',
    mid: '#6c4a7c',
    near: '#38264a',
    mist: '#f4b8a8',
    fog: [0.7, 0.55, 0.6],
    lights: '#ffd98a',
    ground: ['#f2e6d6', '#e8d9c6', '#ddcbb6', '#d2bea8', '#c7b19a'],
    hole: '#1c1028',
  },
  // Tallinn on a white midsummer night: a pale sky that never darkens.
  tallinn: {
    wide: true,
    sky: [
      [0, '#2f3d6e'],
      [0.4, '#5e72a8'],
      [0.75, '#a7b4d4'],
      [0.92, '#e6dccb'],
      [1, '#f6e8c8'],
    ],
    orb: { x: 360, y: 60, r: 7, colour: '#f6f2e6', glow: '#c8d0e8' },
    far: '#7c88b4',
    mid: '#4e5888',
    near: '#262c4e',
    mist: '#d8dcea',
    fog: [0.75, 0.6, 0.65],
    lights: '#ffd890',
    ground: ['#cfd2dc', '#c1c5d1', '#b4b8c6', '#a7acbb', '#9aa0b0'],
    hole: '#10142a',
  },
  // The Bialowieza Forest on a misty morning, the sun pale through it.
  bialowieza: {
    sky: [
      [0, '#5a6e66'],
      [0.45, '#8ea296'],
      [0.8, '#c6cfb8'],
      [1, '#e2e2c8'],
    ],
    orb: { x: 300, y: 110, r: 9, colour: '#f8f4dc', glow: '#e2e2c8' },
    far: '#7f958a',
    mid: '#4d6458',
    near: '#22352a',
    mist: '#d6dccb',
    fog: [0.9, 0.8, 0.7],
    lights: '#ffe0a0',
    ground: ['#a9b88a', '#9bab7d', '#8e9e71', '#829166', '#76845b'],
    hole: '#121c14',
  },
  // The Camargue at a pastel pink sunset over the lagoons.
  camargue: {
    wide: true,
    sky: [
      [0, '#4a4f8a'],
      [0.4, '#8a78ac'],
      [0.68, '#d496b0'],
      [0.86, '#f6c0a2'],
      [1, '#ffe2b8'],
    ],
    orb: { x: 320, y: 140, r: 14, colour: '#fff4d6', glow: '#ffd2b0' },
    far: '#a991ad',
    mid: '#71608a',
    near: '#3c3456',
    mist: '#f2c6c0',
    fog: [0.7, 0.55, 0.6],
    lights: '#ffd890',
    ground: ['#f0e6d6', '#e6dac8', '#dbceba', '#d0c2ac', '#c5b69f'],
    hole: '#1a1428',
  },
  // Iceland at night under the northern lights.
  iceland: {
    wide: true,
    sky: [
      [0, '#06101e'],
      [0.45, '#0f2a3c'],
      [0.8, '#1e4a52'],
      [1, '#2f6a66'],
    ],
    orb: { x: 110, y: 50, r: 7, colour: '#eef4fa', glow: '#b8d0e8' },
    stars: 70,
    aurora: 2.2,
    far: '#46707c',
    mid: '#284a5a',
    near: '#10222e',
    mist: '#5f8a88',
    fog: [0.7, 0.6, 0.6],
    lights: '#ffd27a',
    ground: ['#8fa59a', '#82988d', '#768b81', '#6a7f75', '#5f7369'],
    hole: '#040a10',
  },
  // New England on a golden autumn afternoon: the maples ablaze.
  newengland: {
    wide: true,
    sky: [
      [0, '#4a6aa8'],
      [0.45, '#8aa4cc'],
      [0.78, '#e0c8b0'],
      [0.92, '#ffd59a'],
      [1, '#ffe6b0'],
    ],
    orb: { x: 380, y: 120, r: 12, colour: '#fff4d0', glow: '#ffd8a0' },
    far: '#c88a5a',
    mid: '#8f4a32',
    near: '#4a2418',
    mist: '#f2c896',
    fog: [0.65, 0.5, 0.55],
    lights: '#ffe4a0',
    ground: ['#ecc27a', '#e2b46c', '#d7a75f', '#cc9a53', '#c08e48'],
    hole: '#1e0e08',
  },
  // San Francisco in a golden evening fog.
  sanfrancisco: {
    wide: true,
    sky: [
      [0, '#3c4470'],
      [0.4, '#7a6c90'],
      [0.7, '#d0989a'],
      [0.88, '#f2c094'],
      [1, '#ffdcaa'],
    ],
    orb: { x: 150, y: 128, r: 12, colour: '#fff0cc', glow: '#ffcf9a' },
    far: '#b08488',
    mid: '#6c4c64',
    near: '#38283c',
    mist: '#f0cdb4',
    fog: [0.9, 0.75, 0.65],
    lights: '#ffd890',
    ground: ['#e9d6c2', '#dfcab4', '#d4bea7', '#c9b29a', '#bea68e'],
    hole: '#1a1020',
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
/** The mist at a layer's foot fades in over this many game px. */
const MIST = 85;
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
  // Mist rising at the foot in one smooth fade: the 16-bit lines are only
  // in the sky and the ground.
  ctx.globalCompositeOperation = 'source-atop';
  const fog = fogOf(look, name);
  const rise = Math.round(MIST * S);
  const [mr, mg, mb] = rgb(look.mist);
  const mist = ctx.createLinearGradient(0, h - rise, 0, h);
  mist.addColorStop(0, `rgba(${mr}, ${mg}, ${mb}, 0)`);
  mist.addColorStop(1, `rgba(${mr}, ${mg}, ${mb}, ${fog})`);
  ctx.fillStyle = mist;
  ctx.fillRect(0, h - rise, span, rise);
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
  fjords: 'stars',
  copenhagen: 'leaves',
  highlands: 'motes',
  barcelona: 'motes',
  neworleans: 'fireflies',
  yosemite: 'stars',
  paris: 'leaves',
  rome: 'stars',
  alps: 'snow',
  newyork: 'plane',
  sequoia: 'fireflies',
  canyon: 'stars',
  miami: 'plane',
  santorini: 'motes',
  tallinn: 'motes',
  bialowieza: 'leaves',
  camargue: 'motes',
  iceland: 'stars',
  newengland: 'leaves',
  sanfrancisco: 'motes',
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
  ctx.imageSmoothingEnabled = s.res > 1;
  ctx.drawImage(
    s.img,
    f * s.w * s.res,
    0,
    s.w * s.res,
    s.h * s.res,
    snap(cx - s.w / 2),
    snap(bottom - s.h),
    s.w,
    s.h
  );
  ctx.imageSmoothingEnabled = false;
}

/** Frame `frame` of a sprite standing on the land at (cx, bottom): turned
 *  with the slope about its foot, drawn at k of its size. */
function stand(
  ctx: CanvasRenderingContext2D,
  s: Sprite,
  frame: number,
  cx: number,
  bottom: number,
  turn: number,
  k: number,
  spin = 0
) {
  ctx.save();
  ctx.imageSmoothingEnabled = s.res > 1;
  ctx.translate(cx, bottom);
  ctx.rotate((turn * Math.PI) / 180);
  ctx.scale(k, k);
  if (spin) {
    // Rolling: turned about its own middle.
    ctx.translate(0, -s.h / 2);
    ctx.rotate((spin * Math.PI) / 180);
    ctx.translate(0, s.h / 2);
  }
  ctx.drawImage(
    s.img,
    (frame % s.frames) * s.w * s.res,
    0,
    s.w * s.res,
    s.h * s.res,
    -s.w / 2,
    -s.h,
    s.w,
    s.h
  );
  ctx.restore();
}

/** What rolls at the squirrel turns as it comes. */
const ROLLING = new Set(['snowball', 'tumbleweed', 'football']);

/** A slope's angle in degrees, clockwise (uphill is negative). */
const angleOf = (slope: number) => (-Math.atan(slope) * 180) / Math.PI;

/** A stage's sky: its bands, the sky's own life, the sun or moon. */
function sky(
  ctx: CanvasRenderingContext2D,
  id: string,
  tick: number,
  calm: boolean
) {
  const look = LOOKS[id];
  if (!look) return;
  const bands = bandsOf(id, look);
  for (let i = 0; i < bands.length; i++) {
    const top = i ? Math.round(BANDS[i] * HORIZON) : -TOP;
    const bottom =
      i === bands.length - 1 ? VIEW_H : Math.round(BANDS[i + 1] * HORIZON);
    ctx.fillStyle = bands[i];
    ctx.fillRect(0, top, W, bottom - top);
  }
  if (look.stars) stars(ctx, look.stars, tick, calm);
  if (look.milkyway) milkyway(ctx);
  if (look.aurora && !calm) aurora(ctx, tick, look.aurora);
  if (look.orb) {
    const o = orbSprite(id, look.orb);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      o,
      look.orb.x - (o.width - 1) / 2,
      look.orb.y - (o.height - 1) / 2
    );
  }
}

/** One of a stage's landscape layers, with its misty foot below it. */
function land(
  ctx: CanvasRenderingContext2D,
  id: string,
  [name, , speed, follow]: (typeof LAYERS)[number],
  dist: number
) {
  const l = layer(id, name);
  if (!l) return;
  ctx.imageSmoothingEnabled = true;
  const bottom = snap(GROUND_Y + CAM * follow * 0.45);
  for (let x = -snap(wrap(dist * speed, l.w)); x < W; x += l.w)
    ctx.drawImage(l.canvas, x, bottom - l.h, l.w, l.h);
  ctx.fillStyle = l.foot;
  ctx.fillRect(0, bottom - 0.5, W, VIEW_H - bottom + 4);
  ctx.imageSmoothingEnabled = false;
}

/** The land's top across the screen: its screen y every 4 game px. */
function surface(g: Game, dist: number) {
  const top: number[] = [];
  for (let x = 0; x <= W + 4; x += 4) top.push(sy(ground(g.land, dist + x)[0]));
  return top;
}

/** The ground: the lightest thing in the scene, banded like the sky, the
 *  bands following the slopes. */
function soil(ctx: CanvasRenderingContext2D, id: string, top: number[]) {
  const look = LOOKS[id];
  if (!look) return;
  for (let i = 0; i < look.ground.length; i++) {
    ctx.fillStyle = look.ground[i];
    ctx.beginPath();
    ctx.moveTo(0, VIEW_H + 4);
    top.forEach((y, k) => ctx.lineTo(k * 4, y + GROUND_BANDS[i]));
    ctx.lineTo(W + 4, VIEW_H + 4);
    ctx.closePath();
    ctx.fill();
  }
}

/** The camera keeps the land under and ahead of the squirrel at GROUND_Y,
 *  and rises with a high jump: going downhill it shows the slope below. */
function camera(g: Game, dist: number, y: number) {
  const x = dist + PLAYER_X + PLAYER.w / 2;
  const here = ground(g.land, x)[0];
  const ahead = (ground(g.land, x + 120)[0] + ground(g.land, x + 260)[0]) / 2;
  return here * 0.55 + ahead * 0.45 + Math.max(0, y - here - 30) * 0.6;
}

/** World px over which one stage turns into the next. */
const CHANGE = 2 * VIEW_W;

/** One stage's world turning into the next: the sky blends across, and each
 *  layer, the far one first, melts away before the next stage's melts in,
 *  so two landscapes never show through each other. */
function backdrop(
  ctx: CanvasRenderingContext2D,
  a: string,
  b: string,
  p: number,
  dist: number,
  top: number[],
  tick: number,
  calm: boolean
) {
  sky(ctx, a, tick, calm);
  if (p > 0) {
    ctx.globalAlpha = ease(p);
    sky(ctx, b, tick, calm);
  }
  LAYERS.forEach((l, i) => {
    const q = clamp01((p - 0.2 * i) / 0.5);
    if (q < 0.5) {
      ctx.globalAlpha = ease(1 - 2 * q);
      land(ctx, a, l, dist);
    } else {
      ctx.globalAlpha = ease(2 * q - 1);
      land(ctx, b, l, dist);
    }
  });
  ctx.globalAlpha = 1;
  soil(ctx, a, top);
  if (p > 0.5) {
    ctx.globalAlpha = ease((p - 0.5) / 0.5);
    soil(ctx, b, top);
    ctx.globalAlpha = 1;
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
    const x = Math.floor(hash(i + 0.31) * W);
    const y = Math.floor(hash(i + 0.77) * (HORIZON * 0.7 + TOP)) - TOP;
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
    const x = Math.floor(t * W);
    const spread = (hash(i + 5.3) - 0.5) * (18 + 14 * hash(i + 9.1));
    const y = Math.floor(78 - t * 64 + spread);
    ctx.globalAlpha = 0.15 + 0.35 * hash(i + 4.4) * (1 - Math.abs(spread) / 32);
    ctx.fillRect(x, y, 1, 1);
  }
  ctx.globalAlpha = 1;
}

/** The northern lights: two slow ribbons, green and violet. */
function aurora(ctx: CanvasRenderingContext2D, tick: number, bright: number) {
  for (const [base, colour, phase] of [
    [34, '#7dffc4', 0],
    [46, '#c49bff', 2],
  ] as const) {
    ctx.fillStyle = colour;
    for (let x = 0; x < W; x += 2) {
      const y = base + Math.sin(x / 41 + tick / 140 + phase) * 7;
      ctx.globalAlpha =
        bright * (0.16 + 0.1 * Math.sin(x / 23 + tick / 60 + phase));
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
    const x = wrap(tick * 0.18, W + 60) - 30;
    dot(x, 50, 1, 1, '#f4f0ff');
    if (Math.floor(tick / 30) % 2) dot(x - 2, 50, 1, 1, '#ff5a5a');
    return;
  }
  const count = { motes: 18, leaves: 14, snow: 56, fireflies: 24 }[kind];
  for (let i = 0; i < count; i++) {
    const r = hash(i + 1);
    const drift = Math.sin(tick / 40 + i) * 4;
    if (kind === 'snow') {
      const x = wrap(r * 600 - dist * 0.5 + drift, W + 20) - 10;
      const y =
        wrap(
          hash(i + 7) * VIEW_H + tick * (0.25 + hash(i + 3) * 0.35),
          VIEW_H + TOP + 10
        ) -
        10 -
        TOP;
      dot(x, y, 1, 1, 'rgba(255, 255, 255, 0.85)');
    } else if (kind === 'leaves') {
      const x =
        wrap(r * 600 - dist * 0.7 - tick * 0.4 + drift * 2, W + 20) - 10;
      const y =
        wrap(
          hash(i + 5) * VIEW_H + tick * (0.3 + hash(i + 2) * 0.3),
          GROUND_Y + TOP + 10
        ) -
        10 -
        TOP;
      dot(x, y, 2, 1, i % 2 ? '#e8954a' : '#c9663a');
    } else {
      // Fireflies blink; the golden motes of a northern summer just glow.
      const x = wrap(r * 600 - dist * 0.45 + drift * 1.5, W + 20) - 10;
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
  for (const t of g.things) {
    const x = t.x - dist;
    if (x > W || x + t.w + 32 < 0) continue;
    if (t.kind === 'gap') {
      ctx.fillStyle = LOOKS[t.stage]?.hole ?? '#14121a';
      ctx.beginPath();
      ctx.moveTo(x, sy(ground(g.land, t.x)[0]));
      ctx.lineTo(x + t.w, sy(ground(g.land, t.x + t.w)[0]));
      ctx.lineTo(x + t.w, VIEW_H + 4);
      ctx.lineTo(x, VIEW_H + 4);
      ctx.closePath();
      ctx.fill();
      continue;
    }
    const s = art.get(`${t.stage}/${t.art}`);
    const cx = x + t.w / 2;
    const bottom = sy(t.y);
    const catchable =
      t.kind === 'pickup' || t.kind === 'acorn' || t.kind === 'egg';
    const k = catchable || t.kind === 'agaric' ? SIZE.item : SIZE.trap;
    // What stands on the land leans with it.
    const turn = t.rel < 4 ? angleOf(ground(g.land, t.x + t.w / 2)[1]) : 0;
    if (t.hit === null) {
      // What can be caught glows and bobs a little, so the eye finds it.
      const bob = catchable ? Math.sin((g.tick + t.x) / 9) * 1.5 : 0;
      if (catchable) {
        const glow = glowSprite();
        const middle = bottom + bob - (s ? (k * s.h) / 2 : t.h / 2);
        ctx.drawImage(
          glow,
          snap(cx - (k * glow.width) / 2),
          snap(middle - (k * glow.height) / 2),
          k * glow.width,
          k * glow.height
        );
      }
      // Rolling left, turning anticlockwise: its turn follows the ground.
      const spin =
        s && ROLLING.has(t.art) ? (t.x * 360) / (Math.PI * k * s.h) : 0;
      if (s)
        stand(ctx, s, Math.floor(g.tick / 8), cx, bottom + bob, turn, k, spin);
      else {
        ctx.fillStyle = '#5b4636';
        ctx.fillRect(snap(x), bottom - t.h, t.w, t.h);
      }
      continue;
    }
    const age = g.tick - t.hit;
    if (catchable) {
      sparkle(ctx, cx, bottom - t.h / 2, age);
      // An egg that was a life back sends a heart up; the rest, points.
      if (t.kind === 'egg' && !t.points) {
        if (age < 30) {
          ctx.globalAlpha = age < 20 ? 1 : 1 - (age - 20) / 10;
          heart(ctx, cx - 3.5, bottom - t.h - 8 - age * 0.5, '#ff4d6d');
          ctx.globalAlpha = 1;
        }
      } else if (t.points)
        points(ctx, t.points, cx, bottom - t.h - age * 0.5, age);
      continue;
    }
    // Smashed things fly off for a moment; animals leap aside.
    if (!s || age > 40) continue;
    if (t.animal)
      stand(ctx, s, 0, cx + age * 2, bottom - age * 3 + age * age * 0.12, 0, k);
    else {
      ctx.save();
      ctx.translate(cx, bottom);
      ctx.scale(k, k);
      ctx.translate(-cx, -bottom);
      burst(ctx, s, cx, bottom, age);
      ctx.restore();
    }
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
  value: number,
  cx: number,
  y: number,
  age: number
) {
  if (age > 30) return;
  ctx.globalAlpha = age < 20 ? 1 : 1 - (age - 20) / 10;
  label(ctx, `+${value}`, cx, y - 8, 7, 'center');
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
  ctx.imageSmoothingEnabled = s.res > 1;
  for (let q = 0; q < 4; q++) {
    const sx = (q % 2) * hw;
    const sy = Math.floor(q / 2) * hh;
    const dx = (q % 2 ? 1 : -1) * age * 1.5;
    const dy = -age * (q < 2 ? 2.5 : 1.5) + age * age * 0.15;
    ctx.drawImage(
      s.img,
      sx * s.res,
      sy * s.res,
      hw * s.res,
      hh * s.res,
      snap(cx - hw + sx + dx),
      snap(bottom - s.h + sy + dy),
      hw,
      hh
    );
  }
  ctx.imageSmoothingEnabled = false;
}

/* ---------------------------------------------------------------- squirrel */

/*
 * The squirrel is drawn frames: a six-frame gallop (squirrel/run) and its
 * poses (jump, fall, ball, sit, slide), each with its nose at the right edge
 * of its picture and its feet at the bottom. Between them it moves by
 * tilting, squashing and spinning the whole picture, never by cutting it up.
 */
/** The nose, game px from the hitbox's left edge. */
const NOSE = PLAYER.w + 4;
/** World px per run frame: the feet keep pace with the ground. */
const STEP = 12;
/** The world gliding to a stop after the last knock, ms. */
const GLIDE = 320;

const ease = (x: number) => x * x * (3 - 2 * x);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

let tintCanvas: HTMLCanvasElement | null = null;

/** A frame turned green: sick from the fly agaric. */
function tinted(s: Sprite, frame: number): Sprite {
  const w = s.w * s.res;
  const h = s.h * s.res;
  tintCanvas ??= document.createElement('canvas');
  tintCanvas.width = w;
  tintCanvas.height = h;
  const c = tintCanvas.getContext('2d');
  if (!c) return s;
  c.drawImage(s.img, (frame % s.frames) * w, 0, w, h, 0, 0, w, h);
  c.globalCompositeOperation = 'source-atop';
  c.fillStyle = 'rgba(90, 190, 60, 0.6)';
  c.fillRect(0, 0, w, h);
  return { ...s, img: tintCanvas, frames: 1 };
}

/** A frame with its nose at x and its feet at bottom, turned (degrees,
 *  clockwise) about its middle and squashed (sx, sy) onto its feet. */
function figure(
  ctx: CanvasRenderingContext2D,
  s: Sprite,
  frame: number,
  x: number,
  bottom: number,
  turn = 0,
  sx = 1,
  sy = 1
) {
  const k = SIZE.squirrel;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.translate(x - (k * s.w) / 2, bottom);
  ctx.scale(sx * k, sy * k);
  ctx.translate(0, -s.h / 2);
  ctx.rotate((turn * Math.PI) / 180);
  ctx.drawImage(
    s.img,
    (frame % s.frames) * s.w * s.res,
    0,
    s.w * s.res,
    s.h * s.res,
    -s.w / 2,
    -s.h / 2,
    s.w,
    s.h
  );
  ctx.restore();
}

/** Puffs of dust kicked up behind something sliding at x, on the land
 *  at screen height floor. */
function dust(
  ctx: CanvasRenderingContext2D,
  x: number,
  floor: number,
  tick: number
) {
  ctx.fillStyle = '#fff8ee';
  for (let i = 0; i < 4; i++) {
    const age = (tick + i * 5) % 20;
    const r = 0.8 + age * 0.12;
    ctx.globalAlpha = 0.7 * (1 - age / 20);
    ctx.fillRect(x - age * 1.4 - r, floor - 1 - age * 0.3 - r, 2 * r, 2 * r);
  }
  ctx.globalAlpha = 1;
}

/** The run ended in a hole. */
const fell = (g: Game) => g.falling;

/** After the last knock the world glides on and stops under the sliding
 *  squirrel; after a fall into a hole it stops at once. */
function glide(g: Game, view: View) {
  if (!g.over || fell(g)) return 0;
  const t = view.ended ?? Infinity;
  return (
    ((g.speed * TICKS_PER_SECOND) / 1000) * GLIDE * (1 - Math.exp(-t / GLIDE))
  );
}

/** The run's end: tripped over what hit it, a dive onto its belly and a
 *  slide to a stop. Fallen into a hole, it drops out of sight. */
function ending(
  ctx: CanvasRenderingContext2D,
  g: Game,
  art: Art,
  view: View,
  bottom: number
) {
  const t = view.ended ?? Infinity;
  if (fell(g)) {
    const fall = art.get('squirrel/fall');
    const drop = Math.min(t, 600) ** 2 * 0.0004;
    if (fall) figure(ctx, fall, 0, PLAYER_X + NOSE, bottom + drop, 20);
    return;
  }
  const slide = art.get('squirrel/slide');
  if (!slide) return;
  const x = PLAYER_X + NOSE + 6;
  // The land under it as the world glides on.
  const under = view.dist + glide(g, view) + PLAYER_X + PLAYER.w / 2;
  const [height, slope] = ground(g.land, under);
  const floor = sy(height);
  const tilt = (-Math.atan(slope) * 180) / Math.PI;
  const trip = 260;
  if (t < trip) {
    // Over it, nose first.
    const k = t / trip;
    const air = Math.min(bottom, floor) - 16 * Math.sin(Math.PI * k);
    figure(ctx, slide, 0, x, air, 40 * k - 15 + tilt);
    return;
  }
  const sliding = Math.exp(-(t - trip) / GLIDE);
  if (sliding > 0.15) dust(ctx, x - 12, floor, Math.floor(t / 16));
  figure(ctx, slide, 0, x, floor, tilt + 25 * clamp01(1 - (t - trip) / 90));
}

/** Where the squirrel sits on each ride: across from the ride's left edge,
 *  and the seat's height above its bottom, game px. */
/** A ride, with the squirrel painted into it: a little bounce on the road
 *  (a slow roll on the water), tilted with the slope. */
function ride(
  ctx: CanvasRenderingContext2D,
  g: Game,
  vehicle: Sprite,
  view: View,
  bottom: number
) {
  const k = SIZE.squirrel;
  const bob = Math.sin(g.tick / 4) * 0.5;
  const left = PLAYER_X + RIDER.w / 2 - (k * vehicle.w) / 2;
  const tilt = g.grounded
    ? angleOf(ground(g.land, view.dist + PLAYER_X + RIDER.w / 2)[1])
    : -8 * clamp01(g.vy / JUMP);
  figure(
    ctx,
    vehicle,
    Math.floor(view.dist / 14),
    left + k * vehicle.w,
    bottom + bob,
    tilt
  );
}

function squirrel(
  ctx: CanvasRenderingContext2D,
  g: Game,
  art: Art,
  view: View
) {
  const bottom = sy(view.y);
  const [, slope] = ground(g.land, view.dist + PLAYER_X + PLAYER.w / 2);
  const tilt = angleOf(slope);
  const floor = sy(ground(g.land, view.dist + PLAYER_X + 7)[0]);
  if (g.over) {
    ending(ctx, g, art, view, bottom);
    return;
  }
  // Dust where it touched down, whatever it is riding.
  const since = g.tick - g.landedAt;
  if (g.grounded && since < 12) {
    ctx.fillStyle = '#fff8ee';
    for (const k of [-1, 0, 1]) {
      ctx.globalAlpha = 0.8 * (1 - since / 12);
      const r = 1 + since * 0.15;
      ctx.fillRect(
        snap(PLAYER_X + 7 + k * (4 + since * 0.8) - r),
        snap(floor - 1 - since * 0.25 - r),
        2 * r,
        2 * r
      );
    }
    ctx.globalAlpha = 1;
  }
  // Knocked: it blinks while it passes through things.
  if (g.tick < g.mercyUntil && Math.floor(g.tick / 4) % 2) return;
  const vehicle = g.ride && art.get(`${g.ride.stage}/${g.ride.art}`);
  if (g.ride && vehicle) {
    // The last two seconds blink, as the ride wears off.
    const fading = g.ride.until - g.tick < 2 * TICKS_PER_SECOND;
    if (!fading || Math.floor(g.tick / 4) % 2) {
      ride(ctx, g, vehicle, view, bottom);
      return;
    }
  }
  const x = PLAYER_X + NOSE;
  let name = 'run';
  let frame = 0;
  let turn = 0;
  let sx = 1;
  let squash = 1;
  let nose = x;
  const downhill = slope < -0.12;
  if (g.grounded && g.tick < g.slideUntil) {
    // Flat on its belly, on its leaf going downhill.
    name = downhill ? 'leaflat' : 'slide';
    nose = x + 6;
    turn = tilt;
    dust(ctx, nose - 12, floor, g.tick);
  } else if (g.grounded && downhill) {
    // Downhill it sits on a leaf and sleds.
    name = 'leaf';
    nose = x + 4;
    turn = tilt + Math.sin(g.tick / 5) * 1.5;
  } else if (g.grounded) {
    frame = Math.floor(view.dist / STEP);
    // It runs fairly level, leaning only half into the slope.
    turn = tilt / 2;
    // Landing squashes it for a moment.
    if (since < 8) {
      const k = 1 - since / 8;
      sx = 1 + 0.1 * k;
      squash = 1 - 0.14 * k;
    }
  } else if (g.diving) {
    // Head first towards the ground, to slide.
    name = 'slide';
    nose = x + 6;
    turn = 22;
  } else if (g.vy > 0 && g.doubleUsed) {
    // The second jump: a forward roll, curled up.
    name = 'ball';
    turn = 360 * clamp01(1 - g.vy / DOUBLE_JUMP);
    nose = x - 2;
  } else if (g.vy > 0) {
    name = 'jump';
    turn = -12 * clamp01(g.vy / JUMP);
  } else {
    name = 'fall';
    turn = 14 * clamp01(-g.vy / JUMP);
  }
  const s = art.get(`squirrel/${name}`);
  if (!s) {
    ctx.fillStyle = '#c4622d';
    ctx.fillRect(PLAYER_X, snap(bottom - PLAYER.h), PLAYER.w, PLAYER.h);
    return;
  }
  const sick = g.tick < g.sickUntil;
  figure(
    ctx,
    sick ? tinted(s, frame) : s,
    sick ? 0 : frame,
    nose,
    bottom,
    turn,
    sx,
    squash
  );
}

/** The combo's multiplier, ×2 and up, under the score while it holds. */
function combo(ctx: CanvasRenderingContext2D, g: Game) {
  const times = multiplier(g);
  if (times >= 2) label(ctx, `×${times}`, HUD_R - 26, 17, 9);
}

/** Sick from the fly agaric: in bursts, the picture breaks up like a
 *  stream that stalls. Small, but in the way. */
function glitch(ctx: CanvasRenderingContext2D, tick: number) {
  if (hash(Math.floor(tick / 6) + 0.5) > 0.45) return;
  const c = ctx.canvas;
  const W = c.width;
  const H = c.height;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  // Torn bands, slid sideways.
  const bands = 2 + Math.floor(hash(tick * 3.1) * 3);
  for (let i = 0; i < bands; i++) {
    const y = Math.floor(hash(tick * 7.3 + i) * H);
    const h = Math.max(
      2,
      Math.floor(H * (0.01 + hash(tick * 1.7 + i * 5) * 0.05))
    );
    const dx = Math.round((hash(tick * 2.9 + i * 11) - 0.5) * W * 0.08);
    ctx.drawImage(c, 0, y, W, h, dx, y, W, h);
  }
  // A blocky smear, like a lost frame's blocks.
  const bw = Math.floor(W * (0.06 + hash(tick * 4.1) * 0.1));
  const bh = Math.floor(H * (0.06 + hash(tick * 5.7) * 0.1));
  const bx = Math.floor(hash(tick * 6.3) * (W - bw));
  const by = Math.floor(hash(tick * 8.9) * (H - bh));
  ctx.drawImage(c, bx, by, bw, bh, bx, by, 6, 6);
  ctx.drawImage(c, bx, by, 6, 6, bx, by, bw, bh);
  // The picture doubled, a little off.
  ctx.globalAlpha = 0.22;
  ctx.drawImage(c, Math.round(W * 0.006), 0);
  ctx.restore();
}

/** Streaks rushing past when the run is fast. */
function speedLines(ctx: CanvasRenderingContext2D, g: Game) {
  const count = Math.min(12, Math.floor((g.speed - 5.2) * 10));
  ctx.fillStyle = 'rgba(255, 250, 240, 0.22)';
  for (let i = 0; i < count; i++) {
    const lane = Math.floor(g.tick / 7) + i * 13;
    const y = 27 + hash(lane) * 165;
    const x = W - wrap(g.tick * 9 + hash(i + 50) * W, W + 40);
    ctx.fillRect(snap(x), snap(y), 20, 1);
  }
}

/* ---------------------------------------------------------------- HUD */

/** The score and the hearts keep their old size on screen: drawn in a
 *  320-wide space, scaled up to the 480-wide view. */
const HUD_W = 320;
/** The view's right edge in that space: wider views put the score further. */
let HUD_R = HUD_W;

/** The game's words and numbers in Funges' display face (Space Grotesk,
 *  loaded with the app), light, with a soft shadow to read on any sky. */
function label(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  align: CanvasTextAlign = 'right'
) {
  ctx.save();
  ctx.font = `700 ${size}px 'Space Grotesk', sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  // The blur is in canvas pixels, which the transform does not scale.
  ctx.shadowColor = 'rgba(20, 10, 36, 0.55)';
  ctx.shadowBlur = size * S * 0.35;
  ctx.shadowOffsetY = size * S * 0.06;
  ctx.fillStyle = '#fff8ec';
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** The score, left of the pause button in the corner. */
const digits = (ctx: CanvasRenderingContext2D, value: number) =>
  label(ctx, String(value), HUD_R - 26, 5, 11);

// A heart, 7×6: the lives, top left. UI like the digits, not scenery.
const HEART = [
  '.XX.XX.',
  'XXXXXXX',
  'XXXXXXX',
  '.XXXXX.',
  '..XXX..',
  '...X...',
];

/** One heart: a dark outline (the heart drawn 1 px off each way), then the fill. */
function heart(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  fill: string
) {
  for (const [dx, dy, colour] of [
    [-1, 0, '#2a1020'],
    [1, 0, '#2a1020'],
    [0, -1, '#2a1020'],
    [0, 1, '#2a1020'],
    [0, 0, fill],
  ] as const) {
    ctx.fillStyle = colour;
    HEART.forEach((row, y) => {
      for (let x = 0; x < row.length; x++)
        if (row[x] === 'X') ctx.fillRect(left + x + dx, top + y + dy, 1, 1);
    });
  }
}

function hearts(ctx: CanvasRenderingContext2D, g: Game) {
  for (let i = 0; i < LIVES; i++)
    heart(ctx, 6 + i * 10, 6, i < g.lives ? '#ff4d6d' : '#5a3048');
}

function hitboxes(ctx: CanvasRenderingContext2D, g: Game, view: View) {
  const box = g.ride ? RIDER : g.tick < g.slideUntil ? SLIDER : PLAYER;
  ctx.lineWidth = 1 / S;
  ctx.strokeStyle = '#ff0';
  ctx.strokeRect(PLAYER_X, sy(view.y) - box.h, box.w, box.h);
  ctx.strokeStyle = '#f0f';
  for (const t of g.things)
    if (t.hit === null)
      ctx.strokeRect(t.x - view.dist, sy(t.y) - t.h, t.w, Math.max(t.h, 1));
}

/* ---------------------------------------------------------------- frame */

export function draw(
  ctx: CanvasRenderingContext2D,
  g: Game,
  art: Art,
  options: DrawOptions,
  view: View = { dist: g.dist, y: g.y }
) {
  const calm = options.reducedMotion;
  // Sick, the picture stalls now and then: the last one stays up.
  if (!calm && g.tick < g.sickUntil && hash(Math.floor(g.tick / 4)) < 0.1)
    return;
  const dist = view.dist + glide(g, view);
  S = options.scale;
  W = options.width;
  TOP = options.height - VIEW_H;
  HUD_R = (W * HUD_W) / VIEW_W;
  builtThisFrame = false;
  // The game's 270 high view at the bottom, any extra sky over it.
  ctx.setTransform(S, 0, 0, S, 0, TOP * S);
  ctx.imageSmoothingEnabled = false;
  // For the painted figures, shrunk from 4x: smoothing is turned on per draw.
  ctx.imageSmoothingQuality = 'high';
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#100a20';
  ctx.fillRect(0, -TOP, W, VIEW_H + TOP);

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
  if (sick && !calm)
    ctx.translate(Math.sin(g.tick / 5) * 3, (hash(g.tick * 1.3) - 0.5) * 2.5);

  CAM = camera(g, dist, view.y);
  const top = surface(g, dist);

  // The next stage comes in over two screens.
  const a = stageAt(dist, g.route);
  const b = stageAt(dist + CHANGE, g.route);
  const idA = STAGES[a.index].id;
  const idB = STAGES[b.index].id;
  const next = STAGES[g.route[(a.leg + 1) % g.route.length]].id;
  keep([idA, next]);
  const p = b.start > a.start ? 1 - (b.start - dist) / CHANGE : 0;
  backdrop(ctx, idA, idB, p, dist, top, g.tick, calm);
  // Ask for the next stage's layers early: built one a frame, unseen.
  if (!p) for (const [name] of LAYERS) layer(next, name);

  const places = b.start > a.start ? [a, b] : [a];
  scenery(ctx, g, art, places, dist);
  if (!calm) ambient(ctx, AMBIENT[p < 0.5 ? idA : idB], g.tick, dist);
  things(ctx, g, art, dist);
  squirrel(ctx, g, art, view);
  if (options.debug) hitboxes(ctx, g, view);
  ctx.restore();

  if (sick && calm) {
    ctx.fillStyle = 'rgba(90, 190, 60, 0.18)';
    ctx.fillRect(0, -TOP, W, VIEW_H + TOP);
  }
  // A knock flashes red.
  const sinceKnock = g.tick - knocked;
  if (sinceKnock < 12) {
    ctx.fillStyle = `rgba(255, 40, 70, ${0.3 * (1 - sinceKnock / 12)})`;
    ctx.fillRect(0, -TOP, W, VIEW_H + TOP);
  }
  if (!calm && g.speed > 5.2) speedLines(ctx, g);
  if (sick && !calm) glitch(ctx, g.tick);
  // The score and the hearts at the top of the screen.
  ctx.setTransform(S, 0, 0, S, 0, 0);
  ctx.save();
  ctx.scale(VIEW_W / HUD_W, VIEW_W / HUD_W);
  digits(ctx, score(g));
  combo(ctx, g);
  hearts(ctx, g);
  ctx.restore();
}
