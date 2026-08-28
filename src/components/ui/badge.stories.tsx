import React from 'react';
import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { Badge } from '@/components/ui/badge';
import { CATEGORIES, categoryVar } from '@/lib/categoryColor';
import {
  Check,
  X,
  AlertTriangle,
  Info,
  Star,
  Heart,
  Download,
} from '@/lib/icons';

// One list, used by both the controls and the matrix story below. `cva` keeps
// its variant config private at runtime, so there is nothing to read back off
// `badgeVariants` — but keeping a single copy per file means adding a variant
// is two edits rather than three.
const VARIANTS = [
  'default',
  'secondary',
  'destructive',
  'outline',
  'warning',
  'success',
  'info',
] as const;

const meta: Meta<typeof Badge> = {
  title: 'Atoms/Badge',
  component: Badge,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A small pill for status, labels and counts. Renders a span; asChild swaps in a Radix Slot so a link can carry the same treatment.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: { type: 'select' },
      options: VARIANTS,
      description: 'The visual style variant of the badge',
    },
    asChild: {
      control: { type: 'boolean' },
      description: 'Whether to render as a child component using Radix Slot',
    },
    children: {
      control: { type: 'text' },
      description: 'The content inside the badge',
    },
  },
  args: {
    children: 'Badge',
    variant: 'default',
    asChild: false,
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Basic Variants
export const Default: Story = {
  args: {
    variant: 'default',
    children: 'Default Badge',
  },
};

export const Secondary: Story = {
  args: {
    variant: 'secondary',
    children: 'Secondary Badge',
  },
};

export const Destructive: Story = {
  args: {
    variant: 'destructive',
    children: 'Destructive Badge',
  },
};

export const Outline: Story = {
  args: {
    variant: 'outline',
    children: 'Outline Badge',
  },
};

// With Icons
export const WithLeadingIcon: Story = {
  args: {
    children: (
      <>
        <Check />
        {'Success'}
      </>
    ),
  },
};

export const WithTrailingIcon: Story = {
  args: {
    children: (
      <>
        {'Downloads'}
        <Download />
      </>
    ),
  },
};

export const IconOnly: Story = {
  args: {
    children: <Star />,
    // Badge renders a plain <span>, and aria-label is prohibited on an
    // element with no role. role='img' is what makes the label legal — and
    // an icon-only badge genuinely is an image with a text alternative.
    role: 'img',
    'aria-label': 'Featured',
  },
};

// Status Badges
export const StatusBadges: Story = {
  render: () => (
    <div className='flex flex-wrap gap-2'>
      <Badge variant='default'>
        <Check />
        {'Active'}
      </Badge>
      <Badge variant='secondary'>
        <Info />
        {'Pending'}
      </Badge>
      <Badge variant='destructive'>
        <X />
        {'Failed'}
      </Badge>
      <Badge variant='outline'>
        <AlertTriangle />
        {'Warning'}
      </Badge>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Common status badges with appropriate icons and colors.',
      },
    },
  },
};

// Count Badges
export const CountBadges: Story = {
  render: () => (
    <div className='flex flex-wrap gap-2'>
      <Badge>12</Badge>
      <Badge variant='secondary'>99+</Badge>
      <Badge variant='destructive'>3</Badge>
      <Badge variant='outline'>1,234</Badge>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Badges used for displaying counts and numbers.',
      },
    },
  },
};

// Category Badges
export const CategoryBadges: Story = {
  render: () => (
    <div className='flex flex-wrap gap-2'>
      {CATEGORIES.map(category => (
        <Badge
          key={category}
          variant='outline'
          style={{ borderColor: categoryVar(category) }}
        >
          {category}
        </Badge>
      ))}
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The five species categories, coloured through categoryVar(). The colour sits on the stroke, not the label: the ramp bottoms out at 3.93:1 (nut, light) and 3.77:1 (mushroom, dark), which clears the 3:1 non-text floor but not the 4.5:1 text one.',
      },
    },
  },
};

// Interactive Badges
export const Interactive: Story = {
  render: () => {
    const [isLiked, setIsLiked] = React.useState(false);
    const [count, setCount] = React.useState(42);

    return (
      <div className='flex flex-wrap gap-2'>
        <Badge asChild>
          <button
            type='button'
            className='cursor-pointer hover:opacity-80'
            onClick={() => setIsLiked(!isLiked)}
          >
            <Heart className={isLiked ? 'fill-current' : ''} />
            {isLiked ? 'Liked' : 'Like'}
          </button>
        </Badge>
        <Badge asChild variant='secondary'>
          <button
            type='button'
            className='cursor-pointer hover:opacity-80'
            onClick={() => setCount(count + 1)}
          >
            <Star />
            {count} {'stars'}
          </button>
        </Badge>
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story: 'Interactive badges that respond to user clicks.',
      },
    },
  },
};

// In Context Examples
export const InCard: Story = {
  render: () => (
    <div className='border rounded-lg p-4 w-80'>
      <div className='flex items-start justify-between mb-2'>
        <h3 className='font-semibold'>{'Project Status'}</h3>
        <Badge variant='default'>
          <Check />
          {'Complete'}
        </Badge>
      </div>
      <p className='text-sm text-muted-foreground mb-3'>
        {'This project has been successfully completed and deployed.'}
      </p>
      <div className='flex flex-wrap gap-1'>
        <Badge variant='secondary'>{'React'}</Badge>
        <Badge variant='secondary'>{'TypeScript'}</Badge>
        <Badge variant='secondary'>{'Tailwind'}</Badge>
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Badges used within a card component to show status and tags.',
      },
    },
  },
};

export const InNotification: Story = {
  render: () => (
    <div className='border rounded-lg p-4 w-80'>
      <div className='flex items-center gap-3'>
        <div className='w-10 h-10 bg-muted rounded-full flex items-center justify-center'>
          <span className='text-primary-text font-semibold'>U</span>
        </div>
        <div className='flex-1'>
          <div className='flex items-center gap-2'>
            <span className='font-medium'>{'User Update'}</span>
            <Badge variant='destructive'>{'New'}</Badge>
          </div>
          <p className='text-sm text-muted-foreground'>
            {'A new user has joined the platform.'}
          </p>
        </div>
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Badge used in a notification to indicate new content.',
      },
    },
  },
};

export const InTable: Story = {
  render: () => (
    <div className='border rounded-lg w-full max-w-md'>
      <table className='w-full'>
        <thead>
          <tr className='border-b'>
            <th className='text-left p-3'>{'Species'}</th>
            <th className='text-left p-3'>{'Status'}</th>
            <th className='text-left p-3'>{'Category'}</th>
          </tr>
        </thead>
        <tbody>
          <tr className='border-b'>
            <td className='p-3'>{'Pfifferling'}</td>
            <td className='p-3'>
              <Badge variant='default'>
                <Check />
                {'In season'}
              </Badge>
            </td>
            <td className='p-3'>
              <Badge variant='secondary'>{'Mushroom'}</Badge>
            </td>
          </tr>
          <tr className='border-b'>
            <td className='p-3'>{'Holunderblüte'}</td>
            <td className='p-3'>
              <Badge variant='warning'>{'Ending soon'}</Badge>
            </td>
            <td className='p-3'>
              <Badge variant='secondary'>{'Flower'}</Badge>
            </td>
          </tr>
          <tr>
            <td className='p-3'>{'Fliegenpilz'}</td>
            <td className='p-3'>
              <Badge variant='destructive'>
                <X />
                {'Toxic'}
              </Badge>
            </td>
            <td className='p-3'>
              <Badge variant='secondary'>{'Mushroom'}</Badge>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Badges used in a table to show status and roles.',
      },
    },
  },
};

// All Variants Grid
export const AllVariants: Story = {
  render: () => (
    <div className='grid grid-cols-2 gap-4 w-full max-w-md'>
      {VARIANTS.map(variant => (
        <div key={variant} className='space-y-2'>
          <h4 className='font-medium'>{variant}</h4>
          <Badge variant={variant}>{variant}</Badge>
        </div>
      ))}
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'All available badge variants displayed in a grid.',
      },
    },
  },
};

// Long Text Handling
export const LongText: Story = {
  render: () => (
    <div className='w-40 border border-dashed border-border p-2'>
      <Badge variant='secondary'>{'Herbsttrompete-Verwechslungsgefahr'}</Badge>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The badge never wraps. Past a narrow container the label truncates with an ellipsis and the pill keeps its padding, rather than growing out of the layout. A short label is still sized to its content.',
      },
    },
  },
};
