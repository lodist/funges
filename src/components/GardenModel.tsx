import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  BED_HEIGHT,
  fit,
  regions,
  type Garden,
  type Rect,
  type Section,
} from '@/lib/planner';
import { huertaImage } from '@/lib/huerta';
import { Maximize2, RotateCcw, RotateCw, ZoomIn, ZoomOut } from '@/lib/icons';
import { cn } from '@/lib/utils';
import { PLANT_LOOK, type PlantLook } from '@/lib/planner-data';

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
const PLOT = '#ece5db';
const SOIL = '#6c5544';
const TIMBER = ['#e5d5bb', '#cfba98', '#eadcc5'];
const MARK = '#c9603a';
const HI = 'rgba(255,255,255,0.3)';
/** Crops drawn as photographed plants seen from the model's angle
 *  (huerta/iso/<id>.webp). The rest keep their forms. */
const PHOTO = new Set(['peas']);
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
  lettuce: 1.0,
  tomato: 1.5,
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
  /** How far a planted section has grown; planned ones are drawn grown. */
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
        if (!f && STAGED[crop])
          // A green manure sown thick: its photographed patches over the
          // section, one for every sixth blade.
          carpet(s, i, look)
            .filter((_, k) => k % 6 === 0)
            .forEach(([x, y], k) =>
              plants.push({
                d: depth(x, y),
                node: (
                  <g
                    key={`c${i}-${x}-${y}`}
                    opacity={opacity}
                    data-sec={i}
                    onClick={select(i)}
                    className='cursor-pointer'
                  >
                    <Staged
                      id={crop}
                      stage={s.planted && stage ? stage(s) : 'grown'}
                      at={P(x, y, soilZ)}
                      seed={Math.round(x * 100) * 31 + Math.round(y * 100) * 17}
                      pop={fresh?.includes(i) ? k : null}
                    />
                  </g>
                ),
              })
            );
        else if (!f)
          carpet(s, i, look).forEach(([x, y, h, flower]) => {
            const [bx, by] = P(x, y, soilZ);
            plants.push({
              d: depth(x, y),
              node: (
                <g
                  key={`c${i}-${x}-${y}`}
                  opacity={opacity}
                  data-sec={i}
                  onClick={select(i)}
                >
                  <line
                    x1={bx}
                    y1={by}
                    x2={bx + h[0]}
                    y2={by - h[1] * S}
                    stroke={look.leaf}
                    strokeWidth={1.3}
                    strokeLinecap='round'
                  />
                  {flower && look.accent ? (
                    <circle
                      cx={bx + h[0]}
                      cy={by - h[1] * S}
                      r={2.3}
                      fill={look.accent}
                    />
                  ) : null}
                </g>
              ),
            });
          });
        else
          thin(f.points, share).forEach(([x, y], k) =>
            plants.push({
              d: depth(x, y),
              node: (
                <g
                  key={`p${i}-${x}-${y}`}
                  opacity={opacity}
                  data-sec={i}
                  onClick={select(i)}
                  className='cursor-pointer'
                >
                  {STAGED[crop] ? (
                    <Staged
                      id={crop}
                      stage={s.planted && stage ? stage(s) : 'grown'}
                      at={P(x, y, soilZ)}
                      seed={Math.round(x * 100) * 31 + Math.round(y * 100) * 17}
                      pop={fresh?.includes(i) ? k : null}
                    />
                  ) : PHOTO.has(crop) ? (
                    <Photo
                      id={crop}
                      at={P(x, y, soilZ)}
                      d={Math.min(f.spacing, f.across)}
                    />
                  ) : (
                    <Plant
                      look={look}
                      at={P(x, y, soilZ)}
                      r={Math.min(f.spacing, f.across) / 2}
                    />
                  )}
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
          zoom > 1 && 'cursor-grab touch-none active:cursor-grabbing'
        )}
        onPointerDown={e => {
          if (zoom > 1)
            drag.current = {
              x: e.clientX,
              y: e.clientY,
              pan: [px, py],
              moved: false,
            };
        }}
        onPointerMove={e => {
          const d = drag.current;
          if (!d) return;
          const dx = e.clientX - d.x,
            dy = e.clientY - d.y;
          if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
          const k = vw / e.currentTarget.clientWidth;
          if (d.moved) setPan(limit([d.pan[0] - dx * k, d.pan[1] - dy * k]));
        }}
        onPointerUp={() => setTimeout(() => (drag.current = null))}
        onPointerLeave={() => (drag.current = null)}
        onClickCapture={e => {
          if (drag.current?.moved) e.stopPropagation();
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
      </svg>
      <div
        role='group'
        aria-label={t('planner.whereNorth')}
        title={t('planner.whereNorth')}
        className='absolute top-2 left-2 flex items-center gap-0.5 rounded-lg bg-card/90 p-1 elevation-raised'
      >
        {onTurnNorth ? (
          <Button
            variant='ghost'
            size='icon'
            aria-label={t('planner.northLeft')}
            onClick={() => onTurnNorth(45)}
          >
            <RotateCcw className='size-4' />
          </Button>
        ) : null}
        <Needle d={[n1[0] - n0[0], n1[1] - n0[1]]} />
        {onTurnNorth ? (
          <Button
            variant='ghost'
            size='icon'
            aria-label={t('planner.northRight')}
            onClick={() => onTurnNorth(-45)}
          >
            <RotateCw className='size-4' />
          </Button>
        ) : null}
      </div>
      <div className='absolute right-2 bottom-2 flex flex-col gap-0.5 rounded-lg bg-card/90 p-1 elevation-raised'>
        <Button
          variant='ghost'
          size='icon'
          aria-label={t('planner.zoomIn')}
          disabled={zoom >= MAX_ZOOM}
          onClick={() => zoomTo(zoom * ZOOM_STEP)}
        >
          <ZoomIn className='size-4' />
        </Button>
        <Button
          variant='ghost'
          size='icon'
          aria-label={t('planner.zoomOut')}
          disabled={zoom <= 1}
          onClick={() => zoomTo(zoom / ZOOM_STEP)}
        >
          <ZoomOut className='size-4' />
        </Button>
        <Button
          variant='ghost'
          size='icon'
          aria-label={t('planner.zoomFit')}
          disabled={zoom === 1}
          onClick={() => zoomTo(1)}
        >
          <Maximize2 className='size-4' />
        </Button>
      </div>
    </div>
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
    <svg viewBox='-19 -19 38 38' className='size-10' aria-hidden='true'>
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
function Photo({
  id,
  at: [bx, by],
  d,
}: {
  id: string;
  at: [number, number];
  d: number;
}) {
  const w = d * S * 1.35;
  return (
    <image
      href={huertaImage(`iso/${id}`)}
      x={bx - w / 2}
      y={by + d * S * 0.3 - 4 * w}
      width={w}
      height={4 * w}
      preserveAspectRatio='xMidYMax meet'
    />
  );
}

/** A scattered green manure: blades (and some flowers) over the section. */
function carpet(
  s: Section,
  i: number,
  look: PlantLook
): [number, number, [number, number], boolean][] {
  let seed = (i + 1) * 7919;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const n = Math.min(Math.round(((s.x1 - s.x0) * (s.y1 - s.y0)) / 0.009), 320);
  return Array.from({ length: n }, () => {
    const x = s.x0 + 0.04 + rnd() * (s.x1 - s.x0 - 0.08);
    const y = s.y0 + 0.04 + rnd() * (s.y1 - s.y0 - 0.08);
    return [
      x,
      y,
      [(rnd() - 0.5) * 5, look.height * (0.45 + rnd() * 0.55)],
      rnd() < 0.35,
    ];
  });
}

/** One plant as its form: spikes, rosette, root, ball, column, climber, sprawl or flower. */
function Plant({
  look,
  at: [bx, by],
  r,
}: {
  look: PlantLook;
  at: [number, number];
  r: number;
}) {
  const h = look.height * S;
  const R = Math.max(r * S * 0.9, 3);
  const L = look.leaf,
    A = look.accent;
  switch (look.habit) {
    case 'rosette':
      return (
        <>
          <ellipse cx={bx} cy={by - R * 0.15} rx={R} ry={R * 0.58} fill={L} />
          <ellipse
            cx={bx - R * 0.22}
            cy={by - R * 0.32}
            rx={R * 0.5}
            ry={R * 0.27}
            fill={HI}
          />
          {A ? (
            <ellipse
              cx={bx}
              cy={by - R * 0.1}
              rx={R * 0.28}
              ry={R * 0.16}
              fill={A}
            />
          ) : null}
        </>
      );
    case 'ball': {
      const rr = Math.min(R, h * 0.5);
      return (
        <>
          <circle cx={bx} cy={by - rr} r={rr} fill={L} />
          <circle
            cx={bx - rr * 0.32}
            cy={by - rr * 1.35}
            r={rr * 0.45}
            fill={HI}
          />
          {A ? (
            <circle
              cx={bx + rr * 0.12}
              cy={by - rr * 1.15}
              r={rr * 0.42}
              fill={A}
            />
          ) : null}
        </>
      );
    }
    case 'column': {
      const w = Math.max(R * 0.6, 5);
      return (
        <>
          <rect
            x={bx - w / 2}
            y={by - h}
            width={w}
            height={h}
            rx={w / 2}
            fill={L}
          />
          <rect
            x={bx - w / 2 + 1.2}
            y={by - h + 3}
            width={w * 0.3}
            height={Math.max(h - 6, 1)}
            rx={w * 0.15}
            fill={HI}
          />
          {A
            ? [0.3, 0.55, 0.78].map(k => (
                <circle
                  key={k}
                  cx={bx + (k === 0.55 ? -w * 0.45 : w * 0.45)}
                  cy={by - h * k}
                  r={Math.max(w * 0.28, 2.2)}
                  fill={A}
                />
              ))
            : null}
        </>
      );
    }
    case 'spikes':
    case 'root': {
      const d = Math.max(R * (look.habit === 'root' ? 0.5 : 0.45), 2.5);
      return (
        <>
          <g
            stroke={L}
            strokeWidth={look.habit === 'root' ? 1.2 : 1.7}
            strokeLinecap='round'
          >
            <line x1={bx} y1={by} x2={bx - d} y2={by - h} />
            <line x1={bx} y1={by} x2={bx} y2={by - h * 1.1} />
            <line x1={bx} y1={by} x2={bx + d} y2={by - h * 0.9} />
          </g>
          {A ? (
            <ellipse
              cx={bx}
              cy={by - (look.habit === 'root' ? 0 : 1.5)}
              rx={d * 0.85}
              ry={d * 0.5}
              fill={A}
            />
          ) : null}
        </>
      );
    }
    case 'climber':
      return (
        <>
          <line
            x1={bx}
            y1={by}
            x2={bx}
            y2={by - h}
            stroke='#b39a7a'
            strokeWidth={1.6}
          />
          {[1, 2, 3, 4, 5].map(k => (
            <circle
              key={k}
              cx={bx + (k % 2 ? -3.5 : 3.5)}
              cy={by - (h * k) / 6}
              r={3.6}
              fill={L}
            />
          ))}
          {A ? (
            <circle cx={bx + 3} cy={by - h * 0.86} r={2.6} fill={A} />
          ) : null}
        </>
      );
    case 'sprawl':
      return (
        <>
          <ellipse
            cx={bx}
            cy={by - R * 0.25}
            rx={R * 1.1}
            ry={R * 0.62}
            fill={L}
          />
          <ellipse
            cx={bx - R * 0.3}
            cy={by - R * 0.45}
            rx={R * 0.5}
            ry={R * 0.25}
            fill={HI}
          />
          {A ? (
            <ellipse
              cx={bx + R * 0.35}
              cy={by - R * 0.12}
              rx={Math.max(R * 0.38, 2.5)}
              ry={Math.max(R * 0.3, 2)}
              fill={A}
            />
          ) : null}
        </>
      );
    case 'flower':
      return (
        <>
          <line
            x1={bx}
            y1={by}
            x2={bx}
            y2={by - h}
            stroke={L}
            strokeWidth={1.6}
          />
          <ellipse cx={bx - 3} cy={by - 2} rx={4} ry={2} fill={L} />
          <circle
            cx={bx}
            cy={by - h}
            r={Math.max(Math.min(R * 0.5, 7), 3)}
            fill={A ?? L}
          />
        </>
      );
    default:
      return null;
  }
}
