import type { Meta, StoryObj } from '@storybook/react-vite';

/**
 * Foundations specimens for the radius and spacing scales.
 *
 * Both are derived rather than enumerated — one base value with the steps
 * computed off it — so the specimens show the resulting shapes rather than
 * restating the arithmetic.
 */

const meta: Meta = {
  // The specimens are documentation, not components: `!dev` keeps them out of
  // the sidebar as standalone entries so the tier reads as six prose pages,
  // which is what the spec asked Foundations to be. The `test` tag is
  // untouched, so they still run in the Storybook Vitest project, and the
  // `.mdx` page still renders each one via `<Story of={...} />`.
  tags: ['!dev'],
  title: 'Foundations/Radius and spacing',
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'The corner radius scale and the spacing rhythm, both as live specimens.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

const RADII = [
  {
    className: 'rounded-sm',
    token: '--radius-sm',
    formula: 'radius − 4px',
    use: 'Tight inner chrome. Rarely the right answer on its own.',
  },
  {
    className: 'rounded-md',
    token: '--radius-md',
    formula: 'radius − 2px',
    use: 'Default for square-cornered controls.',
  },
  {
    className: 'rounded-lg',
    token: '--radius-lg',
    formula: 'radius',
    use: 'The base value. Panels and grouped chrome.',
  },
  {
    className: 'rounded-xl',
    token: '--radius-xl',
    formula: 'radius + 4px',
    use: 'Larger surfaces where the base looks mean.',
  },
];

const EXTRA_RADII = [
  {
    className: 'rounded-2xl',
    label: 'rounded-2xl',
    use: 'Cards, Textarea, Skeleton — the redesigned atoms.',
  },
  {
    className: 'rounded-full',
    label: 'rounded-full',
    use: 'Pills: Button, Badge, Input, Tooltip.',
  },
];

const SPACING_STEPS = [1, 2, 3, 4, 6, 8, 12, 16];

export const RadiusScale: Story = {
  render: () => (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap gap-6'>
        {RADII.map(radius => (
          <div key={radius.token} className='flex flex-col gap-2'>
            <div
              aria-hidden
              className={`bg-primary size-24 ${radius.className}`}
            />
            <p className='font-mono text-xs'>{radius.token}</p>
            <p className='text-muted-foreground text-xs'>{radius.formula}</p>
            <p className='text-muted-foreground max-w-[10rem] text-xs'>
              {radius.use}
            </p>
          </div>
        ))}
      </div>
      <p className='text-muted-foreground max-w-2xl text-sm'>
        {
          'One base value — --radius, 0.5rem — with the four steps computed off it. Retuning the base moves the whole scale together, which is the reason not to hardcode a corner.'
        }
      </p>
    </div>
  ),
};

export const BeyondTheScale: Story = {
  render: () => (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap gap-6'>
        {EXTRA_RADII.map(radius => (
          <div key={radius.label} className='flex flex-col gap-2'>
            <div
              aria-hidden
              className={`bg-primary size-24 ${radius.className}`}
            />
            <p className='font-mono text-xs'>{radius.label}</p>
            <p className='text-muted-foreground max-w-[10rem] text-xs'>
              {radius.use}
            </p>
          </div>
        ))}
      </div>
      <p className='text-muted-foreground max-w-2xl text-sm'>
        {
          'The redesigned atoms reach past the derived scale on purpose: pills for anything you press, and a generous 2xl for content surfaces. These are Tailwind defaults rather than project tokens, which is worth knowing — they do not move when --radius does.'
        }
      </p>
    </div>
  ),
};

export const SpacingScale: Story = {
  render: () => (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-col gap-3'>
        {SPACING_STEPS.map(step => (
          <div key={step} className='flex items-center gap-4'>
            <p className='text-muted-foreground w-16 font-mono text-xs'>
              {`p-${step}`}
            </p>
            <div
              aria-hidden
              className='bg-primary h-4'
              style={{ width: `calc(var(--spacing) * ${step})` }}
            />
            <p className='text-muted-foreground font-mono text-xs'>
              {`${step * 0.25}rem`}
            </p>
          </div>
        ))}
      </div>
      <p className='text-muted-foreground max-w-2xl text-sm'>
        {
          'A 0.25rem base unit, so every step is a multiple of 4px. Gaps, padding and margins all draw from this one rhythm — a 5px gap is not a small deviation, it is a step off the grid.'
        }
      </p>
    </div>
  ),
};

// Written out rather than built from a template literal: Tailwind scans source
// text, so `gap-${step}` produces a class that is never emitted.
const GAP_EXAMPLES = [
  { label: 'gap-2', className: 'flex gap-2' },
  { label: 'gap-4', className: 'flex gap-4' },
  { label: 'gap-6', className: 'flex gap-6' },
];

export const SpacingInPractice: Story = {
  render: () => (
    <div className='flex flex-col gap-6'>
      {GAP_EXAMPLES.map(example => (
        <div key={example.label} className='flex flex-col gap-2'>
          <p className='text-muted-foreground font-mono text-xs'>
            {example.label}
          </p>
          <div className={example.className}>
            {[0, 1, 2, 3].map(i => (
              <div
                key={i}
                aria-hidden
                className='bg-muted size-12 rounded-lg'
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  ),
};

/** The matrix: the radius scale against a run of spacing steps. */
export const AllRadiusAndSpacing: Story = {
  render: () => (
    <div className='flex flex-col gap-8'>
      <div className='flex flex-wrap items-end gap-4'>
        {[
          ...RADII.map(r => r.className),
          ...EXTRA_RADII.map(r => r.className),
        ].map(className => (
          <div key={className} className='flex flex-col gap-1'>
            <div aria-hidden className={`bg-primary size-16 ${className}`} />
            <p className='text-muted-foreground font-mono text-[10px]'>
              {className}
            </p>
          </div>
        ))}
      </div>
      <div className='flex items-end gap-2'>
        {SPACING_STEPS.map(step => (
          <div key={step} className='flex flex-col items-center gap-1'>
            <div
              aria-hidden
              className='bg-primary w-4'
              style={{ height: `calc(var(--spacing) * ${step})` }}
            />
            <p className='text-muted-foreground font-mono text-[10px]'>
              {step}
            </p>
          </div>
        ))}
      </div>
    </div>
  ),
};
