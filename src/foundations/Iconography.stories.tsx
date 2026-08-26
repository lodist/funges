import type { Meta, StoryObj } from '@storybook/tanstack-react';
import {
  AlertTriangle,
  BarChart2,
  BookOpen,
  Calendar,
  Check,
  ChefHat,
  ChevronRight,
  Clock,
  Copy,
  Database,
  Download,
  ExternalLink,
  Heart,
  Info,
  Leaf,
  Map,
  MapPin,
  Navigation,
  RefreshCw,
  ScanSearch,
  Search,
  Settings,
  Star,
  Users,
  WifiOff,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

/**
 * Foundations specimens for iconography.
 *
 * The set is Lucide, whole and unmodified — the conventions worth documenting
 * are the sizing steps and the stroke weight, since those are what drift when
 * each screen picks its own.
 */

const meta: Meta = {
  // The specimens are documentation, not components: `!dev` keeps them out of
  // the sidebar as standalone entries so the tier reads as six prose pages,
  // which is what the spec asked Foundations to be. The `test` tag is
  // untouched, so they still run in the Storybook Vitest project, and the
  // `.mdx` page still renders each one via `<Story of={...} />`.
  tags: ['!dev'],
  title: 'Foundations/Iconography',
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'The icon set, the sizing steps, and the stroke conventions that keep icons looking like one family.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

const SIZES = [
  {
    className: 'size-3',
    label: 'size-3 · 12px',
    use: 'Inside a Badge. Applied automatically — do not set it yourself.',
  },
  {
    className: 'size-4',
    label: 'size-4 · 16px',
    use: 'The default. Inline with body text and inside buttons.',
  },
  {
    className: 'size-5',
    label: 'size-5 · 20px',
    use: 'Navigation items and anything that needs to read at a glance.',
  },
  {
    className: 'size-6',
    label: 'size-6 · 24px',
    use: 'Standalone affordances with no adjacent label.',
  },
];

const STROKES = [
  {
    width: 1.5,
    label: 'strokeWidth 1.5',
    use: 'Large sizes, where 2 looks heavy.',
  },
  {
    width: 2,
    label: 'strokeWidth 2 (default)',
    use: 'Everything, unless you have a reason.',
  },
  {
    width: 2.5,
    label: 'strokeWidth 2.5',
    use: 'Small sizes that need to hold up against a fill.',
  },
];

const SAMPLE_ICONS = [
  { Icon: Search, name: 'Search' },
  { Icon: MapPin, name: 'MapPin' },
  { Icon: Map, name: 'Map' },
  { Icon: Navigation, name: 'Navigation' },
  { Icon: ChefHat, name: 'ChefHat' },
  { Icon: Leaf, name: 'Leaf' },
  { Icon: Heart, name: 'Heart' },
  { Icon: Star, name: 'Star' },
  { Icon: Info, name: 'Info' },
  { Icon: AlertTriangle, name: 'AlertTriangle' },
  { Icon: Check, name: 'Check' },
  { Icon: X, name: 'X' },
  { Icon: Clock, name: 'Clock' },
  { Icon: Calendar, name: 'Calendar' },
  { Icon: Users, name: 'Users' },
  { Icon: Download, name: 'Download' },
  { Icon: Copy, name: 'Copy' },
  { Icon: RefreshCw, name: 'RefreshCw' },
  { Icon: Database, name: 'Database' },
  { Icon: BarChart2, name: 'BarChart2' },
  { Icon: BookOpen, name: 'BookOpen' },
  { Icon: Settings, name: 'Settings' },
  { Icon: ScanSearch, name: 'ScanSearch' },
  { Icon: WifiOff, name: 'WifiOff' },
  { Icon: ExternalLink, name: 'ExternalLink' },
  { Icon: ChevronRight, name: 'ChevronRight' },
];

export const Sizes: Story = {
  render: () => (
    <div className='flex flex-col gap-6'>
      {SIZES.map(size => (
        <div key={size.className} className='flex items-center gap-4'>
          <div className='flex w-16 justify-center'>
            <MapPin aria-hidden className={size.className} />
          </div>
          <div className='flex flex-col'>
            <p className='font-mono text-xs'>{size.label}</p>
            <p className='text-muted-foreground text-xs'>{size.use}</p>
          </div>
        </div>
      ))}
      <p className='text-muted-foreground max-w-2xl text-sm'>
        {
          'Button and Badge size their icons themselves — Button forces 16px on any child SVG without an explicit size class, Badge forces 12px. Setting a size inside either one is either redundant or a fight with the component.'
        }
      </p>
    </div>
  ),
};

export const Stroke: Story = {
  render: () => (
    <div className='flex flex-col gap-6'>
      {STROKES.map(stroke => (
        <div key={stroke.label} className='flex items-center gap-4'>
          <div className='flex w-16 justify-center'>
            <Leaf aria-hidden className='size-8' strokeWidth={stroke.width} />
          </div>
          <div className='flex flex-col'>
            <p className='font-mono text-xs'>{stroke.label}</p>
            <p className='text-muted-foreground text-xs'>{stroke.use}</p>
          </div>
        </div>
      ))}
      <p className='text-muted-foreground max-w-2xl text-sm'>
        {
          'Lucide draws at a nominal 2. Deviating is legitimate at the extremes of the size scale and nowhere else — a screen that sets 1.5 at 16px just has lighter icons than every other screen.'
        }
      </p>
    </div>
  ),
};

export const ColorAndAlignment: Story = {
  render: () => (
    <div className='flex flex-col gap-6'>
      <p className='flex items-center gap-2 text-sm'>
        <Info aria-hidden className='size-4' />
        {'An icon inherits currentColor — it needs no color class of its own.'}
      </p>
      <p className='text-muted-foreground flex items-center gap-2 text-sm'>
        <Info aria-hidden className='size-4' />
        {'The same icon inside muted text, picking up the muted color.'}
      </p>
      <div className='flex flex-wrap items-center gap-3'>
        <Button size='sm'>
          <Download />
          {'In a button'}
        </Button>
        <Badge>
          <Check />
          {'In a badge'}
        </Badge>
        <Button size='icon' variant='outline' aria-label='Locate me'>
          <Navigation />
        </Button>
      </div>
      <p className='text-muted-foreground max-w-2xl text-sm'>
        {
          'Two accessibility rules, and they are not interchangeable. An icon beside a text label is decorative: mark it aria-hidden so a screen reader does not announce it twice. An icon that is the whole control needs the control to carry an aria-label, because nothing else names it.'
        }
      </p>
    </div>
  ),
};

/** The matrix: the icons the application actually draws from. */
export const AllIcons: Story = {
  render: () => (
    <div className='grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-6'>
      {SAMPLE_ICONS.map(({ Icon, name }) => (
        <div
          key={name}
          className='flex flex-col items-center gap-2 rounded-xl border p-3'
        >
          <Icon aria-hidden className='size-5' />
          <p className='text-muted-foreground text-center font-mono text-[10px]'>
            {name}
          </p>
        </div>
      ))}
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'A representative slice of the set — the icons the application draws from most. Lucide ships well over a thousand; this is not a whitelist, it is what is already in use.',
      },
    },
  },
};
