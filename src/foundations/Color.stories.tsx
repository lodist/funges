import type { Meta, StoryObj } from '@storybook/tanstack-react';

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
    use: 'The brand green. Fills and active states — not text, and not the focus ring: it is 2.95:1 on the background.',
  },
  {
    name: 'background / primary-text',
    surface: '--background',
    text: '--primary-text',
    use: 'The theme-aware, text-safe brand colour. Every green link, label and icon. Its absence is why links used to reach for Tailwind blue-600.',
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
    use: 'Danger and delete. Hue 28, the fly agaric red — no other token may use it. Warning chrome, the only other colour off 150/90, borrows map ramp stops instead.',
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
  {
    name: '--ring',
    use: 'Focus rings. Non-text, so a 3:1 floor applies — which is why this is --happy-700 and not --primary (2.95:1).',
  },
  {
    name: '--sidebar-ring',
    use: 'Focus rings inside the sidebar. Same 3:1 floor, same value.',
  },
  {
    name: '--destructive-border',
    use: 'Boundary for the destructive fill, which is too dark to read against the dark ground on its own.',
  },
];

/** Species categories: five steps of the one hue, not five hues. Each sits at
 *  ~95% of the in-gamut chroma for its lightness, so the steps are as far apart
 *  as hue 150 allows. --chart-1…5 alias these, so charts and map markers cannot
 *  drift apart. Ship a category colour with its icon and label — lightness alone
 *  separates five series less well than hue did. */
const CATEGORY_TOKENS = [
  '--category-mushroom',
  '--category-berry',
  '--category-plant',
  '--category-flower',
  '--category-nut',
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

/** Success and info are not their own hues — both resolve to --primary-text.
 *  Only the safety warning sits outside the green, and it borrows the map score
 *  ramp rather than introducing an amber of its own. */
const STATUS_TOKENS = [
  {
    name: '--status-success',
    use: 'Confirmations and healthy state. Resolves to --primary-text.',
  },
  {
    name: '--status-info',
    use: 'Neutral informational notices. Also --primary-text — info is not blue here.',
  },
  {
    name: '--status-warning',
    use: 'Safety warnings only. A FILL: 14px text on it is 3.91:1, so callouts use --status-warning-background instead.',
  },
  {
    name: '--status-warning-background',
    use: 'The callout ground. --status-warning-text reads 10.21:1 here.',
  },
  {
    name: '--status-warning-text',
    use: 'Warning body text and icons. Map ramp stop 10 in light, stop 5 in dark.',
  },
  {
    name: '--status-warning-border',
    use: 'Warning callout edge. Map ramp stop 8.',
  },
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
          'The one hue in the palette, all seven steps at hue 150. Severity is depth rather than a change of hue, which is why --destructive points at the deepest step instead of a red — in both themes. Steps 700 and 900 are the text-safe ones; 500 and 600 are fills held to the 3:1 non-text floor. These steps are absolute and light-tuned: anything that has to work in dark mode reads --primary, --primary-text or --destructive instead.'
        }
      </p>
    </div>
  ),
};

export const CategoryTokens: Story = {
  render: () => (
    <div className='flex flex-col gap-4'>
      <div className='grid grid-cols-2 gap-4 sm:grid-cols-5'>
        {CATEGORY_TOKENS.map(token => (
          <BlockSwatch key={token} token={token} />
        ))}
      </div>
      <p className='text-muted-foreground max-w-2xl text-sm'>
        {
          'Species categories as five steps of the one hue, ordered light to dark: 12.09, 9.80, 7.23, 5.10 and 3.78 to 1 against the background. Read them through src/lib/categoryColor.ts, and always ship a category colour alongside its icon and label — lightness alone separates five series less well than five hues did.'
        }
      </p>
    </div>
  ),
};

export const ChartTokens: Story = {
  render: () => (
    <div className='flex flex-col gap-4'>
      <div className='grid grid-cols-2 gap-4 sm:grid-cols-5'>
        {CHART_TOKENS.map(token => (
          <BlockSwatch key={token} token={token} />
        ))}
      </div>
      <p className='text-muted-foreground max-w-2xl text-sm'>
        {
          'Aliases of the category tokens above, so a chart series and a map marker for the same species cannot disagree. These used to be a fourth green ramp that no product code referenced, while the charts drew from six hardcoded hexes.'
        }
      </p>
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
