import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BED_HEIGHT,
  fit,
  regions,
  type Garden,
  type Rect,
  type Section,
} from '@/lib/planner';
import { huertaImage } from '@/lib/huerta';
import {
  Maximize2,
  RotateCcw,
  RotateCw,
  X,
  ZoomIn,
  ZoomOut,
} from '@/lib/icons';
import { cn } from '@/lib/utils';
import { PLANT_LOOK } from '@/lib/planner-data';

/**
 * The garden drawn as an architect's model (axonometric, turned a quarter at
 * a time): raised beds, and every plant at its real spacing. A planned crop
 * is drawn pale and grown; a planted one solid, at the stage it has reached.
 * Colours are the model's own: it reads the same in either theme.
 */
const COS = Math.cos(Math.PI / 6);
const SIN = 0.5;
const S = 64; // pixels per metre
const MAX_GLYPHS = 180;
/** Plants drawn in the whole model at most: a big plot is thinned evenly. */
const MAX_DRAWN = 1500;
/** The narrowest view, in model units (64 a metre). */
const MIN_VIEW = 560;
const MAX_ZOOM = 4;
const ZOOM_STEP = 1.5;
/** How far off a bed (metres, on the ground) a tap still picks it. */
const REACH = 0.6;
const PLOT = '#ece5db';
const SOIL = '#6c5544';
const TIMBER = ['#e5d5bb', '#cfba98', '#eadcc5'];
const MARK = '#c9603a';
const GROUND = (name: string) => huertaImage(`ground/${name}`);
/** Crops photographed at each stage, on a frame of this many metres of real
 *  height, the plant's foot at the middle, 8% above the bottom:
 *  huerta/iso/<id>-seedling, -young, and three grown plants -1, -2, -3. */
const STAGED: Record<string, number> = {
  artichoke: 2.0,
  asparagus: 1.5,
  aubergine: 1.0,
  basil: 0.5,
  beetroot: 0.5,
  broad_beans: 1.5,
  broccoli: 1.0,
  brussels_sprouts: 1.5,
  cabbage: 1.0,
  calendula: 0.75,
  carrot: 0.5,
  cauliflower: 1.0,
  celery: 1.0,
  chard: 1.0,
  chervil: 0.5,
  chicory: 0.75,
  chilli: 1.0,
  chives: 0.5,
  coriander: 0.75,
  cosmos: 1.5,
  courgette: 1.5,
  crimson_clover: 0.75,
  crocus: 0.5,
  cucumber: 2.0,
  daffodil: 0.75,
  dill: 1.0,
  fennel: 1.0,
  field_beans: 1.0,
  garlic: 0.75,
  green_beans: 0.75,
  kale: 1.0,
  kohlrabi: 0.75,
  lambs_lettuce: 0.5,
  lavender: 1.0,
  leek: 1.0,
  lettuce: 1.0,
  marigold: 0.5,
  melon: 1.5,
  mint: 0.75,
  nasturtium: 0.75,
  onion: 0.75,
  onion_sets: 0.75,
  oregano: 0.5,
  parsley: 0.5,
  parsnip: 0.75,
  peas: 1.5,
  pepper: 1.0,
  phacelia: 1.0,
  potato: 1.0,
  pumpkin: 2.5,
  radish: 0.5,
  rhubarb: 1.5,
  rocket: 0.5,
  rosemary: 1.5,
  sage: 0.75,
  spinach: 0.5,
  strawberry: 0.5,
  sunflower: 3.0,
  sweet_pea: 2.0,
  sweetcorn: 2.5,
  thyme: 0.5,
  tomato: 1.5,
  tulip: 0.75,
  turnip: 0.5,
  watermelon: 2.0,
  white_mustard: 1.0,
  winter_rye: 1.5,
  winter_squash: 2.0,
  zinnia: 1.0,
};
/** Real-world size of one texture tile, metres. */
const TILE = { soil: 0.8, gravel: 0.6 };
/** A bed's boards (thickness) and its soil (height, under the rim), and the
 *  block of earth the plot is cut from (depth, and its sides' colours under
 *  the texture), metres. */
const BOARD = 0.04;
const SOIL_Z = BED_HEIGHT - 0.03;
const EARTH = 0.3;
const EARTH_SIDE = ['#5c4636', '#6b5443'];

export type Stage = 'seedling' | 'young' | 'grown';
/** The drag data type of a crop dragged from the planner's palette. */
export const CROP_DRAG = 'application/x-huerta-crop';

interface GardenModelProps {
  garden: Garden;
  sections: Section[];
  /** The sections selected (one or several). */
  selected: number[];
  /** Quarter turns from north up the left. */
  turn?: number;
  onSelect: (index: number) => void;
  /** The label over the selected section: its crop and count. */
  label?: { name: string; count: string };
  /** How far a section has grown (the page draws planned ones grown, but
   *  for the timeline's days ahead). */
  stage?: (s: Section) => Stage;
  /** The sections just planted: their plants come up out of the soil. */
  fresh?: number[];
  /** Beds deleted: plain earth, which can be tapped to put a bed back. */
  bare?: Rect[];
  onBare?: (index: number) => void;
  /** Turn north on the drawing by `delta` degrees (counter-clockwise: +). */
  onTurnNorth?: (delta: number) => void;
  /** A crop dropped on a section. */
  onDropCrop?: (index: number, crop: string) => void;
  /** Clears the selection: a button on the model while sections are selected. */
  onClear?: () => void;
  title: string;
}

/** A section's plants, thinned to its share (`share`, 0-1) and at most
 *  MAX_GLYPHS. */
const thin = <T,>(points: T[], share = 1) => {
  const n = Math.min(MAX_GLYPHS, Math.max(6, Math.ceil(points.length * share)));
  return points.length <= n
    ? points
    : points.filter((_, k) => k % Math.ceil(points.length / n) === 0);
};

export function GardenModel({
  garden,
  sections,
  selected,
  turn: quarter = 0,
  onSelect,
  label,
  stage,
  fresh,
  bare = [],
  onBare,
  onTurnNorth,
  onDropCrop,
  onClear,
  title,
}: GardenModelProps) {
  const { t } = useTranslation('huerta');
  // The section a crop is being dragged over.
  const [over, setOver] = useState<number | null>(null);
  const sectionAt = (e: DragEvent) => {
    const el = (e.target as Element).closest('[data-sec]');
    return el ? Number(el.getAttribute('data-sec')) : null;
  };
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<[number, number]>([0, 0]);
  // Fingers on the model, for a pinch: where each is, and the pinch's start.
  const fingers = useRef(new Map<number, [number, number]>());
  const pinch = useRef<{ d: number; zoom: number } | null>(null);
  const spread = () => {
    const [a, b] = [...fingers.current.values()];
    return Math.hypot(a[0] - b[0], a[1] - b[1]);
  };
  // A drag in progress: where it began, and whether it has moved (then the
  // click that ends it selects nothing).
  const drag = useRef<{
    x: number;
    y: number;
    pan: [number, number];
    moved: boolean;
  } | null>(null);
  const { width: W, length: L } = garden;
  const ground = garden.ground ?? 'raised';
  const open = ground === 'rows';
  const raised = ground === 'raised';
  // The soil the plants stand in: inside raised beds, or a little mounded.
  const soilZ = raised ? SOIL_Z : ground === 'ground' ? 0.04 : 0.03;
  const total = sections.reduce(
    (n, s) => n + (fit(s, open)?.points.length ?? 0),
    0
  );
  const share = Math.min(1, MAX_DRAWN / Math.max(total, 1));
  const turn = (x: number, y: number): [number, number] => {
    switch (quarter % 4) {
      case 1:
        return [L - y, x];
      case 2:
        return [W - x, L - y];
      case 3:
        return [y, W - x];
      default:
        return [x, y];
    }
  };
  const unturn = (a: number, b: number): [number, number] => {
    switch (quarter % 4) {
      case 1:
        return [b, L - a];
      case 2:
        return [W - a, L - b];
      case 3:
        return [W - b, a];
      default:
        return [a, b];
    }
  };
  const V = (a: number, b: number, z: number): [number, number] => [
    (a - b) * COS * S,
    (a + b) * SIN * S - z * S,
  ];
  const P = (x: number, y: number, z = 0) => V(...turn(x, y), z);
  const depth = (x: number, y: number) => {
    const [a, b] = turn(x, y);
    return a + b;
  };
  const pts = (ps: [number, number][]) =>
    ps.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const select = (i: number) => () => onSelect(i);
  // A tap off every bed (a path, a board, the border): the bed nearest the
  // ground point under it, within REACH, so a fingertip need not land inside.
  const nearest = (svg: SVGSVGElement, cx: number, cy: number) => {
    const m = svg.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(cx, cy).matrixTransform(m.inverse());
    const u = p.x / (COS * S),
      v = (p.y + soilZ * S) / (SIN * S);
    const [x, y] = unturn((u + v) / 2, (v - u) / 2);
    let best: number | null = null,
      reach = REACH;
    sections.forEach((s, i) => {
      const d = Math.hypot(
        Math.max(s.x0 - x, 0, x - s.x1),
        Math.max(s.y0 - y, 0, y - s.y1)
      );
      if (d < reach) [best, reach] = [i, d];
    });
    return best;
  };

  const beds = [...new Set(sections.map(s => s.bed))].map(bed => {
    const parts = sections.filter(s => s.bed === bed);
    return {
      parts,
      x0: Math.min(...parts.map(s => s.x0)),
      x1: Math.max(...parts.map(s => s.x1)),
      y0: Math.min(...parts.map(s => s.y0)),
      y1: Math.max(...parts.map(s => s.y1)),
    };
  });

  // ---------- the model ----------
  const box = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    z0: number,
    z1: number,
    top: string,
    s1: string,
    s2: string,
    key: string,
    edge?: string
  ) => {
    const [a0, b0] = turn(x0, y0),
      [a1, b1] = turn(x1, y1);
    const A0 = Math.min(a0, a1),
      A1 = Math.max(a0, a1),
      B0 = Math.min(b0, b1),
      B1 = Math.max(b0, b1);
    return (
      <g key={key}>
        <polygon
          points={pts([
            V(A1, B0, z0),
            V(A1, B1, z0),
            V(A1, B1, z1),
            V(A1, B0, z1),
          ])}
          fill={s1}
        />
        <polygon
          points={pts([
            V(A0, B1, z0),
            V(A1, B1, z0),
            V(A1, B1, z1),
            V(A0, B1, z1),
          ])}
          fill={s2}
        />
        <polygon
          points={pts([
            V(A0, B0, z1),
            V(A1, B0, z1),
            V(A1, B1, z1),
            V(A0, B1, z1),
          ])}
          fill={top}
          stroke={edge}
          strokeWidth={edge ? 3 : 0}
          strokeLinejoin='round'
        />
      </g>
    );
  };
  // The textures laid on the model's planes. A wall is a vertical face at
  // a = c (running along b) or b = c (along a), its texture tiled from z = 0,
  // so boards meet the bed's foot and the earth's gravel the ground; a tile
  // is `long` times as long as it is high.
  const flat = `matrix(${COS} ${SIN} ${-COS} ${SIN} 0 0)`;
  const along = `matrix(${-COS} ${SIN} ${COS} ${SIN} 0 0)`;
  const wall = (
    key: string,
    on: 'a' | 'b',
    c: number,
    [from, to]: [number, number],
    [z0, z1]: [number, number],
    name: string,
    tile: number,
    shade: number,
    long = 2
  ) => {
    const face =
      on === 'a'
        ? pts([V(c, from, z0), V(c, to, z0), V(c, to, z1), V(c, from, z1)])
        : pts([V(from, c, z0), V(to, c, z0), V(to, c, z1), V(from, c, z1)]);
    const transform =
      on === 'a'
        ? `matrix(${-COS} ${SIN} 0 1 ${c * COS * S} ${c * SIN * S})`
        : `matrix(${COS} ${SIN} 0 1 ${-c * COS * S} ${c * SIN * S})`;
    return [
      <defs key={`${key}-d`}>
        <Texture
          id={key}
          name={name}
          size={tile * S}
          width={long * tile * S}
          transform={transform}
        />
      </defs>,
      <polygon key={key} points={face} fill={`url(#${key})`} />,
      <polygon
        key={`${key}-s`}
        points={face}
        fill={`rgba(40,26,14,${shade})`}
      />,
    ];
  };
  // A raised bed: boards BOARD thick, the soil at SOIL_Z inside them, the far
  // boards' inner faces and their shadow on the soil; sun from the upper left,
  // as in the plants' photos.
  const skin = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    key: string
  ) => {
    const [a0, b0] = turn(x0, y0),
      [a1, b1] = turn(x1, y1);
    const A0 = Math.min(a0, a1),
      A1 = Math.max(a0, a1),
      B0 = Math.min(b0, b1),
      B1 = Math.max(b0, b1);
    const h = BED_HEIGHT,
      t = BOARD,
      g = SOIL_Z;
    const quad = (k: string, fill: string, ps: [number, number][]) => (
      <polygon key={k} points={pts(ps)} fill={fill} />
    );
    return (
      <g key={key} pointerEvents='none'>
        {wall(`${key}-r`, 'a', A1, [B0, B1], [0, h], 'boards', h, 0.3, 4)}
        {wall(`${key}-l`, 'b', B1, [A0, A1], [0, h], 'boards', h, 0.04, 4)}
        {quad('soil', 'url(#iso-soil)', [
          V(A0 + t, B0 + t, g),
          V(A1 - t, B0 + t, g),
          V(A1 - t, B1 - t, g),
          V(A0 + t, B1 - t, g),
        ])}
        {wall(
          `${key}-ia`,
          'a',
          A0 + t,
          [B0 + t, B1 - t],
          [g, h],
          'boards',
          h,
          0.45,
          4
        )}
        {wall(
          `${key}-ib`,
          'b',
          B0 + t,
          [A0 + t, A1 - t],
          [g, h],
          'boards',
          h,
          0.2,
          4
        )}
        {quad('wall-shadow', 'rgba(20,12,6,0.35)', [
          V(A0 + t, B0 + t, g),
          V(A0 + t + 0.06, B0 + t + 0.06, g),
          V(A0 + t + 0.06, B1 - t, g),
          V(A0 + t, B1 - t, g),
        ])}
        {quad('top-n', 'url(#iso-board-a)', [
          V(A0, B0, h),
          V(A1, B0, h),
          V(A1, B0 + t, h),
          V(A0, B0 + t, h),
        ])}
        {quad('top-s', 'url(#iso-board-a)', [
          V(A0, B1 - t, h),
          V(A1, B1 - t, h),
          V(A1, B1, h),
          V(A0, B1, h),
        ])}
        {quad('top-w', 'url(#iso-board-b)', [
          V(A0, B0 + t, h),
          V(A0 + t, B0 + t, h),
          V(A0 + t, B1 - t, h),
          V(A0, B1 - t, h),
        ])}
        {quad('top-e', 'url(#iso-board-b)', [
          V(A1 - t, B0 + t, h),
          V(A1, B0 + t, h),
          V(A1, B1 - t, h),
          V(A1 - t, B1 - t, h),
        ])}
      </g>
    );
  };
  // A bed dug in the ground, or a strip of an open plot: worked soil a few
  // centimetres proud of the path.
  const mound = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    key: string
  ) => {
    const [a0, b0] = turn(x0, y0),
      [a1, b1] = turn(x1, y1);
    const A0 = Math.min(a0, a1),
      A1 = Math.max(a0, a1),
      B0 = Math.min(b0, b1),
      B1 = Math.max(b0, b1);
    const z = soilZ;
    return (
      <g key={key} pointerEvents='none'>
        {wall(`${key}-r`, 'a', A1, [B0, B1], [0, z], 'soil', z * 4, 0.35, 1)}
        {wall(`${key}-l`, 'b', B1, [A0, A1], [0, z], 'soil', z * 4, 0.12, 1)}
        <polygon
          points={pts([V(A0, B0, z), V(A1, B0, z), V(A1, B1, z), V(A0, B1, z)])}
          fill='url(#iso-soil)'
        />
      </g>
    );
  };
  // A bed's soft shadow on the gravel, away from the sun.
  const shadow = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    key: string
  ) => {
    const [a0, b0] = turn(x0, y0),
      [a1, b1] = turn(x1, y1);
    const A0 = Math.min(a0, a1),
      A1 = Math.max(a0, a1),
      B0 = Math.min(b0, b1),
      B1 = Math.max(b0, b1);
    const da = BED_HEIGHT * 1.6,
      db = BED_HEIGHT * 0.45;
    return (
      <polygon
        key={key}
        points={pts([
          V(A0, B0, 0),
          V(A1, B0, 0),
          V(A1 + da, B0 + db, 0),
          V(A1 + da, B1 + db, 0),
          V(A0 + da, B1 + db, 0),
          V(A0, B1, 0),
        ])}
        fill='rgba(30,20,10,0.42)'
        filter='url(#iso-blur)'
        pointerEvents='none'
      />
    );
  };
  const rim = raised ? BED_HEIGHT : soilZ;
  const top = (s: Section) =>
    pts([
      P(s.x0, s.y0, rim),
      P(s.x1, s.y0, rim),
      P(s.x1, s.y1, rim),
      P(s.x0, s.y1, rim),
    ]);

  const regs = regions(garden).sort(
    (a, z) =>
      depth((a[0] + a[2]) / 2, (a[1] + a[3]) / 2) -
      depth((z[0] + z[2]) / 2, (z[1] + z[3]) / 2)
  );
  const drawn: ReactNode[] = [
    <defs key='textures'>
      <Texture
        id='iso-soil'
        name='soil'
        size={TILE.soil * S}
        transform={flat}
      />
      <Texture
        id='iso-gravel'
        name={raised ? 'gravel' : ground === 'ground' ? 'woodchip' : 'trodden'}
        size={TILE.gravel * S}
        transform={flat}
      />
      <Texture
        id='iso-bare'
        name='trodden'
        size={TILE.soil * S}
        transform={flat}
      />
      <Texture
        id='iso-board-a'
        name='timber'
        size={BOARD * 3 * S}
        transform={flat}
      />
      <Texture
        id='iso-board-b'
        name='timber'
        size={BOARD * 3 * S}
        transform={along}
      />
      <filter id='iso-blur' x='-10%' y='-10%' width='120%' height='120%'>
        <feGaussianBlur stdDeviation={3} />
      </filter>
    </defs>,
  ];
  // The plot as a block of earth cut out of the ground.
  regs.forEach((r, i) => {
    const [a0, b0] = turn(r[0], r[1]),
      [a1, b1] = turn(r[2], r[3]);
    const A0 = Math.min(a0, a1),
      A1 = Math.max(a0, a1),
      B0 = Math.min(b0, b1),
      B1 = Math.max(b0, b1);
    drawn.push(
      box(
        r[0],
        r[1],
        r[2],
        r[3],
        -EARTH,
        0,
        PLOT,
        EARTH_SIDE[0],
        EARTH_SIDE[1],
        `slab${i}`
      ),
      ...wall(
        `earth${i}-r`,
        'a',
        A1,
        [B0, B1],
        [-EARTH, 0],
        'earth',
        EARTH,
        0.3
      ),
      ...wall(
        `earth${i}-l`,
        'b',
        B1,
        [A0, A1],
        [-EARTH, 0],
        'earth',
        EARTH,
        0.05
      )
    );
  });
  regs.forEach(r => {
    const ground = pts([
      P(r[0], r[1]),
      P(r[2], r[1]),
      P(r[2], r[3]),
      P(r[0], r[3]),
    ]);
    drawn.push(
      <polygon key={`plot${r.join()}`} points={ground} fill={PLOT} />,
      <polygon
        key={`gravel${r.join()}`}
        points={ground}
        fill='url(#iso-gravel)'
      />
    );
  });
  // Deleted beds: plain earth, tapped to put a bed back.
  bare.forEach((r, i) =>
    drawn.push(
      <polygon
        key={`bare${r.join()}`}
        points={pts([
          P(r[0], r[1], 0.005),
          P(r[2], r[1], 0.005),
          P(r[2], r[3], 0.005),
          P(r[0], r[3], 0.005),
        ])}
        fill='url(#iso-bare)'
        className={onBare ? 'cursor-pointer' : undefined}
        onClick={onBare ? () => onBare(i) : undefined}
      />
    )
  );
  if (raised)
    beds.forEach((bed, bi) =>
      drawn.push(shadow(bed.x0, bed.y0, bed.x1, bed.y1, `shadow${bi}`))
    );
  let tallest = 0;
  beds
    .sort(
      (a, z) =>
        depth((a.x0 + a.x1) / 2, (a.y0 + a.y1) / 2) -
        depth((z.x0 + z.x1) / 2, (z.y0 + z.y1) / 2)
    )
    .forEach((bed, bi) => {
      drawn.push(
        ...(raised
          ? [
              box(
                bed.x0,
                bed.y0,
                bed.x1,
                bed.y1,
                0,
                BED_HEIGHT,
                SOIL,
                TIMBER[0],
                TIMBER[1],
                `bed${bi}`
              ),
              skin(bed.x0, bed.y0, bed.x1, bed.y1, `skin${bi}`),
            ]
          : [mound(bed.x0, bed.y0, bed.x1, bed.y1, `mound${bi}`)])
      );
      const plants: { d: number; node: ReactNode }[] = [];
      for (const s of bed.parts) {
        const i = sections.indexOf(s);
        drawn.push(
          <polygon
            key={`sec${i}`}
            points={top(s)}
            fill='transparent'
            className='cursor-pointer'
            data-sec={i}
            onClick={select(i)}
          />
        );
        if (!s.crop) continue;
        const crop = s.crop;
        const look = PLANT_LOOK[crop];
        tallest = Math.max(tallest, look.height);
        const f = fit(s, open);
        const opacity = s.planted ? 1 : 0.6;
        if (!f)
          // A green manure sown thick: its photographed patches over the section.
          carpet(s, i).forEach(([x, y], k) =>
            plants.push({
              d: depth(x, y),
              node: (
                <g
                  key={`c${i}-${x}-${y}`}
                  opacity={opacity}
                  pointerEvents='none'
                >
                  <Staged
                    id={crop}
                    stage={stage ? stage(s) : 'grown'}
                    at={P(x, y, soilZ)}
                    seed={Math.round(x * 100) * 31 + Math.round(y * 100) * 17}
                    pop={fresh?.includes(i) ? k : null}
                  />
                </g>
              ),
            })
          );
        else
          thin(f.points, share).forEach(([x, y], k) =>
            plants.push({
              d: depth(x, y),
              node: (
                <g
                  key={`p${i}-${x}-${y}`}
                  opacity={opacity}
                  pointerEvents='none'
                >
                  <Staged
                    id={crop}
                    stage={stage ? stage(s) : 'grown'}
                    at={P(x, y, soilZ)}
                    seed={Math.round(x * 100) * 31 + Math.round(y * 100) * 17}
                    pop={fresh?.includes(i) ? k : null}
                  />
                </g>
              ),
            })
          );
      }
      plants.sort((a, z) => a.d - z.d).forEach(p => drawn.push(p.node));
    });

  for (const k of selected)
    if (sections[k])
      drawn.push(
        <polygon
          key={`mark${k}`}
          points={top(sections[k])}
          fill='none'
          stroke={MARK}
          strokeWidth={2.5}
          pointerEvents='none'
        />
      );
  if (over !== null && sections[over])
    drawn.push(
      <polygon
        key='over'
        points={top(sections[over])}
        fill='rgba(154,63,31,0.18)'
        stroke={MARK}
        strokeWidth={2}
        strokeDasharray='6 4'
        pointerEvents='none'
      />
    );
  const sel = selected.length === 1 ? sections[selected[0]] : undefined;
  if (sel) {
    if (sel.crop && label) {
      const [lx, ly] = P(
        (sel.x0 + sel.x1) / 2,
        (sel.y0 + sel.y1) / 2,
        rim + PLANT_LOOK[sel.crop].height + 0.35
      );
      const w = Math.max(label.name.length, label.count.length) * 6.6 + 20;
      drawn.push(
        <g key='label' pointerEvents='none'>
          <line
            x1={lx}
            y1={ly}
            x2={lx}
            y2={ly + 18}
            stroke='#9a3f1f'
            strokeWidth={1.2}
          />
          <rect
            x={lx - w / 2}
            y={ly - 38}
            width={w}
            height={38}
            rx={9}
            fill='#fff'
            stroke='#e6ded4'
          />
          <text
            x={lx}
            y={ly - 22}
            textAnchor='middle'
            style={{ font: '600 12px var(--font-sans)', fill: '#1f1a17' }}
          >
            {label.name}
          </text>
          <text
            x={lx}
            y={ly - 8}
            textAnchor='middle'
            style={{ font: '500 12px var(--font-sans)', fill: '#776c64' }}
          >
            {label.count}
          </text>
        </g>
      );
    }
  }

  const xs: number[] = [],
    ys: number[] = [];
  for (const [x, y] of [
    [0, 0],
    [W, 0],
    [0, L],
    [W, L],
  ])
    for (const z of [-0.12, BED_HEIGHT + tallest + 0.9]) {
      const [px, py] = P(x, y, z);
      xs.push(px);
      ys.push(py);
    }
  // A small plot is not blown up: the view is at least MIN_VIEW wide.
  const padX = Math.max(0, MIN_VIEW - (Math.max(...xs) - Math.min(...xs))) / 2,
    padY =
      Math.max(0, MIN_VIEW * 0.6 - (Math.max(...ys) - Math.min(...ys))) / 2;
  const minX = Math.min(...xs) - 30 - padX,
    maxX = Math.max(...xs) + 30 + padX,
    minY = Math.min(...ys) - 10 - padY,
    maxY = Math.max(...ys) + 24 + padY;
  // The needle points to true north: the plot's top faces `garden.north`.
  const bearing = ((garden.north ?? 0) * Math.PI) / 180;
  const n0 = P(0, 0),
    n1 = P(-Math.sin(bearing), -Math.cos(bearing));

  // Zoomed in, the view is a window on the whole, moved by dragging.
  const w = maxX - minX,
    h = maxY - minY,
    vw = w / zoom,
    vh = h / zoom;
  const limit = ([x, y]: [number, number]): [number, number] => [
    Math.max(-(w - vw) / 2, Math.min((w - vw) / 2, x)),
    Math.max(-(h - vh) / 2, Math.min((h - vh) / 2, y)),
  ];
  const [px, py] = limit(pan);
  const zoomTo = (z: number) => {
    const next = z < 1.01 ? 1 : Math.min(MAX_ZOOM, z);
    setZoom(next);
    if (next === 1) setPan([0, 0]);
  };
  return (
    <div className='relative'>
      <svg
        role='img'
        aria-label={title}
        viewBox={`${minX + (w - vw) / 2 + px} ${minY + (h - vh) / 2 + py} ${vw} ${vh}`}
        className={cn(
          'block h-auto max-h-[38rem] w-full',
          // Two fingers pinch the model, one scrolls the page; zoomed in,
          // one finger moves the view.
          zoom > 1
            ? 'cursor-grab touch-none active:cursor-grabbing'
            : 'touch-pan-y'
        )}
        onPointerDown={e => {
          fingers.current.set(e.pointerId, [e.clientX, e.clientY]);
          if (fingers.current.size === 2) {
            pinch.current = { d: spread(), zoom };
            drag.current = { x: 0, y: 0, pan: [px, py], moved: true };
            return;
          }
          if (zoom > 1)
            drag.current = {
              x: e.clientX,
              y: e.clientY,
              pan: [px, py],
              moved: false,
            };
        }}
        onPointerMove={e => {
          if (fingers.current.has(e.pointerId))
            fingers.current.set(e.pointerId, [e.clientX, e.clientY]);
          if (pinch.current && fingers.current.size === 2) {
            zoomTo((pinch.current.zoom * spread()) / pinch.current.d);
            return;
          }
          const d = drag.current;
          if (!d || pinch.current) return;
          const dx = e.clientX - d.x,
            dy = e.clientY - d.y;
          if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
          const k = vw / e.currentTarget.clientWidth;
          if (d.moved) setPan(limit([d.pan[0] - dx * k, d.pan[1] - dy * k]));
        }}
        onPointerUp={e => {
          fingers.current.delete(e.pointerId);
          if (fingers.current.size < 2) pinch.current = null;
          setTimeout(() => (drag.current = null));
        }}
        onPointerCancel={e => {
          fingers.current.delete(e.pointerId);
          pinch.current = null;
          drag.current = null;
        }}
        onPointerLeave={e => {
          fingers.current.delete(e.pointerId);
          drag.current = null;
        }}
        onClickCapture={e => {
          if (drag.current?.moved) e.stopPropagation();
        }}
        onClick={e => {
          if ((e.target as Element).closest('[data-sec]')) return;
          const i = nearest(e.currentTarget, e.clientX, e.clientY);
          if (i !== null) onSelect(i);
        }}
        onDragOver={e => {
          if (!onDropCrop || !e.dataTransfer.types.includes(CROP_DRAG)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          const k = sectionAt(e);
          if (k !== over) setOver(k);
        }}
        onDragLeave={e => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null);
        }}
        onDrop={e => {
          e.preventDefault();
          setOver(null);
          const k = sectionAt(e);
          const crop = e.dataTransfer.getData(CROP_DRAG);
          if (k !== null && crop) onDropCrop?.(k, crop);
        }}
      >
        {drawn}
        {/* The bed under a crop dragged by touch: the drag points this outline
            at it (TOUCH_OVER), so a move never re-renders the garden. */}
        <polygon
          data-touch-over=''
          points=''
          visibility='hidden'
          fill='rgba(154,63,31,0.18)'
          stroke={MARK}
          strokeWidth={2}
          strokeDasharray='6 4'
          pointerEvents='none'
        />
      </svg>
      <div
        role='group'
        aria-label={t('planner.whereNorth')}
        title={t('planner.whereNorth')}
        className='absolute top-2 left-2 flex items-center rounded-lg bg-card/90 elevation-raised'
      >
        {onTurnNorth ? (
          <ModelControl
            label={t('planner.northLeft')}
            onClick={() => onTurnNorth(45)}
          >
            <RotateCcw className='size-4' />
          </ModelControl>
        ) : null}
        <Needle d={[n1[0] - n0[0], n1[1] - n0[1]]} />
        {onTurnNorth ? (
          <ModelControl
            label={t('planner.northRight')}
            onClick={() => onTurnNorth(-45)}
          >
            <RotateCw className='size-4' />
          </ModelControl>
        ) : null}
      </div>
      {onClear && selected.length > 0 ? (
        <button
          type='button'
          onClick={onClear}
          aria-label={t('planner.clearSelection')}
          className='focus-ring absolute bottom-2 left-2 flex h-8 items-center gap-1 rounded-full bg-card/90 px-2.5 text-xs font-medium text-foreground elevation-raised hover:bg-card sm:h-9 sm:px-3 sm:text-sm'
        >
          <X className='size-3.5' />
          {t('planner.clear')}
        </button>
      ) : null}
      <div className='absolute right-2 bottom-2 flex flex-col rounded-lg bg-card/90 elevation-raised'>
        <ModelControl
          label={t('planner.zoomIn')}
          disabled={zoom >= MAX_ZOOM}
          onClick={() => zoomTo(zoom * ZOOM_STEP)}
        >
          <ZoomIn className='size-4' />
        </ModelControl>
        <ModelControl
          label={t('planner.zoomOut')}
          disabled={zoom <= 1}
          onClick={() => zoomTo(zoom / ZOOM_STEP)}
        >
          <ZoomOut className='size-4' />
        </ModelControl>
        <ModelControl
          label={t('planner.zoomFit')}
          disabled={zoom === 1}
          onClick={() => zoomTo(1)}
        >
          <Maximize2 className='size-4' />
        </ModelControl>
      </div>
    </div>
  );
}

/** A control over the model, sized as a map's are (32 px on a phone, 40 px
 *  above): page-sized 44 px buttons took the garden's room on a phone. */
function ModelControl({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type='button'
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className='focus-ring flex size-8 items-center justify-center rounded-md text-foreground hover:bg-muted disabled:pointer-events-none disabled:opacity-40 sm:size-10'
    >
      {children}
    </button>
  );
}

/** The north needle, as on a compass: its red half points where north lies
 *  on the drawing, and an N stands past its tip. */
function Needle({ d }: { d: [number, number] }) {
  const len = Math.hypot(d[0], d[1]) || 1;
  const ux = d[0] / len,
    uy = d[1] / len;
  const half = (sign: number) =>
    `${sign * ux * 11},${sign * uy * 11} ${-uy * 3.4},${ux * 3.4} ${uy * 3.4},${-ux * 3.4}`;
  return (
    <svg
      viewBox='-19 -19 38 38'
      className='size-8 sm:size-10'
      aria-hidden='true'
    >
      <polygon points={half(1)} fill='#c0391b' />
      <polygon points={half(-1)} fill='#a39890' />
      <circle r={1.7} fill='#fff' />
      <text
        x={ux * 15.5}
        y={uy * 15.5 + 3.6}
        textAnchor='middle'
        style={{ font: '800 10px var(--font-sans)', fill: '#c0391b' }}
      >
        N
      </text>
    </svg>
  );
}

/** A texture tiled over a surface; `transform` lays it on a plane of the model. */
function Texture({
  id,
  name,
  size,
  width = size,
  transform,
}: {
  id: string;
  name: string;
  size: number;
  width?: number;
  transform?: string;
}) {
  return (
    <pattern
      id={id}
      patternUnits='userSpaceOnUse'
      width={width}
      height={size}
      patternTransform={transform}
    >
      <image
        href={GROUND(name)}
        width={width}
        height={size}
        preserveAspectRatio='none'
      />
    </pattern>
  );
}

/** A plant photographed at its stage, at its true size. Which of the three
 *  grown photos, and a few per cent of size, vary from plant to plant as in a
 *  real row. `pop`, its place in the row, makes it come up out of the soil. */
function Staged({
  id,
  stage,
  at: [bx, by],
  seed,
  pop,
}: {
  id: string;
  stage: Stage;
  at: [number, number];
  seed: number;
  pop: number | null;
}) {
  const h = STAGED[id] * S * (0.94 + (seed % 13) / 100);
  return (
    <image
      href={huertaImage(
        `iso/${id}-${stage === 'grown' ? 1 + (seed % 3) : stage}`
      )}
      x={bx - h / 2}
      y={by - h * 0.92}
      width={h}
      height={h}
      className={pop === null ? undefined : 'plant-up'}
      style={
        pop === null
          ? undefined
          : { animationDelay: `${Math.min(pop * 14, 1400)}ms` }
      }
    />
  );
}

/** A photographed plant standing on its spot, about as wide as its spacing:
 *  the photo's foot (its shadow) sits just in front of the spot. */
/** A green manure sown thick: where its photographed patches stand. */
function carpet(s: Section, i: number): [number, number][] {
  let seed = (i + 1) * 7919;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const n = Math.min(Math.round(((s.x1 - s.x0) * (s.y1 - s.y0)) / 0.054), 54);
  return Array.from({ length: n }, () => [
    s.x0 + 0.04 + rnd() * (s.x1 - s.x0 - 0.08),
    s.y0 + 0.04 + rnd() * (s.y1 - s.y0 - 0.08),
  ]);
}
