import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  axisOf,
  BED_HEIGHT,
  familyOf,
  fit,
  L_CUT,
  regions,
  type Garden,
  type Rect,
  type Section,
} from '@/lib/planner';
import { wallsOf } from '@/lib/sun';
import { CROPS, huertaImage } from '@/lib/huerta';
import {
  Hand,
  Maximize2,
  RotateCcw,
  RotateCw,
  SquareDashedMousePointer,
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
/** Zoomed out to half: a big plot with room around it to start a box. */
const MIN_ZOOM = 0.5;
const ZOOM_STEP = 1.5;
/** How far off a bed (metres, on the ground) a tap still picks it. */
const REACH = 0.6;
const PLOT = '#ece5db';
/** Past this many sections the garden opens as a plan: the model's plants
 *  are a picture each (some 7,000 at 60 x 60 m), the plan a block a section. */
const PLAN_FROM = 120;
/** Round the plan, room for the beds' numbers and what stands along a side. */
const PLAN_MARGIN = 0.9;
/** The drawing's tallest, as its class says (max-h-[38rem]). */
const MAX_HEIGHT = 608;
/** The controls over the drawing's top, in screen pixels. */
const CONTROLS = 44;
// The plan's flat colours: a section by its crop's family, its earth, and
// what stands along a side.
const FAMILY: Record<string, string> = {
  legumes: '#86ab6a',
  brassicas: '#6e9a8c',
  leaves: '#a8c36b',
  alliums: '#c8b26c',
  fruiting: '#d98a5f',
  flowers: '#dfa3b9',
  herbs: '#7fae9a',
  fruit: '#c9706d',
};
const COVER = '#b7c78e';
const GREEN_MANURE = new Set(
  CROPS.filter(c => c.kind === 'cover').map(c => c.id)
);
const OTHER = '#9fae84';
const OPEN_EARTH = '#8a6f58';
const SIDE = { fence: '#b08d63', house: '#9c968f', trees: '#5d7a4a' };
/** What stands along a side, in the model: a block this thick and high
 *  (metres; low, as an architect's model shows its surroundings), and its
 *  two lit faces. One between the plot and the viewer is cut to a sill. */
const SIDE_BLOCK = { fence: 0.6, house: 1, trees: 1.3 };
const SIDE_FACES = {
  fence: ['#94744f', '#a3825b'],
  house: ['#827d77', '#8f8a84'],
  trees: ['#4a633a', '#536e42'],
};
const SIDE_DEEP = 0.3;
const SILL = 0.12;
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
  /** Sections taken in at once by dragging over them (in area mode, or
   *  with Shift held): added to the selection. */
  onSelectArea?: (indices: number[]) => void;
  /** A double click on a section: its whole bed. */
  onBed?: (index: number) => void;
  /** The label over the selected section: its crop and count. */
  label?: { name: string; count: string };
  /** How far a section has grown (the page draws planned ones grown, but
   *  for the timeline's days ahead). */
  stage?: (s: Section) => Stage;
  /** Whole beds chosen by their numbers on the plan (a tap, or a drag
   *  along them). */
  onBeds?: (beds: number[]) => void;
  /** How much sun a section gets in the month shown (lib/sun): a flat tone
   *  on it, none where not known. */
  sunAt?: (s: Section) => 'full' | 'part' | 'little' | undefined;
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
  onSelectArea,
  onBed,
  label,
  stage,
  onBeds,
  sunAt,
  fresh,
  bare = [],
  onBare,
  onTurnNorth,
  onDropCrop,
  onClear,
  title,
}: GardenModelProps) {
  const { t } = useTranslation('huerta');
  // Drawn as the model (a plant a picture) or the plan from above (a block a
  // section): a big garden opens as the plan.
  const [view, setView] = useState<'model' | 'plan'>(() =>
    sections.length > PLAN_FROM ? 'plan' : 'model'
  );
  // The beds a drag along their numbers has run over, while it lasts.
  const bedDrag = useRef<[number, number] | null>(null);
  const [bedRange, setBedRange] = useState<[number, number] | null>(null);
  // The drawing's width on screen, for the plan's labels: a name only where
  // it can be read.
  const [frameWidth, setFrameWidth] = useState(0);
  // The section a crop is being dragged over.
  const [over, setOver] = useState<number | null>(null);
  const sectionAt = (e: DragEvent) => {
    const el = (e.target as Element).closest('[data-sec]');
    return el ? Number(el.getAttribute('data-sec')) : null;
  };
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<[number, number]>([0, 0]);
  // A tool on: moving the drawing, or selecting an area (a drag then draws a
  // box). Either way a finger no longer scrolls the page over the model; the
  // box, in pixels over the model, while it is drawn.
  const [tool, setTool] = useState<'move' | 'area' | null>(null);
  const area = tool === 'area';
  const moving = tool === 'move';
  const frame = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const watch = new ResizeObserver(([entry]) =>
      setFrameWidth(entry.contentRect.width)
    );
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
  const [areaBox, setAreaBox] = useState<
    [number, number, number, number] | null
  >(null);
  const boxFrom = useRef<[number, number] | null>(null);
  const local = (x: number, y: number): [number, number] => {
    const r = frame.current!.getBoundingClientRect();
    return [x - r.left, y - r.top];
  };
  // The sections whose middle lies in the box (pixels over the model).
  const inBox = (svg: SVGSVGElement, [x0, y0, x1, y1]: number[]) => {
    const r = frame.current!.getBoundingClientRect();
    const [l, t, rr, b] = [
      Math.min(x0, x1) + r.left,
      Math.min(y0, y1) + r.top,
      Math.max(x0, x1) + r.left,
      Math.max(y0, y1) + r.top,
    ];
    return [...svg.querySelectorAll('[data-sec]')].flatMap(el => {
      const c = el.getBoundingClientRect();
      const [cx, cy] = [c.left + c.width / 2, c.top + c.height / 2];
      return cx >= l && cx <= rr && cy >= t && cy <= b
        ? [Number(el.getAttribute('data-sec'))]
        : [];
    });
  };
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
    const [x, y] =
      view === 'plan' ? [p.x / S, p.y / S] : unturn((u + v) / 2, (v - u) / 2);
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

  // ---------- the plan ----------
  // Seen from above, a block a section, S units a metre: far less to draw
  // than the model's plants. Its beds are square to the screen, so a box
  // takes what it seems to, and a bed's number takes its bed.
  // Screen pixels a plan unit, at this zoom: the drawing fills its width up
  // to its tallest.
  const pxOf = ([x0, y0, x1, y1]: number[]) =>
    frameWidth
      ? Math.min(
          frameWidth / ((x1 - x0) / zoom),
          MAX_HEIGHT / ((y1 - y0) / zoom)
        )
      : 0;
  const margin = PLAN_MARGIN * S;
  const around = [-margin, -margin, W * S + margin, L * S + margin];
  // Above the beds' numbers and below the beds, room for the controls over
  // the drawing (a phone's plan is small: they would cover them).
  const lift = pxOf(around) ? CONTROLS / pxOf(around) : 0;
  const planBox: [number, number, number, number] = [
    around[0],
    around[1] - lift,
    around[2],
    around[3] + lift,
  ];
  const unitPx = pxOf(planBox);
  const drawPlan = () => {
    const nodes: ReactNode[] = [];
    const at = (x0: number, y0: number, x1: number, y1: number) => ({
      x: x0 * S,
      y: y0 * S,
      width: (x1 - x0) * S,
      height: (y1 - y0) * S,
    });
    // What stands along a side, a band outside it; in the L's cut corner,
    // the corner filled.
    const band = PLAN_MARGIN * 0.5;
    for (const w of wallsOf(garden)) {
      if (w.side === 'corner') continue;
      const out = w.side === 'top' || w.side === 'left' ? -band : band;
      nodes.push(
        <rect
          key={`side-${w.side}`}
          {...(w.x0 === w.x1
            ? at(
                Math.min(w.x0, w.x0 + out),
                w.y0,
                Math.max(w.x0, w.x0 + out),
                w.y1
              )
            : at(
                w.x0,
                Math.min(w.y0, w.y0 + out),
                w.x1,
                Math.max(w.y0, w.y0 + out)
              ))}
          fill={SIDE[w.kind]}
        />
      );
    }
    const corner = garden.shape === 'L' ? garden.sides?.corner : undefined;
    if (corner)
      nodes.push(
        <rect
          key='side-corner'
          {...at(W * L_CUT.width, L * L_CUT.length, W, L)}
          fill={SIDE[corner]}
        />
      );
    regions(garden).forEach(r =>
      nodes.push(
        <rect
          key={`plot${r.join('|')}`}
          {...at(...r)}
          fill={PLOT}
          stroke='#d6cabb'
          strokeWidth={1.5}
          vectorEffect='non-scaling-stroke'
        />
      )
    );
    bare.forEach((r, k) =>
      nodes.push(
        <rect
          key={`bare${r.join('|')}`}
          {...at(...r)}
          fill='#ddd2c4'
          stroke='#bfb19e'
          strokeWidth={1.5}
          strokeDasharray='4 3'
          vectorEffect='non-scaling-stroke'
          className={onBare ? 'cursor-pointer' : undefined}
          onClick={onBare ? () => onBare(k) : undefined}
        />
      )
    );
    // Raised beds in their boards.
    if (raised)
      beds.forEach(bed =>
        nodes.push(
          <rect
            key={`board${bed.parts[0].bed}`}
            {...at(bed.x0 - 0.05, bed.y0 - 0.05, bed.x1 + 0.05, bed.y1 + 0.05)}
            fill={TIMBER[1]}
          />
        )
      );
    sections.forEach((s, i) => {
      // Keyed by where it lies (sections never overlap).
      const id = `${s.x0}|${s.y0}`;
      // What is over or lost the page has already emptied.
      const crop = s.crop;
      const family = crop ? familyOf(crop) : undefined;
      const box = at(s.x0, s.y0, s.x1, s.y1);
      nodes.push(
        <rect
          key={`sec${id}`}
          data-sec={i}
          {...box}
          // A planned crop pale, as on the model; earth where nothing is.
          fill={
            !crop
              ? raised
                ? SOIL
                : OPEN_EARTH
              : GREEN_MANURE.has(crop)
                ? COVER
                : ((family && FAMILY[family]) ?? OTHER)
          }
          fillOpacity={crop && !s.planted ? 0.55 : 1}
          stroke='#4a3a2d'
          strokeOpacity={0.35}
          strokeWidth={1}
          vectorEffect='non-scaling-stroke'
          className='cursor-pointer'
          onClick={select(i)}
          onDoubleClick={onBed ? () => onBed(i) : undefined}
        />
      );
      const sun = sunAt?.(s);
      if (sun === 'part' || sun === 'little')
        nodes.push(
          <rect
            key={`sun${id}`}
            {...box}
            fill='#1f1a17'
            fillOpacity={sun === 'part' ? 0.16 : 0.34}
            pointerEvents='none'
          />
        );
      if (!crop || !unitPx) return;
      // Its crop's photo, and its name, where they can be seen and read.
      const w = box.width * unitPx,
        h = box.height * unitPx;
      const icon = Math.min(box.width, box.height) * 0.55;
      const named = w >= 70 && h >= 46;
      if (icon * unitPx >= 18)
        nodes.push(
          <image
            key={`icon${id}`}
            href={huertaImage(`crops/${crop}`)}
            x={box.x + (box.width - icon) / 2}
            y={box.y + (box.height - icon) / 2 - (named ? 7 / unitPx : 0)}
            width={icon}
            height={icon}
            preserveAspectRatio='xMidYMid slice'
            pointerEvents='none'
          />
        );
      if (named)
        nodes.push(
          <text
            key={`name${id}`}
            x={box.x + box.width / 2}
            y={box.y + box.height - 6 / unitPx}
            textAnchor='middle'
            pointerEvents='none'
            style={{
              font: `600 ${11 / unitPx}px var(--font-sans)`,
              fill: '#1f1a17',
            }}
          >
            {t(`crops.${crop}`).slice(0, Math.floor(w / 7))}
          </text>
        );
    });
    for (const k of selected)
      if (sections[k])
        nodes.push(
          <rect
            key={`mark${k}`}
            {...at(
              sections[k].x0,
              sections[k].y0,
              sections[k].x1,
              sections[k].y1
            )}
            fill='none'
            stroke={MARK}
            strokeWidth={2.5}
            vectorEffect='non-scaling-stroke'
            pointerEvents='none'
          />
        );
    if (over !== null && sections[over])
      nodes.push(
        <rect
          key='over'
          {...at(
            sections[over].x0,
            sections[over].y0,
            sections[over].x1,
            sections[over].y1
          )}
          fill='rgba(154,63,31,0.18)'
          stroke={MARK}
          strokeWidth={2}
          strokeDasharray='6 4'
          vectorEffect='non-scaling-stroke'
          pointerEvents='none'
        />
      );
    // The beds' numbers at their north ends (or west, where they run
    // across): a tap takes a bed, a drag along them the beds it runs over.
    if (onBeds && unitPx) {
      const across = axisOf(garden) === 'x';
      const pitch = Math.min(
        ...beds.map(b => (across ? b.y1 - b.y0 : b.x1 - b.x0))
      );
      const r = Math.min(12 / unitPx, (pitch * S) / 2);
      const chosen = (n: number) =>
        bedRange !== null &&
        n >= Math.min(...bedRange) &&
        n <= Math.max(...bedRange);
      const end = () => {
        const range = bedDrag.current;
        bedDrag.current = null;
        setBedRange(null);
        if (!range) return;
        const [lo, hi] = [Math.min(...range), Math.max(...range)];
        onBeds(
          [...new Set(sections.map(s => s.bed))].filter(b => b >= lo && b <= hi)
        );
      };
      beds.forEach(bed => {
        const n = bed.parts[0].bed;
        const cx = across
            ? -PLAN_MARGIN * 0.5 * S
            : ((bed.x0 + bed.x1) / 2) * S,
          cy = across ? ((bed.y0 + bed.y1) / 2) * S : -PLAN_MARGIN * 0.5 * S;
        nodes.push(
          <g
            key={`no${n}`}
            data-bed={n}
            role='button'
            aria-label={t(open ? 'planner.stripNo' : 'planner.bedNo', {
              n: n + 1,
            })}
            className='cursor-pointer'
            style={{ touchAction: 'none' }}
            onPointerDown={e => {
              e.stopPropagation();
              e.currentTarget.setPointerCapture(e.pointerId);
              bedDrag.current = [n, n];
              setBedRange([n, n]);
            }}
            onPointerMove={e => {
              const range = bedDrag.current;
              if (!range) return;
              const under = document
                .elementFromPoint(e.clientX, e.clientY)
                ?.closest('[data-bed]');
              const to = under ? Number(under.getAttribute('data-bed')) : null;
              if (to !== null && to !== range[1]) {
                bedDrag.current = [range[0], to];
                setBedRange([range[0], to]);
              }
            }}
            onPointerUp={end}
            onPointerCancel={() => {
              bedDrag.current = null;
              setBedRange(null);
            }}
            onClick={e => e.stopPropagation()}
          >
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill={chosen(n) ? MARK : '#fff'}
              stroke={MARK}
              strokeWidth={1.5}
              vectorEffect='non-scaling-stroke'
            />
            <text
              x={cx}
              y={cy}
              textAnchor='middle'
              dominantBaseline='central'
              pointerEvents='none'
              style={{
                font: `600 ${r * 1.05}px var(--font-sans)`,
                fill: chosen(n) ? '#fff' : '#782c0c',
              }}
            >
              {n + 1}
            </text>
          </g>
        );
      });
    }
    return nodes;
  };
  const plan = view === 'plan' ? drawPlan() : null;

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

  // What stands along the sides, as blocks outside the plot (the L's cut
  // corner whole); one between the plot and the viewer is cut to a sill.
  const blocks = wallsOf(garden)
    .filter(w => w.side !== 'corner')
    .map(w => {
      const d = SIDE_DEEP;
      const r: Rect =
        w.side === 'left'
          ? [w.x0 - d, w.y0, w.x0, w.y1]
          : w.side === 'right'
            ? [w.x0, w.y0, w.x0 + d, w.y1]
            : w.side === 'top'
              ? [w.x0, w.y0 - d, w.x1, w.y0]
              : [w.x0, w.y0, w.x1, w.y0 + d];
      const n = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] }[
        w.side as 'left' | 'right' | 'top' | 'bottom'
      ];
      return { r, kind: w.kind, n };
    })
    .concat(
      garden.shape === 'L' && garden.sides?.corner
        ? [
            {
              r: [W * L_CUT.width, L * L_CUT.length, W, L] as Rect,
              kind: garden.sides.corner,
              n: [1, 1],
            },
          ]
        : []
    )
    .map(({ r, kind, n }) => {
      const cx = (r[0] + r[2]) / 2,
        cy = (r[1] + r[3]) / 2;
      const near = depth(cx + n[0], cy + n[1]) > depth(cx, cy);
      return { r, kind, near, h: near ? SILL : SIDE_BLOCK[kind] };
    })
    .sort(
      (a, z) =>
        depth((a.r[0] + a.r[2]) / 2, (a.r[1] + a.r[3]) / 2) -
        depth((z.r[0] + z.r[2]) / 2, (z.r[1] + z.r[3]) / 2)
    );
  const block = (b: (typeof blocks)[number], k: number) =>
    box(
      b.r[0],
      b.r[1],
      b.r[2],
      b.r[3],
      0,
      b.h,
      SIDE[b.kind],
      SIDE_FACES[b.kind][0],
      SIDE_FACES[b.kind][1],
      `block${k}`
    );

  const regs = regions(garden).sort(
    (a, z) =>
      depth((a[0] + a[2]) / 2, (a[1] + a[3]) / 2) -
      depth((z[0] + z[2]) / 2, (z[1] + z[3]) / 2)
  );
  const drawn: ReactNode[] = [];
  let tallest = 0;
  if (!plan) {
    drawn.push(
      <defs key='textures'>
        <Texture
          id='iso-soil'
          name='soil'
          size={TILE.soil * S}
          transform={flat}
        />
        <Texture
          id='iso-gravel'
          name={
            raised ? 'gravel' : ground === 'ground' ? 'woodchip' : 'trodden'
          }
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
      </defs>
    );
    // Behind the plot, what stands along its far sides.
    blocks.forEach((b, k) => {
      if (!b.near) drawn.push(block(b, k));
    });
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
              onDoubleClick={onBed ? () => onBed(i) : undefined}
            />
          );
          const sun = sunAt?.(s);
          if (sun === 'part' || sun === 'little')
            drawn.push(
              <polygon
                key={`sun${i}`}
                points={top(s)}
                fill='#1f1a17'
                fillOpacity={sun === 'part' ? 0.16 : 0.34}
                pointerEvents='none'
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

    // In front, what stands along the near sides, as a sill.
    blocks.forEach((b, k) => {
      if (b.near) drawn.push(block(b, k));
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
              stroke='#782c0c'
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
  }

  const xs: number[] = [],
    ys: number[] = [];
  const m = blocks.length ? SIDE_DEEP : 0;
  const high = Math.max(
    BED_HEIGHT + tallest + 0.9,
    ...blocks.map(b => b.h + 0.2)
  );
  for (const [x, y] of [
    [-m, -m],
    [W + m, -m],
    [-m, L + m],
    [W + m, L + m],
  ])
    for (const z of [-0.12, high]) {
      const [px, py] = P(x, y, z);
      xs.push(px);
      ys.push(py);
    }
  // A small plot is not blown up: the view is at least MIN_VIEW wide.
  const padX = Math.max(0, MIN_VIEW - (Math.max(...xs) - Math.min(...xs))) / 2,
    padY =
      Math.max(0, MIN_VIEW * 0.6 - (Math.max(...ys) - Math.min(...ys))) / 2;
  const [minX, minY, maxX, maxY] = plan
    ? planBox
    : [
        Math.min(...xs) - 30 - padX,
        Math.min(...ys) - 10 - padY,
        Math.max(...xs) + 30 + padX,
        Math.max(...ys) + 24 + padY,
      ];
  // The needle points to true north: the plot's top faces `garden.north`.
  const bearing = ((garden.north ?? 0) * Math.PI) / 180;
  const n0 = P(0, 0),
    n1 = P(-Math.sin(bearing), -Math.cos(bearing));

  // The view is a window on the whole, moved by dragging: as far as a
  // corner of the garden in its middle, never off it.
  const w = maxX - minX,
    h = maxY - minY,
    vw = w / zoom,
    vh = h / zoom;
  const limit = ([x, y]: [number, number]): [number, number] => [
    Math.max(-w / 2, Math.min(w / 2, x)),
    Math.max(-h / 2, Math.min(h / 2, y)),
  ];
  const [px, py] = limit(pan);
  const zoomTo = (z: number) =>
    setZoom(
      Math.abs(z - 1) < 0.01 ? 1 : Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z))
    );
  const fitView = () => {
    setZoom(1);
    setPan([0, 0]);
  };
  // The plan's key: the colour of each family the garden grows.
  const families = plan
    ? [
        ...new Set(
          sections.flatMap(s => {
            if (!s.crop) return [];
            const family = familyOf(s.crop);
            return [
              GREEN_MANURE.has(s.crop)
                ? 'cover'
                : family && FAMILY[family]
                  ? family
                  : 'other',
            ];
          })
        ),
      ]
    : [];
  return (
    <>
      <div ref={frame} className='relative'>
        <svg
          role='img'
          aria-label={title}
          viewBox={`${minX + (w - vw) / 2 + px} ${minY + (h - vh) / 2 + py} ${vw} ${vh}`}
          className={cn(
            // Never its text selected: a drag would carry the text off
            // instead of moving the drawing.
            'block h-auto max-h-[38rem] w-full select-none',
            // Two fingers pinch the model, one scrolls the page; zoomed in or
            // with the hand, one finger moves the view (a mouse always does).
            area
              ? 'cursor-crosshair touch-none'
              : moving || zoom > 1
                ? 'cursor-grab touch-none active:cursor-grabbing'
                : 'cursor-grab touch-pan-y active:cursor-grabbing'
          )}
          onPointerDown={e => {
            // An area: in its mode, or a mouse with Shift held.
            if (onSelectArea && e.isPrimary && (area || e.shiftKey)) {
              const [x, y] = local(e.clientX, e.clientY);
              boxFrom.current = [x, y];
              setAreaBox([x, y, x, y]);
              e.currentTarget.setPointerCapture(e.pointerId);
              return;
            }
            fingers.current.set(e.pointerId, [e.clientX, e.clientY]);
            if (fingers.current.size === 2) {
              pinch.current = { d: spread(), zoom };
              drag.current = { x: 0, y: 0, pan: [px, py], moved: true };
              return;
            }
            if (zoom > 1 || moving || e.pointerType === 'mouse')
              drag.current = {
                x: e.clientX,
                y: e.clientY,
                pan: [px, py],
                moved: false,
              };
          }}
          onPointerMove={e => {
            if (boxFrom.current) {
              const [x, y] = local(e.clientX, e.clientY);
              setAreaBox([boxFrom.current[0], boxFrom.current[1], x, y]);
              return;
            }
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
            if (!d.moved && Math.abs(dx) + Math.abs(dy) > 4) {
              d.moved = true;
              // Moving: kept on the drawing past its edge (a tap still
              // lands on its section, never captured).
              e.currentTarget.setPointerCapture(e.pointerId);
            }
            // Model units a screen pixel: the drawing fills its width or, a
            // tall plan, its height, whichever it meets first.
            const k = Math.max(
              vw / e.currentTarget.clientWidth,
              vh / e.currentTarget.clientHeight
            );
            if (d.moved) setPan(limit([d.pan[0] - dx * k, d.pan[1] - dy * k]));
          }}
          onPointerUp={e => {
            const from = boxFrom.current;
            if (from) {
              boxFrom.current = null;
              setAreaBox(null);
              const [x, y] = local(e.clientX, e.clientY);
              // Barely moved: a tap, which selects as a tap does.
              if (Math.abs(x - from[0]) + Math.abs(y - from[1]) > 8) {
                onSelectArea?.(
                  inBox(e.currentTarget, [from[0], from[1], x, y])
                );
                drag.current = { x: 0, y: 0, pan: [px, py], moved: true };
                setTimeout(() => (drag.current = null));
              }
              return;
            }
            fingers.current.delete(e.pointerId);
            if (fingers.current.size < 2) pinch.current = null;
            setTimeout(() => (drag.current = null));
          }}
          onPointerCancel={e => {
            boxFrom.current = null;
            setAreaBox(null);
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
          // Nothing in the drawing is dragged off (a picture, a word): a drag
          // moves the drawing. Crops dragged onto it come from the palette.
          onDragStart={e => e.preventDefault()}
          onDragOver={e => {
            if (!onDropCrop || !e.dataTransfer.types.includes(CROP_DRAG))
              return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            const k = sectionAt(e);
            if (k !== over) setOver(k);
          }}
          onDragLeave={e => {
            if (!e.currentTarget.contains(e.relatedTarget as Node))
              setOver(null);
          }}
          onDrop={e => {
            e.preventDefault();
            setOver(null);
            const k = sectionAt(e);
            const crop = e.dataTransfer.getData(CROP_DRAG);
            if (k !== null && crop) onDropCrop?.(k, crop);
          }}
        >
          {plan ?? drawn}
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
        {areaBox ? (
          <div
            aria-hidden
            className='pointer-events-none absolute rounded-sm border-2 border-dashed border-primary bg-primary/10'
            style={{
              left: Math.min(areaBox[0], areaBox[2]),
              top: Math.min(areaBox[1], areaBox[3]),
              width: Math.abs(areaBox[2] - areaBox[0]),
              height: Math.abs(areaBox[3] - areaBox[1]),
            }}
          />
        ) : null}
        {/* The model or the plan from above. */}
        <div
          role='group'
          aria-label={t('planner.view.label')}
          className='absolute top-2 right-2 flex rounded-lg bg-card/90 p-0.5 elevation-raised'
        >
          {(['model', 'plan'] as const).map(v => (
            <button
              key={v}
              type='button'
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={cn(
                'focus-ring h-7 rounded-md px-2.5 text-xs font-medium sm:h-9 sm:px-3 sm:text-sm',
                view === v
                  ? 'bg-primary text-primary-foreground'
                  : 'text-foreground hover:bg-muted'
              )}
            >
              {t(`planner.view.${v}`)}
            </button>
          ))}
        </div>
        {/* The tools together: the hand moves the drawing, Select draws a box
          over sections (on a phone both are modes, a finger otherwise
          scrolling the page), and what is selected is cleared beside them. */}
        <div className='absolute bottom-2 left-2 flex max-w-[calc(100%-4rem)] flex-col items-start gap-1.5'>
          {area && onSelectArea ? (
            <p className='rounded-md bg-card/90 px-2 py-1 text-xs text-foreground elevation-raised'>
              {t('planner.area.hint')}{' '}
              <button
                type='button'
                onClick={() => onSelectArea(sections.map((_, i) => i))}
                className='focus-ring font-medium text-primary-text underline underline-offset-2'
              >
                {t('planner.area.all')}
              </button>
            </p>
          ) : null}
          <div className='flex flex-wrap items-center gap-1.5'>
            <ToolButton
              pressed={moving}
              label={t('planner.move')}
              onClick={() => setTool(moving ? null : 'move')}
            >
              <Hand className='size-4' />
            </ToolButton>
            {onSelectArea ? (
              <ToolButton
                pressed={area}
                label={t('planner.area.select')}
                onClick={() => setTool(area ? null : 'area')}
              >
                <SquareDashedMousePointer className='size-4' />
                {area ? t('planner.area.done') : t('planner.area.short')}
              </ToolButton>
            ) : null}
            {onClear && selected.length > 0 ? (
              <ToolButton label={t('planner.clearSelection')} onClick={onClear}>
                <X className='size-3.5' />
                {t('planner.clearSelection')}
              </ToolButton>
            ) : null}
          </div>
        </div>
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
          <Needle
            d={
              plan
                ? [-Math.sin(bearing), -Math.cos(bearing)]
                : [n1[0] - n0[0], n1[1] - n0[1]]
            }
          />
          {onTurnNorth ? (
            <ModelControl
              label={t('planner.northRight')}
              onClick={() => onTurnNorth(-45)}
            >
              <RotateCw className='size-4' />
            </ModelControl>
          ) : null}
        </div>
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
            disabled={zoom <= MIN_ZOOM}
            onClick={() => zoomTo(zoom / ZOOM_STEP)}
          >
            <ZoomOut className='size-4' />
          </ModelControl>
          <ModelControl
            label={t('planner.zoomFit')}
            disabled={zoom === 1 && px === 0 && py === 0}
            onClick={fitView}
          >
            <Maximize2 className='size-4' />
          </ModelControl>
        </div>
      </div>
      {families.length ? (
        <ul className='flex flex-wrap gap-x-4 gap-y-1 px-4 pt-2 text-xs text-muted-foreground'>
          {families.map(k => (
            <li key={k} className='flex items-center gap-1.5'>
              <span
                aria-hidden
                className='size-3 rounded-sm'
                style={{
                  background:
                    k === 'cover' ? COVER : k === 'other' ? OTHER : FAMILY[k],
                }}
              />
              {t(`planner.family.${k}`)}
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

/** A tool over the model, a map control's size: an icon (named by `label`),
 *  or words beside it; a mode (`pressed` given) shows when it is on. */
function ToolButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type='button'
      aria-pressed={pressed}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'focus-ring flex h-8 min-w-8 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-medium elevation-raised sm:h-10 sm:min-w-10 sm:px-2.5 sm:text-sm',
        pressed
          ? 'bg-primary text-primary-foreground'
          : 'bg-card/90 text-foreground hover:bg-card'
      )}
    >
      {children}
    </button>
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
