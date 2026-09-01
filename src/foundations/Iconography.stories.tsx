import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import * as icons from '@/lib/icons';
import {
  Check,
  Download,
  Info,
  Leaf,
  MapPin,
  Navigation,
  X,
} from '@/lib/icons';

/**
 * Foundations specimens for iconography.
 *
 * The set is Lucide, reached through one wrapper (`src/lib/icons.tsx`) that
 * settles the decorative-vs-named question once. The conventions worth
 * documenting are the sizing steps, the stroke weight, and that contract,
 * since those are what drift when each screen picks its own.
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
          'The icon set, the sizing steps, the stroke conventions, and the accessibility contract that keep icons looking and behaving like one family.',
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
    use: 'Inline with text-xs, and inside a Badge — where it is applied for you.',
  },
  {
    className: 'size-4',
    label: 'size-4 · 16px',
    use: 'The default. Inline with body text, and inside a Button — applied for you there too.',
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
    size: 'size-8',
    label: 'strokeWidth 1.5 · at 32px',
    onFill: false,
    use: 'Large sizes, where the nominal 2 reads heavy.',
  },
  {
    width: 2,
    size: 'size-4',
    label: 'strokeWidth 2 · at 16px',
    onFill: false,
    use: 'The default, and the answer almost always.',
  },
  {
    width: 2.5,
    size: 'size-3',
    label: 'strokeWidth 2.5 · at 12px, on a fill',
    onFill: true,
    use: 'Small sizes that have to hold up against a filled surface.',
  },
];

/**
 * Every component export of `@/lib/icons`, deduplicated by the glyph it draws —
 * Lucide ships `X` and `XIcon` as two names for one drawing, and a specimen
 * that lists both is noise. Derived rather than hand-listed: the previous
 * hand-written array had drifted to 26 of the 64 icons the application imports,
 * and listed one (`Star`) that nothing used.
 */
const ALL_ICONS = Object.entries(icons)
  .filter(
    (entry): entry is [string, icons.LucideIcon] =>
      typeof entry[1] === 'function'
  )
  .reduce<{ name: string; glyph: string; Icon: icons.LucideIcon }[]>(
    (acc, [name, Icon]) => {
      const glyph = (Icon as { displayName?: string }).displayName ?? name;
      const seen = acc.find(entry => entry.glyph === glyph);
      if (!seen) acc.push({ name, glyph, Icon });
      else if (name.length < seen.name.length) seen.name = name;
      return acc;
    },
    []
  )
  .sort((a, b) => a.name.localeCompare(b.name));

export const Sizes: Story = {
  render: () => (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-col gap-4'>
        {SIZES.map(size => (
          <div key={size.className} className='flex items-center gap-4'>
            {/* One 24px box, glyphs bottom-aligned: every step then shares a
                baseline and a left edge. Centring each glyph in its own box
                makes the ramp harder to compare, not easier. */}
            <div className='flex size-6 items-end justify-start'>
              <MapPin className={size.className} />
            </div>
            <div className='flex flex-col'>
              <p className='font-mono text-xs'>{size.label}</p>
              <p className='text-muted-foreground text-xs'>{size.use}</p>
            </div>
          </div>
        ))}
      </div>
      <p className='text-muted-foreground max-w-2xl text-sm'>
        {
          'Write the step as size-N, never as h-N w-N. Button forces 16px on any descendant SVG whose class does not contain "size-", and that guard outranks h-5 on specificity, so an icon written h-5 w-5 inside a Button silently renders at 16px while size-5 escapes the guard and renders at 20px. Badge forces 12px on its direct SVG children and wins even against size-5 — but an icon wrapped in a span escapes it and gets no size at all.'
        }
      </p>
    </div>
  ),
};

export const Stroke: Story = {
  render: () => (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-col gap-4'>
        {STROKES.map(stroke => (
          <div key={stroke.label} className='flex items-center gap-4'>
            <div className='flex size-8 items-center justify-start'>
              {stroke.onFill ? (
                <span className='bg-primary text-primary-foreground flex size-5 items-center justify-center rounded-full'>
                  <Leaf className={stroke.size} strokeWidth={stroke.width} />
                </span>
              ) : (
                <Leaf className={stroke.size} strokeWidth={stroke.width} />
              )}
            </div>
            <div className='flex flex-col'>
              <p className='font-mono text-xs'>{stroke.label}</p>
              <p className='text-muted-foreground text-xs'>{stroke.use}</p>
            </div>
          </div>
        ))}
      </div>
      <p className='text-muted-foreground max-w-2xl text-sm'>
        {
          'Each width is drawn at the size it is for, because that is the only way the choice is legible — all three at 32px shows the axis and hides the reason. Nothing in the application sets strokeWidth on an icon today; the six occurrences in src are Recharts line weights. This section exists so the first screen that needs to deviate deviates the same way as the second.'
        }
      </p>
    </div>
  ),
};

export const ColorAndAlignment: Story = {
  render: () => (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-col gap-3'>
        <p className='flex items-center gap-2 text-sm'>
          <Info className='size-4' />
          {
            'An icon inherits currentColor — it needs no color class of its own.'
          }
        </p>
        <p className='text-muted-foreground flex items-center gap-2 text-sm'>
          <Info className='size-4' />
          {'The same icon inside muted text, picking up the muted color.'}
        </p>
      </div>
      <div className='flex max-w-lg flex-col gap-3'>
        <p className='flex items-center gap-2 text-sm'>
          <Info className='size-4 shrink-0' />
          {'One line: items-center lands the glyph on the optical centre.'}
        </p>
        <p className='flex items-start gap-2 text-sm'>
          <Info className='mt-0.5 size-4 shrink-0' />
          {
            'More than one line: items-center would centre the glyph against the whole block instead of the text it introduces, so switch to items-start and nudge by mt-0.5 to land on the first line. Without the nudge it sits a hair high, because a 16px glyph is taller than the cap height beside it.'
          }
        </p>
      </div>
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
          'An icon that needs its own color class is usually a sign the surrounding text color is wrong. Status is the exception, and it comes from the status tokens rather than a hand-picked hue.'
        }
      </p>
    </div>
  ),
};

/**
 * The accessibility contract, which belongs to `@/lib/icons` rather than to any
 * single screen.
 */
export const Accessibility: Story = {
  render: () => (
    <div className='flex max-w-2xl flex-col gap-6'>
      <div className='flex flex-col items-start gap-2'>
        <Button variant='outline'>
          <X />
          {'Close'}
        </Button>
        <p className='text-muted-foreground font-mono text-xs'>
          {'<X /> → aria-hidden="true" — the label beside it already says it'}
        </p>
      </div>
      <div className='flex flex-col items-start gap-2'>
        <Button variant='outline' size='icon' aria-label='Close'>
          <X />
        </Button>
        <p className='text-muted-foreground font-mono text-xs'>
          {'<Button aria-label="Close"><X /></Button> — nothing else names it'}
        </p>
      </div>
      <p className='text-muted-foreground text-sm'>
        {
          'Neither ARIA attribute is written at the call site. Lucide sets none at all, so @/lib/icons applies aria-hidden to an icon that carries no name and role="img" to one that does, and lucide-react is ESLint-banned everywhere else so the next icon added cannot skip the contract. What stays at the call site is the one thing a wrapper cannot infer: whether the control around the icon has a name of its own.'
        }
      </p>
    </div>
  ),
};

/** The matrix: every glyph the design system exposes. */
export const AllIcons: Story = {
  render: () => (
    <div className='grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-6'>
      {ALL_ICONS.map(({ Icon, name }) => (
        <div
          key={name}
          className='flex flex-col items-center gap-2 rounded-xl border p-3'
        >
          <Icon className='size-5' />
          <p className='text-muted-foreground text-center font-mono text-xs'>
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
          'Read from the exports of @/lib/icons rather than hand-listed, so it cannot drift the way the previous slice did — that one had gone stale at 26 of the 64 icons the application imports. Lucide ships well over a thousand glyphs; this is the set the barrel exposes, which is the set the application uses.',
      },
    },
  },
};
