import type { Meta, StoryObj } from '@storybook/tanstack-react';

import {
  TOOLTIP_CURSOR_BAND,
  TOOLTIP_CURSOR_LINE,
  TOOLTIP_STYLE,
} from '@/lib/chart-chrome';

/**
 * Pattern: chart chrome — the tooltip surface and the two hover cursors.
 *
 * Everything around the data on the Data page: the box that follows the
 * pointer, and the shape that marks which column or date it is reading.
 *
 * **Recharts ships its own colours and merges only what a prop names**, so any
 * surface left unset paints a value this system does not have — `#fff` behind
 * the tooltip, `#ccc` for the cursor. Both are cool greys, which The Warm
 * Ground Rule bans in either theme, and neither is reachable from a stylesheet:
 * they arrive as inline SVG and style attributes. That is why these are plain
 * objects in `@/lib/chart-chrome` rather than CSS, and why the guard test reads
 * the call sites as well as the values — a chart added without a `cursor` prop
 * silently gets the grey block back.
 *
 * The tooltip previously set border, radius, shadow and padding but no ground,
 * so white showed through. In dark mode that was worse than untidy: the series
 * values inside are drawn in their own stroke colour, and the dark chart tokens
 * are bright by design, so they landed on white at roughly 1.4:1.
 *
 * Two cursor shapes, because the charts are two kinds. Category charts (bars)
 * get a **band** the width of the category, with the bars' own corner radius.
 * Continuous charts (lines, areas) get a **hairline**, because a filled block
 * behind a line reads as data.
 *
 * Both fill from `--border`. `--muted` is the semantic pick for a muted fill,
 * but it sits 0.037 from `--card` in dark and the band all but disappeared;
 * `--border` is the strongest neutral step below a real surface and roughly
 * doubles that, staying hue 90 in both themes. Flip the toolbar theme.
 */

const meta: Meta = {
  title: 'Molecules/Chart chrome',
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'The Data page’s tooltip surface and hover cursors — the Recharts chrome that ships hardcoded greys unless every prop is named.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Keyed by date rather than index: two days share a 0 mm reading, so the value
// alone is not unique and the index is not a stable identity.
const BARS = [
  { date: '08/28', mm: 0 },
  { date: '08/29', mm: 2 },
  { date: '08/30', mm: 6 },
  { date: '08/31', mm: 11 },
  { date: '09/01', mm: 4 },
  { date: '09/02', mm: 1 },
  { date: '09/03', mm: 0 },
  { date: '09/04', mm: 3 },
  { date: '09/05', mm: 8 },
  { date: '09/06', mm: 2 },
];
const LINE = [17.4, 16.9, 16.4, 16.2, 16, 15.9, 15.8, 15.9, 15.7, 15.8];
const HOVER = 3;

const W = 320;
const H = 96;
const BAND = W / BARS.length;

/** The band cursor as Recharts paints it: behind the bars, spanning the
 *  category, at the width of the slot rather than the bar. */
const BandChart = ({ legacy = false }: { legacy?: boolean }) => (
  <svg viewBox={`0 0 ${W} ${H}`} className='w-full' aria-hidden='true'>
    <rect
      x={HOVER * BAND}
      y={0}
      width={BAND}
      height={H}
      rx={legacy ? 0 : TOOLTIP_CURSOR_BAND.radius}
      fill={legacy ? '#ccc' : TOOLTIP_CURSOR_BAND.fill}
    />
    {BARS.map(({ date, mm }, i) => (
      <rect
        key={date}
        x={i * BAND + 4}
        y={H - (mm / 12) * H}
        width={BAND - 8}
        height={(mm / 12) * H}
        rx={3}
        fill='var(--chart-cool)'
        opacity={0.9}
      />
    ))}
  </svg>
);

const LineChart = ({ legacy = false }: { legacy?: boolean }) => (
  <svg viewBox={`0 0 ${W} ${H}`} className='w-full' aria-hidden='true'>
    <line
      x1={HOVER * BAND + BAND / 2}
      y1={0}
      x2={HOVER * BAND + BAND / 2}
      y2={H}
      stroke={legacy ? '#ccc' : TOOLTIP_CURSOR_LINE.stroke}
      strokeWidth={TOOLTIP_CURSOR_LINE.strokeWidth}
      strokeDasharray={legacy ? undefined : TOOLTIP_CURSOR_LINE.strokeDasharray}
    />
    <path
      d={LINE.map(
        (value, i) =>
          `${i ? 'L' : 'M'}${(i / (LINE.length - 1)) * W},${
            H - ((value - 15) / 3) * H
          }`
      ).join('')}
      fill='none'
      stroke='var(--chart-warm)'
      strokeWidth={1.5}
      strokeDasharray='6 3'
    />
  </svg>
);

const Tooltip = () => (
  <div style={TOOLTIP_STYLE} className='inline-block'>
    <div>{'Aug 31'}</div>
    <div style={{ color: 'var(--chart-cool)' }}>{'Rainfall 11 mm'}</div>
  </div>
);

const Frame = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <div className='flex flex-col gap-2'>
    <span className='type-micro text-muted-foreground'>{label}</span>
    <div className='bg-card rounded-card p-4'>{children}</div>
  </div>
);

export const TooltipSurface: Story = {
  render: () => (
    <div className='flex flex-col gap-4'>
      <Frame label='Tooltip on the card ground'>
        <Tooltip />
      </Frame>
      <p className='text-muted-foreground max-w-2xl text-sm'>
        {
          'The popover surface and foreground, not Recharts’ white. The series value keeps its own stroke colour, which is why the ground matters: the dark chart tokens are bright by design and were landing on white at roughly 1.4:1.'
        }
      </p>
    </div>
  ),
};

export const BandCursor: Story = {
  render: () => (
    <div className='flex flex-col gap-4'>
      <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
        <Frame label='Before — Recharts default #ccc'>
          <BandChart legacy />
        </Frame>
        <Frame label='After — --border band'>
          <BandChart />
        </Frame>
      </div>
      <p className='text-muted-foreground max-w-2xl text-sm'>
        {
          'Bar and composed charts. The band spans the category slot rather than the bar, and takes the bars’ own corner radius so the hover reads as designed rather than as a default rectangle.'
        }
      </p>
    </div>
  ),
};

export const HairlineCursor: Story = {
  render: () => (
    <div className='flex flex-col gap-4'>
      <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
        <Frame label='Before — Recharts default #ccc'>
          <LineChart legacy />
        </Frame>
        <Frame label='After — --border hairline'>
          <LineChart />
        </Frame>
      </div>
      <p className='text-muted-foreground max-w-2xl text-sm'>
        {
          'Line and area charts get a dashed hairline instead. A filled block behind a line reads as data — the band shape belongs to categories, where the slot is the thing being pointed at.'
        }
      </p>
    </div>
  ),
};
