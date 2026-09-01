import type { Meta, StoryObj } from '@storybook/tanstack-react';

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
          'The three families, the size scale and the weights, rendered as live specimens.',
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
    token: '--font-mono',
    className: 'font-mono',
    name: 'Source Code Pro',
    role: 'Token names, coordinates, anything that must align by column.',
  },
];

// xs through 4xl, which is exactly the range the application uses. `text-5xl`
// used to sit at the end of this list and appeared on no screen; `text-6xl`
// appears once, sizing an emoji in an empty state, which is an icon problem
// rather than a type step.
const SCALE = [
  { className: 'text-xs', name: 'text-xs' },
  { className: 'text-sm', name: 'text-sm' },
  { className: 'text-base', name: 'text-base' },
  { className: 'text-lg', name: 'text-lg' },
  { className: 'text-xl', name: 'text-xl' },
  { className: 'text-2xl', name: 'text-2xl' },
  { className: 'text-3xl', name: 'text-3xl' },
  { className: 'text-4xl', name: 'text-4xl' },
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
      <div className='flex flex-col gap-3'>
        <p className='text-muted-foreground type-micro'>
          {'Space Grotesk — the missing 400'}
        </p>
        <div className='flex flex-col gap-0.5'>
          <p className='font-display text-xl font-normal'>{SPECIMEN}</p>
          <p className='text-muted-foreground font-mono text-xs'>
            {'font-normal (400) — renders as 500'}
          </p>
        </div>
      </div>
      <p className='text-muted-foreground max-w-2xl text-sm'>
        {
          'Only the weights listed here are bundled, and asking for one that is not does nothing visible. The two lines above are the same drawing: Space Grotesk has no 400, so font-normal resolves to the 500 face — CSS Fonts 4 §5.2 checks 500 first for a desired weight of 400. Measured at 40px, the specimen string is 665.30px wide at both 400 and 500, against 728.47px at 600. It is a silent no-op, not a synthesised approximation, which is why headings set 600 explicitly in the base layer.'
        }
      </p>
    </div>
  ),
};

export const Headings: Story = {
  render: () => (
    <div className='flex flex-col gap-4'>
      <h1>{'h1 — display, 36px / 600'}</h1>
      <h2>{'h2 — headline, 30px / 600'}</h2>
      <h3>{'h3 — title, 20px / 600'}</h3>
      <h4>{'h4 — no rule: body face, inherited size'}</h4>
      <p className='text-muted-foreground max-w-2xl text-sm'>
        {
          'None of the four carries a class. h1 through h3 take face, size, weight and leading from the base layer, so a heading needs no classes to be a heading. They used to take only the face — size and weight were left inherited, which made a bare h1 a 16px, weight-400 line indistinguishable from the paragraph beside it while this page documented a size mapping no rule implemented.'
        }
      </p>
      <p className='text-muted-foreground max-w-2xl text-sm'>
        {
          'h4 gets no rule on purpose: below the third level a heading is functionally a label, so it stays on the body face at the inherited size and sets its own if it needs one.'
        }
      </p>
    </div>
  ),
};

/** The matrix: every family against every step of the scale. */
export const MicroLabel: Story = {
  render: () => (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-col gap-3'>
        <p className='type-micro text-muted-foreground'>
          {'Habitat — on paper'}
        </p>
        <p className='type-micro text-status-warning-text'>
          {'Check before eating — on a warning'}
        </p>
      </div>
      <p className='text-muted-foreground max-w-2xl text-sm'>
        {
          'DESIGN.md names a micro role at 12px / 500; nothing implemented it, so seven sites hand-rolled it seven ways — 10px and 11px, medium and semibold, tracking-wide and tracking-[0.18em]. .type-micro is the one definition: 12px, 500, 0.06em, uppercase. It sets no colour, because these labels sit on paper, on glass and on a warning fill, so the caller pairs it with the right foreground token.'
        }
      </p>
      <p className='text-muted-foreground max-w-2xl text-sm'>
        {
          'It is also why the scale needs no step below text-xs: eleven sites reached for 10px not because 12px was too big but because the 12px role had no name. Four of them also carried text-muted-foreground/60, which measures 2.42:1 on paper — under even the 3:1 non-text floor. The role is already quiet at 12px, 500 and uppercase; the extra alpha only broke it, so the muted token is used at full strength.'
        }
      </p>
    </div>
  ),
};

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
