import type { ReactNode } from 'react';
import {
  BED_HEIGHT,
  fit,
  regions,
  type Garden,
  type Section,
} from '@/lib/planner';
import { huertaImage } from '@/lib/huerta';
import { PLANT_LOOK, type PlantLook } from '@/lib/planner-data';

/**
 * The garden drawn as an architect's model (axonometric, turned a quarter at
 * a time) or as a flat plan: raised beds, and every plant as a simple form
 * at its real spacing. A planned crop is drawn pale; a planted one solid.
 * Colours are the model's own: it reads as a white model in either theme.
 */
const COS = Math.cos(Math.PI / 6);
const SIN = 0.5;
const S = 64; // pixels per metre
const MAX_GLYPHS = 180;
const PLOT = '#ece5db';
const SOIL = '#6c5544';
const TIMBER = ['#e5d5bb', '#cfba98', '#eadcc5'];
const MARK = '#c9603a';
const HI = 'rgba(255,255,255,0.3)';
/** Crops drawn as photographed plants: seen from the model's angle
 *  (huerta/iso) and from above (huerta/top). The rest keep their forms. */
const PHOTO = new Set([
  'garlic',
  'broad_beans',
  'peas',
  'cabbage',
  'lettuce',
  'tomato',
]);
const GROUND = (name: string) => huertaImage(`ground/${name}`);
/** Real-world size of one texture tile, metres. */
const TILE = { soil: 0.8, gravel: 0.6 };

export type ModelView = { mode: '3d' | 'plan'; turn: number };

interface GardenModelProps {
  garden: Garden;
  sections: Section[];
  selected: number;
  view: ModelView;
  onSelect: (index: number) => void;
  /** The label over the selected section: its crop and count. */
  label?: { name: string; count: string };
  /** A crop's name in the reader's language, for the plan's labels. */
  cropName: (id: string) => string;
  title: string;
}

const thin = <T,>(points: T[]) =>
  points.length <= MAX_GLYPHS
    ? points
    : points.filter((_, k) => k % Math.ceil(points.length / MAX_GLYPHS) === 0);

export function GardenModel({
  garden,
  sections,
  selected,
  view,
  onSelect,
  label,
  cropName,
  title,
}: GardenModelProps) {
  const { width: W, length: L } = garden;
  const turn = (x: number, y: number): [number, number] => {
    switch (view.turn % 4) {
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
      x0: parts[0].x0,
      x1: parts[0].x1,
      y0: Math.min(...parts.map(s => s.y0)),
      y1: Math.max(...parts.map(s => s.y1)),
    };
  });

  if (view.mode === 'plan') {
    const rect = (x0: number, y0: number, x1: number, y1: number) => {
      const [a0, b0] = turn(x0, y0),
        [a1, b1] = turn(x1, y1);
      return {
        x: Math.min(a0, a1) * S,
        y: Math.min(b0, b1) * S,
        width: Math.abs(a1 - a0) * S,
        height: Math.abs(b1 - b0) * S,
      };
    };
    const [VW, VL] = view.turn % 2 ? [L, W] : [W, L];
    const n0 = turn(0, 0),
      n1 = turn(0, -1);
    return (
      <svg
        role='img'
        aria-label={title}
        viewBox={`-50 -30 ${VW * S + 80} ${VL * S + 60}`}
        className='block h-auto w-full'
      >
        <defs>
          <Texture id='plan-soil' name='soil' size={TILE.soil * S} />
          <Texture id='plan-gravel' name='gravel' size={TILE.gravel * S} />
          <Texture id='plan-timber' name='timber' size={BED_HEIGHT * S} />
        </defs>
        {regions(garden).map(r => (
          <g key={r.join()}>
            <rect {...rect(...r)} fill={PLOT} />
            <rect {...rect(...r)} fill='url(#plan-gravel)' />
          </g>
        ))}
        {beds.map(b => (
          <g key={b.parts[0].bed}>
            <rect
              {...rect(b.x0, b.y0, b.x1, b.y1)}
              fill={SOIL}
              stroke={TIMBER[0]}
              strokeWidth={5}
              rx={3}
            />
            <rect
              {...rect(b.x0, b.y0, b.x1, b.y1)}
              fill='url(#plan-soil)'
              stroke='url(#plan-timber)'
              strokeWidth={5}
              rx={3}
            />
          </g>
        ))}
        {sections.map((s, i) => {
          const look = s.crop ? PLANT_LOOK[s.crop] : null;
          const f = fit(s);
          const [ca, cb] = turn((s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2);
          return (
            <g
              key={`${s.bed}-${s.y0}`}
              onClick={select(i)}
              className='cursor-pointer'
              opacity={s.planted ? 1 : 0.6}
            >
              <rect {...rect(s.x0, s.y0, s.x1, s.y1)} fill='transparent' />
              {look && f && PHOTO.has(s.crop!)
                ? thin(f.points).map(([x, y]) => {
                    const [a, b] = turn(x, y);
                    const w = Math.min(f.spacing, f.across) * S * 1.15;
                    return (
                      <image
                        key={`${x}-${y}`}
                        href={huertaImage(`top/${s.crop}`)}
                        x={a * S - w / 2}
                        y={b * S - w / 2}
                        width={w}
                        height={w}
                      />
                    );
                  })
                : look && f
                  ? thin(f.points).map(([x, y]) => {
                      const [a, b] = turn(x, y);
                      const r = Math.max(
                        (Math.min(f.spacing, f.across) / 2) * S * 0.85,
                        2.5
                      );
                      return (
                        <g key={`${x}-${y}`}>
                          <circle
                            cx={a * S}
                            cy={b * S}
                            r={r}
                            fill={look.leaf}
                          />
                          {look.accent ? (
                            <circle
                              cx={a * S}
                              cy={b * S}
                              r={r * 0.45}
                              fill={look.accent}
                            />
                          ) : null}
                        </g>
                      );
                    })
                  : null}
              {look && !f ? (
                <rect
                  {...rect(s.x0 + 0.05, s.y0 + 0.05, s.x1 - 0.05, s.y1 - 0.05)}
                  fill={look.leaf}
                  opacity={0.85}
                />
              ) : null}
              {s.crop ? (
                <text
                  x={ca * S}
                  y={cb * S + 4}
                  textAnchor='middle'
                  className='pointer-events-none'
                  style={{
                    font: '600 11px var(--font-sans)',
                    fill: '#fff',
                    paintOrder: 'stroke',
                    stroke: 'rgba(40,28,20,.55)',
                    strokeWidth: 3,
                  }}
                >
                  {cropName(s.crop)}
                </text>
              ) : null}
            </g>
          );
        })}
        {sections[selected] ? (
          <rect
            {...rect(
              sections[selected].x0,
              sections[selected].y0,
              sections[selected].x1,
              sections[selected].y1
            )}
            fill='none'
            stroke={MARK}
            strokeWidth={2.5}
            pointerEvents='none'
          />
        ) : null}
        <North x={-26} y={30} d={[n1[0] - n0[0], n1[1] - n0[1]]} />
      </svg>
    );
  }

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
  // The textures laid on the model's planes: the ground, and a bed's two
  // visible sides (each its own tiling, so the boards meet the bed's foot).
  const flat = `matrix(${COS} ${SIN} ${-COS} ${SIN} 0 0)`;
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
    const h = BED_HEIGHT;
    const right = pts([V(A1, B0, 0), V(A1, B1, 0), V(A1, B1, h), V(A1, B0, h)]);
    return (
      <g key={key} pointerEvents='none'>
        <defs>
          <Texture
            id={`${key}-r`}
            name='timber'
            size={h * S}
            transform={`matrix(${-COS} ${SIN} 0 1 ${A1 * COS * S} ${A1 * SIN * S})`}
          />
          <Texture
            id={`${key}-l`}
            name='timber'
            size={h * S}
            transform={`matrix(${COS} ${SIN} 0 1 ${-B1 * COS * S} ${B1 * SIN * S})`}
          />
        </defs>
        <polygon points={right} fill={`url(#${key}-r)`} />
        <polygon points={right} fill='rgba(50,32,18,0.2)' />
        <polygon
          points={pts([V(A0, B1, 0), V(A1, B1, 0), V(A1, B1, h), V(A0, B1, h)])}
          fill={`url(#${key}-l)`}
        />
        <polygon
          points={pts([V(A0, B0, h), V(A1, B0, h), V(A1, B1, h), V(A0, B1, h)])}
          fill='url(#iso-soil)'
          stroke={TIMBER[2]}
          strokeWidth={3}
          strokeLinejoin='round'
        />
      </g>
    );
  };
  const top = (s: Section) =>
    pts([
      P(s.x0, s.y0, BED_HEIGHT),
      P(s.x1, s.y0, BED_HEIGHT),
      P(s.x1, s.y1, BED_HEIGHT),
      P(s.x0, s.y1, BED_HEIGHT),
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
        name='gravel'
        size={TILE.gravel * S}
        transform={flat}
      />
    </defs>,
  ];
  regs.forEach((r, i) =>
    drawn.push(
      box(
        r[0],
        r[1],
        r[2],
        r[3],
        -0.12,
        0,
        PLOT,
        '#ddd4c7',
        '#d0c6b7',
        `slab${i}`
      )
    )
  );
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
  let tallest = 0;
  beds
    .sort(
      (a, z) =>
        depth((a.x0 + a.x1) / 2, (a.y0 + a.y1) / 2) -
        depth((z.x0 + z.x1) / 2, (z.y0 + z.y1) / 2)
    )
    .forEach((bed, bi) => {
      drawn.push(
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
          `bed${bi}`,
          TIMBER[2]
        ),
        skin(bed.x0, bed.y0, bed.x1, bed.y1, `skin${bi}`)
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
            onClick={select(i)}
          />
        );
        if (!s.crop) continue;
        const crop = s.crop;
        const look = PLANT_LOOK[crop];
        tallest = Math.max(tallest, look.height);
        const f = fit(s);
        const opacity = s.planted ? 1 : 0.6;
        if (!f)
          carpet(s, i, look).forEach(([x, y, h, flower]) => {
            const [bx, by] = P(x, y, BED_HEIGHT);
            plants.push({
              d: depth(x, y),
              node: (
                <g
                  key={`c${i}-${x}-${y}`}
                  opacity={opacity}
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
          thin(f.points).forEach(([x, y]) =>
            plants.push({
              d: depth(x, y),
              node: (
                <g
                  key={`p${i}-${x}-${y}`}
                  opacity={opacity}
                  onClick={select(i)}
                  className='cursor-pointer'
                >
                  {PHOTO.has(crop) ? (
                    <Photo
                      id={crop}
                      at={P(x, y, BED_HEIGHT)}
                      d={Math.min(f.spacing, f.across)}
                    />
                  ) : (
                    <Plant
                      look={look}
                      at={P(x, y, BED_HEIGHT)}
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

  const sel = sections[selected];
  if (sel) {
    drawn.push(
      <polygon
        key='mark'
        points={top(sel)}
        fill='none'
        stroke={MARK}
        strokeWidth={2.5}
        pointerEvents='none'
      />
    );
    if (sel.crop && label) {
      const [lx, ly] = P(
        (sel.x0 + sel.x1) / 2,
        (sel.y0 + sel.y1) / 2,
        BED_HEIGHT + PLANT_LOOK[sel.crop].height + 0.35
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
  const minX = Math.min(...xs) - 30,
    maxX = Math.max(...xs) + 30,
    minY = Math.min(...ys) - 10,
    maxY = Math.max(...ys) + 24;
  const n0 = P(0, 0),
    n1 = P(0, -1);
  return (
    <svg
      role='img'
      aria-label={title}
      viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}
      className='block h-auto max-h-[38rem] w-full'
    >
      {drawn}
      <North x={minX + 30} y={minY + 34} d={[n1[0] - n0[0], n1[1] - n0[1]]} />
    </svg>
  );
}

function North({ x, y, d }: { x: number; y: number; d: [number, number] }) {
  const len = Math.hypot(d[0], d[1]) || 1;
  const ux = d[0] / len,
    uy = d[1] / len;
  return (
    <g pointerEvents='none'>
      <line
        x1={x}
        y1={y}
        x2={x + ux * 22}
        y2={y + uy * 22}
        stroke='#776c64'
        strokeWidth={1.5}
      />
      <circle cx={x + ux * 22} cy={y + uy * 22} r={2.5} fill='#776c64' />
      <text
        x={x + ux * 34 - 4}
        y={y + uy * 34 + 4}
        style={{ font: '700 11px var(--font-sans)', fill: '#776c64' }}
      >
        N
      </text>
    </g>
  );
}

/** A texture tiled over a surface; `transform` lays it on a plane of the model. */
function Texture({
  id,
  name,
  size,
  transform,
}: {
  id: string;
  name: string;
  size: number;
  transform?: string;
}) {
  return (
    <pattern
      id={id}
      patternUnits='userSpaceOnUse'
      width={size}
      height={size}
      patternTransform={transform}
    >
      <image href={GROUND(name)} width={size} height={size} />
    </pattern>
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
