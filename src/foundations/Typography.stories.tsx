import type { Meta, StoryObj } from '@storybook/react-vite';

/**
 * Foundations specimens for typography.
 *
 * These render in the shipped typefaces because the Storybook preview imports
 * the same `@fontsource` faces the application entrypoint does. Whether the
 * faces actually loaded is the one thing this seam cannot confirm — a fallback
 * face still renders, and renders green. That check is a human's.
 */

const meta: Meta = {
  // The specimens are documentation, not components: `!dev` keeps them out of
  // the sidebar as standalone entries so the tier reads as six prose pages,
  // which is what the spec asked Foundations to be. The `test` tag is
  // untouched, so they still run in the Storybook Vitest project, and the
  // `.mdx` page still renders each one via `<Story of={...} />`.
  tags: ['!dev'],
  title: 'Foundations/Typography',
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'The four families, the size scale and the weights, rendered as live specimens.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

const FAMILIES = [
  {
    token: '--font-sans',
    className: 'font-sans',
    name: 'Public Sans',
    role: 'Body text, labels, controls. The default on every element.',
  },
  {
    token: '--font-display',
    className: 'font-display',
    name: 'Space Grotesk',
    role: 'Headings. Applied automatically to h1, h2 and h3.',
  },
  {
    token: '--font-serif',
    className: 'font-serif',
    name: 'Merriweather',
    role: 'Reserved. Nothing in the application uses it yet.',
  },
  {
    token: '--font-mono',
    className: 'font-mono',
    name: 'Source Code Pro',
    role: 'Token names, coordinates, anything that must align by column.',
  },
];

const SCALE = [
  { className: 'text-xs', name: 'text-xs' },
  { className: 'text-sm', name: 'text-sm' },
  { className: 'text-base', name: 'text-base' },
  { className: 'text-lg', name: 'text-lg' },
  { className: 'text-xl', name: 'text-xl' },
  { className: 'text-2xl', name: 'text-2xl' },
  { className: 'text-3xl', name: 'text-3xl' },
  { className: 'text-4xl', name: 'text-4xl' },
  { className: 'text-5xl', name: 'text-5xl' },
];

const SANS_WEIGHTS = [
  { className: 'font-normal', name: 'font-normal (400)' },
  { className: 'font-medium', name: 'font-medium (500)' },
  { className: 'font-semibold', name: 'font-semibold (600)' },
  { className: 'font-bold', name: 'font-bold (700)' },
];

const SPECIMEN = 'Chanterelles fruit after warm autumn rain';

export const Families: Story = {
  render: () => (
    <div className='flex flex-col gap-8'>
      {FAMILIES.map(family => (
        <div key={family.token} className='flex flex-col gap-1'>
          <p className={`${family.className} text-3xl`}>{SPECIMEN}</p>
          <p className='font-mono text-xs'>{family.token}</p>
          <p className='text-muted-foreground text-sm'>
            {family.name}
            {' — '}
            {family.role}
          </p>
        </div>
      ))}
    </div>
  ),
};

export const Scale: Story = {
  render: () => (
    <div className='flex flex-col gap-4'>
      {SCALE.map(step => (
        <div key={step.name} className='flex flex-col gap-0.5'>
          <p className={step.className}>{SPECIMEN}</p>
          <p className='text-muted-foreground font-mono text-xs'>{step.name}</p>
        </div>
      ))}
    </div>
  ),
};

export const Weights: Story = {
  render: () => (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-col gap-3'>
        <p className='text-muted-foreground text-xs font-medium tracking-wide uppercase'>
          {'Public Sans — body'}
        </p>
        {SANS_WEIGHTS.map(weight => (
          <div key={weight.name} className='flex flex-col gap-0.5'>
            <p className={`font-sans text-xl ${weight.className}`}>
              {SPECIMEN}
            </p>
            <p className='text-muted-foreground font-mono text-xs'>
              {weight.name}
            </p>
          </div>
        ))}
      </div>
      <div className='flex flex-col gap-3'>
        <p className='text-muted-foreground text-xs font-medium tracking-wide uppercase'>
          {'Space Grotesk — display'}
        </p>
        {SANS_WEIGHTS.filter(w => w.className !== 'font-normal').map(weight => (
          <div key={weight.name} className='flex flex-col gap-0.5'>
            <p className={`font-display text-xl ${weight.className}`}>
              {SPECIMEN}
            </p>
            <p className='text-muted-foreground font-mono text-xs'>
              {weight.name}
            </p>
          </div>
        ))}
      </div>
      <p className='text-muted-foreground max-w-2xl text-sm'>
        {
          'Only the weights listed here are bundled. Asking for one that is not — font-light, or font-normal on the display face — silently synthesises it from the nearest available weight, which looks subtly wrong rather than obviously broken.'
        }
      </p>
    </div>
  ),
};

export const Headings: Story = {
  render: () => (
    <div className='flex flex-col gap-4'>
      <h1 className='text-4xl'>{'h1 — the display face, automatically'}</h1>
      <h2 className='text-3xl'>{'h2 — same, one step down'}</h2>
      <h3 className='text-2xl'>{'h3 — the last level that switches face'}</h3>
      <h4 className='text-xl'>{'h4 — falls back to the body face'}</h4>
      <p className='text-muted-foreground max-w-2xl text-sm'>
        {
          'h1 through h3 pick up the display face from a base-layer rule, so a heading does not need a font class. h4 and below stay on the body face deliberately: below the third level a heading is a label, not a title.'
        }
      </p>
    </div>
  ),
};

/** The matrix: every family against every step of the scale. */
export const AllTypography: Story = {
  render: () => (
    <div className='flex flex-col gap-10'>
      {FAMILIES.map(family => (
        <div key={family.token} className='flex flex-col gap-2'>
          <p className='text-muted-foreground font-mono text-xs'>
            {family.token}
          </p>
          {SCALE.map(step => (
            <p
              key={step.name}
              className={`${family.className} ${step.className}`}
            >
              {SPECIMEN}
            </p>
          ))}
        </div>
      ))}
    </div>
  ),
};
