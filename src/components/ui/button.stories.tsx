import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '@/components/ui/button';
import { Search, Download, Heart, Settings } from 'lucide-react';

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

const SIZES = ['default', 'sm', 'lg', 'icon'] as const;

const meta: Meta<typeof Button> = {
  title: 'Atoms/Button',
  component: Button,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A versatile button component with multiple variants, sizes, and states. Built on top of Radix UI primitives with full accessibility support.',
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
        <div className='animate-spin rounded-full h-4 w-4 border-b-2 border-current' />
        Loading...
      </>
    ),
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

// Interactive Examples
export const Interactive: Story = {
  args: {
    children: 'Click me!',
    onClick: () => alert('Button clicked!'),
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
    <div className='flex items-center gap-4'>
      <Button size='sm'>{'Small'}</Button>
      <Button size='default'>{'Default'}</Button>
      <Button size='lg'>{'Large'}</Button>
      <Button size='icon' aria-label='Settings'>
        <Settings />
      </Button>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'All available button sizes displayed in a row.',
      },
    },
  },
};

// With Different Content
export const WithLongText: Story = {
  args: {
    children: 'This is a button with very long text that might wrap',
  },
};

export const WithEmoji: Story = {
  args: {
    children: '🚀 Launch App',
  },
};

export const WithHTML: Story = {
  args: {
    children: (
      <>
        <strong>{'Bold'}</strong> {'and'} <em>{'italic'}</em> {'text'}
      </>
    ),
  },
};

// Radius scale
export const RadiusScale: Story = {
  render: () => (
    <div className='flex items-center gap-4'>
      <Button className='rounded-sm'>{'sm'}</Button>
      <Button className='rounded-md'>{'md'}</Button>
      <Button className='rounded-lg'>{'lg'}</Button>
      <Button className='rounded-xl'>{'xl'}</Button>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The --radius-* scale from index.css applied to the button corners.',
      },
    },
  },
};
