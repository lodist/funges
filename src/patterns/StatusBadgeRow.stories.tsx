import type { Meta, StoryObj } from '@storybook/react-vite';
import { Badge } from '@/components/ui/badge';
import { Check, Clock, Info, Leaf, ChefHat } from 'lucide-react';

/**
 * Pattern: status and category badge row.
 *
 * A run of badges that mixes one *status* — a changing, computed value — with
 * one or more *category* labels, which are fixed properties of the thing.
 * Rendered on the worth-foraging-now, species and recipes screens.
 *
 * The convention worth documenting is the ordering and the variant split:
 * status first and in the filled variant, categories after it in the quieter
 * ones. Reversing that makes a fixed label shout louder than the value that
 * actually changed.
 */

const meta: Meta = {
  title: 'Molecules/Status and category badge row',
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A status badge followed by category badges. Rendered on the worth-foraging-now, species and recipes screens.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className='flex flex-wrap gap-2'>
      <Badge>{'High confidence'}</Badge>
      <Badge variant='secondary'>{'Mushroom'}</Badge>
      <Badge variant='outline'>{'Autumn'}</Badge>
    </div>
  ),
};

export const WithIcons: Story = {
  render: () => (
    <div className='flex flex-wrap gap-2'>
      <Badge>
        <Check />
        {'High confidence'}
      </Badge>
      <Badge variant='secondary'>
        <Leaf />
        {'Mushroom'}
      </Badge>
      <Badge variant='outline'>
        <Clock />
        {'Autumn'}
      </Badge>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Badge sizes its own icons at 12px, so an icon child needs no size class. The icons are decorative — the badge text is what carries the meaning.',
      },
    },
  },
};

export const StatusLevels: Story = {
  render: () => (
    <div className='flex flex-col gap-4'>
      {[
        { status: 'High confidence', variant: 'default' as const },
        { status: 'Moderate confidence', variant: 'secondary' as const },
        { status: 'Low confidence', variant: 'outline' as const },
      ].map(level => (
        <div key={level.status} className='flex flex-wrap gap-2'>
          <Badge variant={level.variant}>{level.status}</Badge>
          <Badge variant='secondary'>{'Mushroom'}</Badge>
          <Badge variant='outline'>{'Autumn'}</Badge>
        </div>
      ))}
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Confidence steps down through the variants rather than through a change of colour. That is the palette rule showing through: severity and emphasis are depth, not hue — there is no red badge to reach for.',
      },
    },
  },
};

export const CategoriesOnly: Story = {
  render: () => (
    <div className='flex flex-wrap gap-2'>
      <Badge variant='secondary'>
        <ChefHat />
        {'30 min'}
      </Badge>
      <Badge variant='outline'>{'Four servings'}</Badge>
      <Badge variant='outline'>{'Vegetarian'}</Badge>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'A row with no status in it — the recipes screen has nothing computed to report, so every badge is a fixed property and none takes the filled variant.',
      },
    },
  },
};

export const Overflowing: Story = {
  render: () => (
    <div className='flex w-64 flex-wrap gap-2'>
      <Badge>{'High confidence'}</Badge>
      <Badge variant='secondary'>{'Mushroom'}</Badge>
      <Badge variant='outline'>{'Autumn'}</Badge>
      <Badge variant='outline'>{'Beech woodland'}</Badge>
      <Badge variant='outline'>{'North slope'}</Badge>
      <Badge variant='outline'>{'After rain'}</Badge>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The row wraps rather than scrolling or truncating. Badges do not shrink — each keeps its text on one line — so a narrow container gets more rows, not smaller pills.',
      },
    },
  },
};

export const AllVariants: Story = {
  render: () => (
    <div className='flex flex-col gap-6'>
      {[
        {
          label: 'status + categories',
          content: (
            <>
              <Badge>{'High confidence'}</Badge>
              <Badge variant='secondary'>{'Mushroom'}</Badge>
              <Badge variant='outline'>{'Autumn'}</Badge>
            </>
          ),
        },
        {
          label: 'with icons',
          content: (
            <>
              <Badge>
                <Check />
                {'High confidence'}
              </Badge>
              <Badge variant='secondary'>
                <Leaf />
                {'Mushroom'}
              </Badge>
              <Badge variant='outline'>
                <Info />
                {'Autumn'}
              </Badge>
            </>
          ),
        },
        {
          label: 'categories only',
          content: (
            <>
              <Badge variant='secondary'>{'30 min'}</Badge>
              <Badge variant='outline'>{'Four servings'}</Badge>
            </>
          ),
        },
      ].map(row => (
        <div key={row.label} className='flex flex-col gap-2'>
          <p className='text-muted-foreground font-mono text-xs'>{row.label}</p>
          <div className='flex flex-wrap gap-2'>{row.content}</div>
        </div>
      ))}
    </div>
  ),
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        story: 'Every arrangement of the row in use, in one view.',
      },
    },
  },
};
