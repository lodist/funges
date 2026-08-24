import type { Meta, StoryObj } from '@storybook/react-vite';

/**
 * Foundations specimens for the color palette.
 *
 * These render the tokens rather than listing their values: the point of the
 * page is what a token *looks like* and what it is *for*, and a hex string
 * documents neither. Nothing here asserts on the raw oklch values — those are
 * implementation detail and change whenever the palette is retuned.
 */

const meta: Meta = {
  // The specimens are documentation, not components: `!dev` keeps them out of
  // the sidebar as standalone entries so the tier reads as six prose pages,
  // which is what the spec asked Foundations to be. The `test` tag is
  // untouched, so they still run in the Storybook Vitest project, and the
  // `.mdx` page still renders each one via `<Story of={...} />`.
  tags: ['!dev'],
  title: 'Foundations/Color palette',
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'The semantic color tokens, rendered as specimens. Flip the toolbar theme to see the dark values.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/** A token pair: a surface and the foreground meant to sit on it. */
type Pair = {
  name: string;
  surface: string;
  text: string;
  use: string;
};

const SEMANTIC_PAIRS: Pair[] = [
  {
    name: 'background / foreground',
    surface: '--background',
    text: '--foreground',
    use: 'The page itself. Body text sits on this.',
  },
  {
    name: 'card / card-foreground',
    surface: '--card',
    text: '--card-foreground',
    use: 'Discrete raised surfaces: Card, Input, Textarea.',
  },
  {
    name: 'popover / popover-foreground',
    surface: '--popover',
    text: '--popover-foreground',
    use: 'Floating surfaces: DropdownMenu, Select content, toasts.',
  },
  {
    name: 'primary / primary-foreground',
    surface: '--primary',
    text: '--primary-foreground',
    use: 'The brand green. Fills, rings and active states.',
  },
  {
    name: 'secondary / secondary-foreground',
    surface: '--secondary',
    text: '--secondary-foreground',
    use: 'A light green tint for secondary emphasis.',
  },
  {
    name: 'muted / muted-foreground',
    surface: '--muted',
    text: '--muted-foreground',
    use: 'De-emphasised surfaces and supporting copy.',
  },
  {
    name: 'accent / accent-foreground',
    surface: '--accent',
    text: '--accent-foreground',
    use: 'Warm tan tint. Hover states on neutral chrome.',
  },
  {
    name: 'destructive / destructive-foreground',
    surface: '--destructive',
    text: '--destructive-foreground',
    use: 'Danger and delete. The deepest green step — the palette carries no red.',
  },
];

const SIDEBAR_PAIRS: Pair[] = [
  {
    name: 'sidebar / sidebar-foreground',
    surface: '--sidebar',
    text: '--sidebar-foreground',
    use: 'The navigation shell surface.',
  },
  {
    name: 'sidebar-primary / sidebar-primary-foreground',
    surface: '--sidebar-primary',
    text: '--sidebar-primary-foreground',
    use: 'Emphasised nav affordances.',
  },
  {
    name: 'sidebar-accent / sidebar-accent-foreground',
    surface: '--sidebar-accent',
    text: '--sidebar-accent-foreground',
    use: 'Nav item hover and active tint.',
  },
];

/** Tokens with no foreground partner — they paint a line, not a surface. */
const LINE_TOKENS = [
  { name: '--border', use: 'Hairlines and component outlines.' },
  { name: '--input', use: 'Form control borders.' },
  { name: '--ring', use: 'Focus rings. Non-text, so a 3:1 floor applies.' },
];

const CHART_TOKENS = [
  '--chart-1',
  '--chart-2',
  '--chart-3',
  '--chart-4',
  '--chart-5',
];

const HAPPY_SCALE = [
  '--happy-50',
  '--happy-100',
  '--happy-300',
  '--happy-500',
  '--happy-600',
  '--happy-700',
  '--happy-900',
];

const STATUS_TOKENS = [
  { name: '--status-success', use: 'Confirmations and healthy state.' },
  {
    name: '--status-warning',
    use: 'Caution. Pair with --status-warning-text.',
  },
  { name: '--status-info', use: 'Neutral informational notices.' },
];

const PairSwatch = ({ pair }: { pair: Pair }) => (
  <div className='flex flex-col gap-2'>
    <div
      className='flex min-h-20 items-center rounded-xl border px-4 py-3 text-base font-semibold'
      style={{
        backgroundColor: `var(${pair.surface})`,
        color: `var(${pair.text})`,
      }}
    >
      {'Text on this surface'}
    </div>
    <p className='font-mono text-xs'>{pair.name}</p>
    <p className='text-muted-foreground text-xs'>{pair.use}</p>
  </div>
);

const BlockSwatch = ({ token, use }: { token: string; use?: string }) => (
  <div className='flex flex-col gap-2'>
    <div
      aria-hidden
      className='h-16 rounded-xl border'
      style={{ backgroundColor: `var(${token})` }}
    />
    <p className='font-mono text-xs'>{token}</p>
    {use ? <p className='text-muted-foreground text-xs'>{use}</p> : null}
  </div>
);

const Grid = ({ children }: { children: React.ReactNode }) => (
  <div className='grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3'>
    {children}
  </div>
);

export const SemanticPairs: Story = {
  render: () => (
    <Grid>
      {SEMANTIC_PAIRS.map(pair => (
        <PairSwatch key={pair.name} pair={pair} />
      ))}
    </Grid>
  ),
};

export const SidebarTokens: Story = {
  render: () => (
    <Grid>
      {SIDEBAR_PAIRS.map(pair => (
        <PairSwatch key={pair.name} pair={pair} />
      ))}
    </Grid>
  ),
};

export const LineAndFocusTokens: Story = {
  render: () => (
    <Grid>
      {LINE_TOKENS.map(token => (
        <BlockSwatch key={token.name} token={token.name} use={token.use} />
      ))}
    </Grid>
  ),
};

export const BrandScale: Story = {
  render: () => (
    <div className='flex flex-col gap-4'>
      <div className='grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7'>
        {HAPPY_SCALE.map(token => (
          <BlockSwatch key={token} token={token} />
        ))}
      </div>
      <p className='text-muted-foreground max-w-2xl text-sm'>
        {
          'The one hue in the palette. Severity is expressed as depth rather than as a change of hue, which is why --destructive points at the deepest step instead of a red. Steps 700 and 900 are the text-safe ones; 500 and 600 are fills.'
        }
      </p>
    </div>
  ),
};

export const ChartTokens: Story = {
  render: () => (
    <div className='grid grid-cols-2 gap-4 sm:grid-cols-5'>
      {CHART_TOKENS.map(token => (
        <BlockSwatch key={token} token={token} />
      ))}
    </div>
  ),
};

export const StatusTokens: Story = {
  render: () => (
    <Grid>
      {STATUS_TOKENS.map(token => (
        <BlockSwatch key={token.name} token={token.name} use={token.use} />
      ))}
    </Grid>
  ),
};

/**
 * The matrix: every semantic surface in one view, for reviewing the palette at
 * a glance rather than scrolling a list.
 */
export const AllTokens: Story = {
  render: () => (
    <div className='flex flex-col gap-8'>
      <Grid>
        {[...SEMANTIC_PAIRS, ...SIDEBAR_PAIRS].map(pair => (
          <PairSwatch key={pair.name} pair={pair} />
        ))}
      </Grid>
      <div className='grid grid-cols-2 gap-4 sm:grid-cols-5'>
        {[
          ...LINE_TOKENS.map(t => t.name),
          ...CHART_TOKENS,
          ...HAPPY_SCALE,
          ...STATUS_TOKENS.map(t => t.name),
        ].map(token => (
          <BlockSwatch key={token} token={token} />
        ))}
      </div>
    </div>
  ),
};
