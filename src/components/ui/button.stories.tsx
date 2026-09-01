import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { expect, userEvent, within } from 'storybook/test';
import { Button } from '@/components/ui/button';
import { Search, Download, Heart, Settings, Loader2 } from '@/lib/icons';

// One list per axis, used by both the controls and the matrix stories below.
// Written out rather than derived: `cva` keeps its variant config private, so
// there is nothing to read back off `buttonVariants` at runtime. Keeping one
// copy per file at least means adding a variant is two edits (here and the cva
// definition) rather than three.
const VARIANTS = [
  'default',
  'destructive',
  'outline',
  'enhanced-outline',
  'secondary',
  'ghost',
  'link',
] as const;

const SIZES = ['xs', 'sm', 'default', 'lg', 'icon'] as const;

const meta: Meta<typeof Button> = {
  title: 'Atoms/Button',
  component: Button,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'The interactive primitive. Seven variants, five sizes, one shape. Every variant carries a border width from the base so the invalid state can paint, and the transition names its properties rather than animating `all`.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: { type: 'select' },
      options: VARIANTS,
      description: 'The visual style variant of the button',
    },
    size: {
      control: { type: 'select' },
      options: SIZES,
      description: 'The size of the button',
    },
    disabled: {
      control: { type: 'boolean' },
      description: 'Whether the button is disabled',
    },
    asChild: {
      control: { type: 'boolean' },
      description: 'Whether to render as a child component using Radix Slot',
    },
    children: {
      control: { type: 'text' },
      description: 'The content inside the button',
    },
  },
  args: {
    children: 'Button',
    disabled: false,
    asChild: false,
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Basic Variants
export const Default: Story = {
  args: {
    variant: 'default',
    children: 'Default Button',
  },
};

export const Secondary: Story = {
  args: {
    variant: 'secondary',
    children: 'Secondary Button',
  },
};

export const Outline: Story = {
  args: {
    variant: 'outline',
    children: 'Outline Button',
  },
};

export const EnhancedOutline: Story = {
  args: {
    variant: 'enhanced-outline',
    children: 'Enhanced Outline Button',
  },
};

export const Ghost: Story = {
  args: {
    variant: 'ghost',
    children: 'Ghost Button',
  },
};

export const Link: Story = {
  args: {
    variant: 'link',
    children: 'Link Button',
  },
};

export const Destructive: Story = {
  args: {
    variant: 'destructive',
    children: 'Destructive Button',
  },
};

// Sizes
export const ExtraSmall: Story = {
  args: {
    size: 'xs',
    children: 'Extra Small',
  },
};

export const Small: Story = {
  args: {
    size: 'sm',
    children: 'Small Button',
  },
};

export const Large: Story = {
  args: {
    size: 'lg',
    children: 'Large Button',
  },
};

export const Icon: Story = {
  args: {
    size: 'icon',
    children: <Settings />,
    'aria-label': 'Settings',
  },
};

// States
export const Disabled: Story = {
  args: {
    disabled: true,
    children: 'Disabled Button',
  },
};

export const Loading: Story = {
  args: {
    disabled: true,
    children: (
      <>
        <Loader2 className='animate-spin' />
        Loading...
      </>
    ),
  },
  parameters: {
    docs: {
      description: {
        story:
          'The spinner is `Loader2` from the icon module, not a hand-rolled `border-b-2` circle — a thick partial border on a round element is the one anti-pattern this file used to ship.',
      },
    },
  },
};

// With Icons
export const WithIcon: Story = {
  args: {
    children: (
      <>
        <Search />
        {'Search'}
      </>
    ),
  },
};

export const IconOnly: Story = {
  args: {
    size: 'icon',
    children: <Heart />,
    'aria-label': 'Like',
  },
};

export const WithTrailingIcon: Story = {
  args: {
    children: (
      <>
        {'Download'}
        <Download />
      </>
    ),
  },
};

// All Variants Grid
export const AllVariants: Story = {
  render: () => (
    <div className='grid grid-cols-2 gap-4 w-full max-w-2xl'>
      {VARIANTS.map(variant => (
        <Button key={variant} variant={variant}>
          {variant}
        </Button>
      ))}
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'All available button variants displayed in a grid layout.',
      },
    },
  },
};

// All Sizes Grid
export const AllSizes: Story = {
  render: () => (
    <div className='flex flex-wrap items-center gap-4'>
      <Button size='xs'>{'xs'}</Button>
      <Button size='sm'>{'sm'}</Button>
      <Button size='default'>{'default'}</Button>
      <Button size='lg'>{'lg'}</Button>
      <Button size='icon' aria-label='Settings'>
        <Settings />
      </Button>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The ramp is 28/32/44/48 below `sm:` and 32/32/44/48 above it — `xs` is the only size with a responsive step, and it meets `sm` on desktop rather than crossing it.',
      },
    },
  },
};

export const LongLabel: Story = {
  name: 'Long label, real locale',
  render: () => (
    <div className='flex flex-col items-start gap-3'>
      <Button>{'Zum Aktualisieren neu laden'}</Button>
      <Button variant='outline' size='sm'>
        {'Was lohnt sich jetzt zu sammeln?'}
      </Button>
      <Button size='xs' variant='secondary'>
        {'Zum Aktualisieren neu laden'}
      </Button>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Real German strings from the shipped locale, at three sizes. The base is `whitespace-nowrap`, so a label cannot wrap — it widens the button instead, which is what the layout has to absorb.',
      },
    },
  },
};

// The two claims this file used to make and could not keep
export const LinkIsNotGhost: Story = {
  name: 'link is not ghost',
  render: () => (
    <div className='flex flex-col items-start gap-3'>
      <Button variant='ghost' data-testid='btn-ghost'>
        {'ghost'}
      </Button>
      <Button variant='link' data-testid='btn-link'>
        {'link'}
      </Button>
      <p className='text-muted-foreground max-w-xl text-sm'>
        {
          'These two used to be the same button. Both spelled their label text-primary, which globals.scss redefined as --foreground, so both computed Ink over a transparent fill with no underline — identical at rest, telling apart only on hover. link now carries the brand text step and a standing underline, because colour alone is not an accessible link affordance.'
        }
      </p>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const ghost = canvas.getByTestId('btn-ghost');
    const link = canvas.getByTestId('btn-link');

    // The claim: they differ at rest, on both axes, in whichever theme the
    // story is rendered in.
    await expect(getComputedStyle(link).color).not.toBe(
      getComputedStyle(ghost).color
    );
    await expect(getComputedStyle(link).textDecorationLine).toBe('underline');
    await expect(getComputedStyle(ghost).textDecorationLine).toBe('none');
  },
  parameters: {
    docs: {
      description: {
        story:
          'Asserts the two variants are distinguishable without hovering. See Foundations → Colour for why the label uses --primary-text rather than --primary.',
      },
    },
  },
};

export const Invalid: Story = {
  name: 'Invalid form trigger',
  render: () => (
    <div className='flex flex-col items-start gap-3'>
      <Button variant='outline' aria-invalid data-testid='invalid-outline'>
        {'Choose a region'}
      </Button>
      <Button variant='ghost' aria-invalid data-testid='invalid-ghost'>
        {'Choose a region'}
      </Button>
      <p className='text-muted-foreground max-w-xl text-sm'>
        {
          'The one place a button carries a validity state: a control that stands in for an unfilled field. The base declares a border width, so aria-invalid has something to colour — with border-0 on five of seven variants it resolved --destructive and painted nothing, and on the two bordered ones dark:border-primary won and drew the error in the brand green. The contract across all seven variants is enforced in src/test/border.test.ts, on the source rather than on a render.'
        }
      </p>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // ghost, not outline: outline already carries a stroke colour, so it would
    // pass this whether the invalid state painted or not.
    const el = canvas.getByTestId('invalid-ghost');
    const style = getComputedStyle(el);
    await expect(parseFloat(style.borderTopWidth)).toBeGreaterThan(0);
    await expect(style.borderTopColor).not.toBe('rgba(0, 0, 0, 0)');
    await expect(style.borderTopColor).not.toBe('oklab(0 0 0 / 0)');
  },
};

export const FocusRing: Story = {
  name: 'Focus ring',
  render: () => (
    <div className='flex items-center gap-4'>
      <Button variant='default'>{'default'}</Button>
      <Button variant='outline'>{'outline'}</Button>
      <Button variant='ghost'>{'ghost'}</Button>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.tab();
    const focused = canvas.getByRole('button', { name: 'default' });
    await expect(focused).toHaveFocus();
    // .focus-ring paints an outline; the browser default would be `auto`.
    const style = getComputedStyle(focused);
    await expect(style.outlineStyle).toBe('solid');
    await expect(parseFloat(style.outlineWidth)).toBeGreaterThan(0);
  },
  parameters: {
    docs: {
      description: {
        story:
          'Keyboard focus comes from `.focus-ring` on `:focus-visible`, so a pointer press paints nothing. The ring is `--ring`, which sits outside the button on a 2px offset and therefore measures against the page, not against the fill.',
      },
    },
  },
};

// Radius scale
export const RadiusScale: Story = {
  name: 'Radius is not a knob',
  render: () => (
    <div className='flex flex-col gap-4'>
      <div className='flex items-center gap-4'>
        <Button size='sm'>{'sm'}</Button>
        <Button>{'default'}</Button>
        <Button size='lg'>{'lg'}</Button>
        <Button variant='secondary'>{'secondary'}</Button>
        <Button variant='enhanced-outline'>{'enhanced-outline'}</Button>
      </div>
      <p className='text-muted-foreground max-w-xl text-sm'>
        {
          'Every size, every variant, one shape. The --radius-* scale is for structural surfaces, not for buttons — a button is a pill, decided once in the cva base. This story used to apply rounded-sm/md/lg/xl here, which worked (tailwind-merge lets a className override win) and was exactly the habit that left secondary, enhanced-outline and link shipping as 6px rectangles.'
        }
      </p>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Radius does not vary by size or variant. See Foundations → Radius and spacing.',
      },
    },
  },
};
